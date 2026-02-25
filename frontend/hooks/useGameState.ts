"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  GRID_CELLS,
  CELL_EMPTY,
  CELL_WALL,
  CELL_BLOCK,
  CELL_BOMB,
  CELL_EXPLOSION,
  CELL_LOOT,
  CELL_POWERUP,
  SPAWN_POSITIONS,
  STATUS_ACTIVE,
  STATUS_FINISHED,
  DIR_UP,
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
} from "@/lib/constants";
import type {
  FullGameState,
  GameConfig,
  GridState,
  PlayerState,
} from "@/lib/types";
import * as gameService from "@/lib/gameService";
import { derivePlayerPda } from "@/lib/gameService";
import { connectToGame, type GameConnection } from "@/lib/backendWs";

// ─── Types ────────────────────────────────────────────────

export interface LiveModeConfig {
  gamePda: PublicKey;
  maxPlayers: number;
  localPlayerIndex?: number;
  wallet: {
    publicKey: PublicKey;
    signTransaction?: (tx: import("@solana/web3.js").Transaction) => Promise<import("@solana/web3.js").Transaction>;
    sendTransaction: (...args: Parameters<gameService.WalletAdapter["sendTransaction"]>) => ReturnType<gameService.WalletAdapter["sendTransaction"]>;
  };
  sessionKey?: Keypair;
}

interface UseGameStateOptions {
  mode: "mock" | "live";
  liveConfig?: LiveModeConfig;
}

interface UseGameStateReturn {
  gameState: FullGameState | null;
  localPlayerIndex: number;
  movePlayer: (direction: number) => void;
  placeBomb: () => void;
  isLoading: boolean;
  isLocalPlayerDead: boolean;
}

// ─── Spawn safe zone check (same as Rust) ─────────────────

function isSpawnSafeZone(x: number, y: number): boolean {
  const spawns: [number, number][] = [
    [1, 1],
    [11, 1],
    [1, 9],
    [11, 9],
  ];
  for (const [sx, sy] of spawns) {
    if (Math.abs(x - sx) + Math.abs(y - sy) <= 2) return true;
  }
  return false;
}

function generateGrid(): number[] {
  const cells = new Array(GRID_CELLS).fill(CELL_EMPTY);
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const idx = y * GRID_WIDTH + x;
      if (x === 0 || x === 12 || y === 0 || y === 10) {
        cells[idx] = CELL_WALL;
      } else if (x % 2 === 0 && y % 2 === 0) {
        cells[idx] = CELL_WALL;
      } else if (isSpawnSafeZone(x, y)) {
        cells[idx] = CELL_EMPTY;
      } else {
        cells[idx] = CELL_BLOCK;
      }
    }
  }
  return cells;
}

function createMockPlayer(index: number): PlayerState {
  const [x, y] = SPAWN_POSITIONS[index];
  return {
    authority: null,
    x,
    y,
    alive: true,
    collectedSol: new BN(0),
    wager: new BN(100_000_000),
    bombRange: 1,
    maxBombs: 1,
    activeBombs: 0,
    speed: 1,
    playerIndex: index,
    lastMoveSlot: new BN(0),
    kills: 0,
  };
}

function isWalkable(cell: number): boolean {
  return (
    cell === CELL_EMPTY ||
    cell === CELL_LOOT ||
    cell === CELL_POWERUP
  );
}

// ─── Hook ─────────────────────────────────────────────────

export function useGameState({ mode, liveConfig }: UseGameStateOptions): UseGameStateReturn {
  const [gameState, setGameState] = useState<FullGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localPlayerIndex, setLocalPlayerIndex] = useState(0);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<GameConnection | null>(null);
  const localPlayerFoundRef = useRef(false);
  const explosionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Optimistic movement: track pending moves so WS doesn't override local position.
  // pendingMoves counts in-flight TXs. While > 0, WS uses our optimistic x/y.
  const optimisticRef = useRef<{ x: number; y: number; pendingMoves: number }>({
    x: 0, y: 0, pendingMoves: 0,
  });
  const localPlayerIndexRef = useRef(localPlayerIndex);
  localPlayerIndexRef.current = localPlayerIndex;

  // ─── LIVE MODE: WebSocket connection ───────────────────────

  useEffect(() => {
    if (mode !== "live" || !liveConfig) return;

    const gamePdaStr = liveConfig.gamePda.toBase58();
    const matchPubkey = liveConfig.sessionKey
      ? liveConfig.sessionKey.publicKey
      : liveConfig.wallet.publicKey;

    const conn = connectToGame(gamePdaStr, (state) => {
      // Preserve optimistic local player position while moves are in-flight
      const opt = optimisticRef.current;
      if (opt.pendingMoves > 0 && localPlayerFoundRef.current) {
        const lpi = localPlayerIndexRef.current;
        const serverPlayer = state.players[lpi];
        if (serverPlayer && serverPlayer.alive) {
          if (serverPlayer.x === opt.x && serverPlayer.y === opt.y) {
            opt.pendingMoves = 0;
          } else {
            serverPlayer.x = opt.x;
            serverPlayer.y = opt.y;
          }
        }
      }

      // Release bomb cooldown when server confirms bomb placement
      if (bombCooldownRef.current && localPlayerFoundRef.current) {
        const sp = state.players[localPlayerIndexRef.current];
        // Server shows bomb was placed (activeBombs > 0) or grid has a new bomb
        if (sp && sp.activeBombs > 0) {
          bombCooldownRef.current = false;
        }
      }

      setGameState(state);
      setIsLoading(false);

      // Find local player index (only search until found)
      if (!localPlayerFoundRef.current) {
        const idx = state.players.findIndex(
          (p) =>
            p.authority &&
            matchPubkey &&
            p.authority.toBase58() === matchPubkey.toBase58()
        );
        if (idx !== -1) {
          setLocalPlayerIndex(idx);
          localPlayerFoundRef.current = true;
          // Initialize optimistic position from first known server state
          optimisticRef.current.x = state.players[idx].x;
          optimisticRef.current.y = state.players[idx].y;
        }
      }

      // Safety net: if state still has explosion cells, schedule a local
      // cleanup after 2s. The backend already patches these out, but this
      // catches edge cases (e.g. WS latency, direct RPC fallback).
      const hasExplosions = state.grid.cells.some((c) => c === CELL_EXPLOSION);
      if (hasExplosions) {
        if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
        explosionTimerRef.current = setTimeout(() => {
          setGameState((prev) => {
            if (!prev) return prev;
            const hasExp = prev.grid.cells.some((c) => c === CELL_EXPLOSION);
            if (!hasExp) return prev;
            const next = deepCloneState(prev);
            for (let i = 0; i < GRID_CELLS; i++) {
              if (next.grid.cells[i] === CELL_EXPLOSION) {
                next.grid.cells[i] = CELL_EMPTY;
              }
            }
            return next;
          });
        }, 2000);
      }
    });

    wsRef.current = conn;

    // Fallback: fetch initial state via RPC if WS takes too long
    const fallbackTimer = setTimeout(async () => {
      try {
        const connection = gameService.getBaseConnection();
        const state = await gameService.fetchFullGameState(
          connection,
          liveConfig.gamePda,
          liveConfig.maxPlayers
        );
        if (state) {
          setGameState(state);
          setIsLoading(false);
        }
      } catch {}
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
      conn.close();
      wsRef.current = null;
      localPlayerFoundRef.current = false;
    };
  }, [mode, liveConfig?.gamePda.toBase58()]);

  // Shared bomb detonation scheduler (used by both live + mock modes)
  const scheduleBombDetonation = useCallback(
    (cellIdx: number, range: number, ownerIdx: number) => {
      setTimeout(() => {
        setGameState((prev) => {
          if (!prev || prev.config.status !== STATUS_ACTIVE) return prev;
          const next = deepCloneState(prev);

          if (next.grid.cells[cellIdx] !== CELL_BOMB) return next;

          detonateBombAt(next, cellIdx, range, ownerIdx);

          if (next.players[ownerIdx]) {
            next.players[ownerIdx].activeBombs = Math.max(0, next.players[ownerIdx].activeBombs - 1);
          }

          checkPlayerDeaths(next);

          // Clear explosion visuals after 500ms
          setTimeout(() => {
            setGameState((prev2) => {
              if (!prev2) return prev2;
              const next2 = deepCloneState(prev2);
              for (let i = 0; i < GRID_CELLS; i++) {
                if (next2.grid.cells[i] === CELL_EXPLOSION) {
                  next2.grid.cells[i] = CELL_EMPTY;
                }
              }
              return next2;
            });
          }, 500);

          return next;
        });
      }, 3000);
    },
    []
  );

  // Live move player (simplified — no crank, backend handles detonation)
  const liveMove = useCallback(
    (direction: number) => {
      if (!liveConfig || !gameState || gameState.config.status !== STATUS_ACTIVE) return;
      const localPlayer = gameState.players[localPlayerIndex];
      if (!localPlayer || !localPlayer.alive) return;

      // Compute optimistic target
      const [nx, ny] = getNewPos(localPlayer.x, localPlayer.y, direction);
      const canMove =
        nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT &&
        isWalkable(gameState.grid.cells[ny * GRID_WIDTH + nx]);

      if (canMove) {
        // Record optimistic position — WS handler preserves it until server catches up
        optimisticRef.current.x = nx;
        optimisticRef.current.y = ny;
        optimisticRef.current.pendingMoves++;

        // Immediately update local state
        setGameState((prev) => {
          if (!prev) return prev;
          const next = deepCloneState(prev);
          next.players[localPlayerIndex].x = nx;
          next.players[localPlayerIndex].y = ny;
          return next;
        });
      }

      // Fire TX in background (fire-and-forget) — on-chain state reconciles via WS
      const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
      const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
      gameService.movePlayer(
        signer,
        liveConfig.gamePda,
        localPlayerPda,
        direction,
        gameState.delegated,
      ).catch((e) => {
        console.error("Move failed:", e);
        // TX failed — decrement pending so next WS update corrects position
        optimisticRef.current.pendingMoves = Math.max(0, optimisticRef.current.pendingMoves - 1);
      });
    },
    [liveConfig, gameState, localPlayerIndex]
  );

  // Live place bomb — lightweight optimistic prediction.
  // Show bomb at player's current position immediately for instant feedback.
  // Next WS update (~100-200ms) overwrites grid cells entirely (self-correcting).
  // If bomb position was slightly off (due to optimistic move lag), it jumps to
  // the correct cell on next WS — barely noticeable at 100-200ms poll intervals.
  const bombCooldownRef = useRef(false);
  const livePlaceBomb = useCallback(() => {
    if (!liveConfig || !gameState || gameState.config.status !== STATUS_ACTIVE) return;
    const p = gameState.players[localPlayerIndex];
    if (!p || !p.alive || p.activeBombs >= p.maxBombs) return;

    // Cooldown guard: prevent rapid re-triggering before server confirms
    if (bombCooldownRef.current) return;
    bombCooldownRef.current = true;

    // Release cooldown when server confirms (activeBombs changes) or after 2s safety
    const cooldownTimeout = setTimeout(() => { bombCooldownRef.current = false; }, 2000);

    // Lightweight optimistic: show bomb at player's position immediately.
    // No cell protection — next WS update will overwrite with authoritative state.
    const bombIdx = p.y * GRID_WIDTH + p.x;
    setGameState((prev) => {
      if (!prev) return prev;
      const next = deepCloneState(prev);
      if (next.grid.cells[bombIdx] === CELL_EMPTY) {
        next.grid.cells[bombIdx] = CELL_BOMB;
        next.players[localPlayerIndex].activeBombs++;
      }
      return next;
    });

    // Fire TX — bomb position is determined on-chain from the Player PDA's x/y
    const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
    const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
    gameService.placeBomb(
      signer,
      liveConfig.gamePda,
      localPlayerPda,
      gameState.delegated,
    ).then(() => {
      // TX sent — WS will confirm with authoritative state
    }).catch((e) => {
      console.error("Place bomb failed:", e);
      bombCooldownRef.current = false;
      clearTimeout(cooldownTimeout);
      // Revert optimistic bomb on failure
      setGameState((prev) => {
        if (!prev) return prev;
        const next = deepCloneState(prev);
        if (next.grid.cells[bombIdx] === CELL_BOMB) {
          next.grid.cells[bombIdx] = CELL_EMPTY;
          next.players[localPlayerIndex].activeBombs = Math.max(
            0, next.players[localPlayerIndex].activeBombs - 1
          );
        }
        return next;
      });
    });
  }, [liveConfig, gameState, localPlayerIndex]);

  // ─── MOCK MODE ────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "mock") return;

    const config: GameConfig = {
      gameId: new BN(1),
      authority: null,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      maxPlayers: 4,
      currentPlayers: 4,
      entryFee: new BN(100_000_000),
      prizePool: new BN(400_000_000),
      status: STATUS_ACTIVE,
      winner: null,
      createdAt: new BN(Math.floor(Date.now() / 1000)),
      startedAt: new BN(Math.floor(Date.now() / 1000)),
      roundDuration: 0,
      platformFeeBps: 300,
    };

    const grid: GridState = {
      cells: generateGrid(),
      powerupTypes: new Array(GRID_CELLS).fill(0),
    };

    const players = [0, 1, 2, 3].map(createMockPlayer);

    setGameState({ config, grid, players, bombs: [], delegated: false });
    setIsLoading(false);
  }, [mode]);

  // AI players
  useEffect(() => {
    if (mode !== "mock" || !gameState || gameState.config.status !== STATUS_ACTIVE) return;

    aiTimerRef.current = setInterval(() => {
      setGameState((prev) => {
        if (!prev || prev.config.status !== STATUS_ACTIVE) return prev;
        const next = deepCloneState(prev);

        for (let i = 1; i < 4; i++) {
          const p = next.players[i];
          if (!p.alive) continue;

          const dirs = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];
          const shuffled = dirs.sort(() => Math.random() - 0.5);
          for (const dir of shuffled) {
            const [nx, ny] = getNewPos(p.x, p.y, dir);
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
              const idx = ny * GRID_WIDTH + nx;
              const cell = next.grid.cells[idx];
              if (cell === CELL_EXPLOSION || cell === CELL_BOMB) continue;
              if (isWalkable(cell)) {
                if (cell === CELL_LOOT) {
                  const loot = Math.floor(parseInt(next.config.prizePool.toString()) / 50);
                  p.collectedSol = new BN(parseInt(p.collectedSol.toString()) + Math.max(loot, 1000));
                  next.grid.cells[idx] = CELL_EMPTY;
                } else if (cell === CELL_POWERUP) {
                  applyPowerup(p, next.grid.powerupTypes[idx]);
                  next.grid.cells[idx] = CELL_EMPTY;
                  next.grid.powerupTypes[idx] = 0;
                }
                p.x = nx;
                p.y = ny;
                break;
              }
            }
          }

          if (Math.random() < 0.15 && p.activeBombs < p.maxBombs) {
            const nearBlock = hasAdjacentBlock(next.grid.cells, p.x, p.y);
            if (nearBlock) {
              const pidx = p.y * GRID_WIDTH + p.x;
              if (next.grid.cells[pidx] === CELL_EMPTY) {
                next.grid.cells[pidx] = CELL_BOMB;
                p.activeBombs++;
                scheduleBombDetonation(pidx, p.bombRange, i);
              }
            }
          }
        }

        checkPlayerDeaths(next);
        return next;
      });
    }, 600);

    return () => {
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    };
  }, [mode, gameState?.config.status]);

  const mockMove = useCallback(
    (direction: number) => {
      setGameState((prev) => {
        if (!prev || prev.config.status !== STATUS_ACTIVE) return prev;
        const next = deepCloneState(prev);
        const p = next.players[localPlayerIndex];
        if (!p.alive) return prev;

        const [nx, ny] = getNewPos(p.x, p.y, direction);
        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) return prev;

        const idx = ny * GRID_WIDTH + nx;
        const cell = next.grid.cells[idx];

        if (cell === CELL_EXPLOSION) {
          p.alive = false;
          checkGameEnd(next);
          return next;
        }

        if (!isWalkable(cell)) return prev;

        if (cell === CELL_LOOT) {
          const loot = Math.floor(parseInt(next.config.prizePool.toString()) / 50);
          p.collectedSol = new BN(parseInt(p.collectedSol.toString()) + Math.max(loot, 1000));
          next.grid.cells[idx] = CELL_EMPTY;
        }

        if (cell === CELL_POWERUP) {
          applyPowerup(p, next.grid.powerupTypes[idx]);
          next.grid.cells[idx] = CELL_EMPTY;
          next.grid.powerupTypes[idx] = 0;
        }

        p.x = nx;
        p.y = ny;
        return next;
      });
    },
    [localPlayerIndex]
  );

  const mockPlaceBomb = useCallback(() => {
    setGameState((prev) => {
      if (!prev || prev.config.status !== STATUS_ACTIVE) return prev;
      const next = deepCloneState(prev);
      const p = next.players[localPlayerIndex];
      if (!p.alive || p.activeBombs >= p.maxBombs) return prev;

      const idx = p.y * GRID_WIDTH + p.x;
      if (next.grid.cells[idx] !== CELL_EMPTY) return prev;

      next.grid.cells[idx] = CELL_BOMB;
      p.activeBombs++;
      scheduleBombDetonation(idx, p.bombRange, localPlayerIndex);

      return next;
    });
  }, [localPlayerIndex, scheduleBombDetonation]);

  // ─── Dispatch based on mode ─────────────────────────────

  const movePlayer = useCallback(
    (direction: number) => {
      if (mode === "live") {
        liveMove(direction);
      } else {
        mockMove(direction);
      }
    },
    [mode, liveMove, mockMove]
  );

  const placeBomb = useCallback(() => {
    if (mode === "live") {
      livePlaceBomb();
    } else {
      mockPlaceBomb();
    }
  }, [mode, livePlaceBomb, mockPlaceBomb]);

  const isLocalPlayerDead = gameState
    ? !gameState.players[localPlayerIndex]?.alive
    : false;

  return { gameState, localPlayerIndex, movePlayer, placeBomb, isLoading, isLocalPlayerDead };
}

// ─── Utility Functions ────────────────────────────────────

function getNewPos(x: number, y: number, dir: number): [number, number] {
  switch (dir) {
    case DIR_UP: return [x, y - 1];
    case DIR_DOWN: return [x, y + 1];
    case DIR_LEFT: return [x - 1, y];
    case DIR_RIGHT: return [x + 1, y];
    default: return [x, y];
  }
}

function applyPowerup(player: PlayerState, type: number) {
  switch (type) {
    case 1: player.bombRange = Math.min(5, player.bombRange + 1); break;
    case 2: player.maxBombs = Math.min(3, player.maxBombs + 1); break;
    case 3: player.speed = Math.min(3, player.speed + 1); break;
  }
}

function hasAdjacentBlock(cells: number[], x: number, y: number): boolean {
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
      if (cells[ny * GRID_WIDTH + nx] === CELL_BLOCK) return true;
    }
  }
  return false;
}

function detonateBombAt(state: FullGameState, cellIdx: number, range: number, _ownerIdx: number) {
  const bx = cellIdx % GRID_WIDTH;
  const by = Math.floor(cellIdx / GRID_WIDTH);

  state.grid.cells[cellIdx] = CELL_EXPLOSION;

  const directions: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (const [dx, dy] of directions) {
    for (let dist = 1; dist <= range; dist++) {
      const nx = bx + dx * dist;
      const ny = by + dy * dist;
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) break;

      const idx = ny * GRID_WIDTH + nx;
      const cell = state.grid.cells[idx];

      if (cell === CELL_WALL) break;
      if (cell === CELL_BLOCK) {
        const roll = Math.random() * 100;
        if (roll < 40) {
          state.grid.cells[idx] = CELL_LOOT;
        } else if (roll < 55) {
          state.grid.cells[idx] = CELL_POWERUP;
          state.grid.powerupTypes[idx] = Math.floor(Math.random() * 3) + 1;
        } else {
          state.grid.cells[idx] = CELL_EMPTY;
        }
        break;
      }
      if (cell === CELL_BOMB) {
        state.grid.cells[idx] = CELL_EXPLOSION;
        break;
      }
      state.grid.cells[idx] = CELL_EXPLOSION;
    }
  }
}

function checkPlayerDeaths(state: FullGameState) {
  for (const p of state.players) {
    if (!p.alive) continue;
    const idx = p.y * GRID_WIDTH + p.x;
    if (state.grid.cells[idx] === CELL_EXPLOSION) {
      p.alive = false;
    }
  }
  checkGameEnd(state);
}

function checkGameEnd(state: FullGameState) {
  const alive = state.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    state.config.status = STATUS_FINISHED;
    if (alive.length === 1) {
      state.config.winner = alive[0].authority || PublicKey.default;
    }
  }
}

function deepCloneState(state: FullGameState): FullGameState {
  return {
    config: {
      ...state.config,
      gameId: new BN(state.config.gameId.toString()),
      entryFee: new BN(state.config.entryFee.toString()),
      prizePool: new BN(state.config.prizePool.toString()),
      createdAt: new BN(state.config.createdAt.toString()),
      startedAt: new BN(state.config.startedAt.toString()),
    },
    grid: {
      cells: [...state.grid.cells],
      powerupTypes: [...state.grid.powerupTypes],
    },
    players: state.players.map((p) => ({
      ...p,
      collectedSol: new BN(p.collectedSol.toString()),
      wager: new BN(p.wager.toString()),
      lastMoveSlot: new BN(p.lastMoveSlot.toString()),
    })),
    bombs: state.bombs.map((b) => ({
      ...b,
      placedAtSlot: new BN(b.placedAtSlot.toString()),
    })),
    delegated: state.delegated,
  };
}
