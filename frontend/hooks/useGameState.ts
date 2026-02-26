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
  BombState,
} from "@/lib/types";
import * as gameService from "@/lib/gameService";
import { derivePlayerPda } from "@/lib/gameService";
import { toast } from "sonner";

// ─── TX Hash Toast ───────────────────────────────────────

function showTxToast(action: string, sig: string) {
  const short = `${sig.slice(0, 8)}...${sig.slice(-4)}`;
  const url = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  toast(action, {
    description: short,
    action: {
      label: "View TX",
      onClick: () => window.open(url, "_blank"),
    },
    duration: 4000,
  });
}

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
    inputNonce: 0,
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
  const localPlayerFoundRef = useRef(false);
  const localPlayerIndexRef = useRef(localPlayerIndex);
  localPlayerIndexRef.current = localPlayerIndex;

  // Bomb cooldown to prevent spamming before ER confirms
  const bombCooldownRef = useRef(false);
  // Move cooldown for non-delegated mode (prevents 429 rate-limit on base layer RPC)
  const moveCooldownRef = useRef(false);

  // Separate state for frontend-detected delegation — keeps gameState pure.
  // When true, ER polling activates even if gameState.delegated is still false.
  const [delegatedOverride, setDelegatedOverride] = useState(false);

  // ─── isDelegated (derived state) ──────────────────────────
  const isDelegated = (gameState?.delegated ?? false) || delegatedOverride;

  // ─── LIVE MODE: Direct account subscriptions (inline decode) ──
  // Subscribe to game + player PDAs via onAccountChange.
  // Decode the pushed data inline — zero HTTP RPC calls on the hot path.
  // Compose FullGameState from cached authoritative data on each update.
  // No backend relay in the player render path.

  useEffect(() => {
    if (mode !== "live" || !liveConfig) return;

    // Capture connection for this effect instance (changes on delegation transition)
    const conn = isDelegated
      ? gameService.getErConnection()
      : gameService.getBaseConnection();
    const delegated = isDelegated;
    const gamePda = liveConfig.gamePda;
    const maxPlayers = liveConfig.maxPlayers;
    const matchPubkey = liveConfig.sessionKey
      ? liveConfig.sessionKey.publicKey
      : liveConfig.wallet.publicKey;

    let active = true;
    const subscriptionIds: number[] = [];
    let lastSubTime = Date.now();

    // ── Cached authoritative data from ER subscription pushes ──
    // Every piece comes from ER via onAccountChange. Nothing is invented.
    let cachedGameConfig: GameConfig | null = null;
    let cachedGrid: GridState | null = null;
    let cachedBombs: BombState[] = [];
    const cachedPlayers: PlayerState[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      cachedPlayers.push(gameService.emptyPlayer(i));
    }

    // Track when each cell first became CELL_EXPLOSION (for stale cleanup).
    // On-chain program clears explosions lazily; we clear them client-side
    // so both rendering and walkability checks use consistent data.
    const explosionFirstSeen = new Map<number, number>();
    const EXPLOSION_VISUAL_MS = 600;

    // Compose FullGameState from cached data and push to React state.
    // Every field is from the latest ER push — this is assembly, not merging.
    const composeAndSetState = () => {
      if (!active || !cachedGameConfig || !cachedGrid) return;

      // Post-process grid: clear stale explosion cells that the on-chain
      // program would have cleared lazily on the next instruction.
      const now = Date.now();
      const cleanedCells = [...cachedGrid.cells];
      for (let i = 0; i < cleanedCells.length; i++) {
        if (cleanedCells[i] === CELL_EXPLOSION) {
          if (!explosionFirstSeen.has(i)) {
            explosionFirstSeen.set(i, now);
          } else if (now - explosionFirstSeen.get(i)! > EXPLOSION_VISUAL_MS) {
            cleanedCells[i] = CELL_EMPTY;
          }
        } else {
          explosionFirstSeen.delete(i);
        }
      }

      const fullState: FullGameState = {
        config: cachedGameConfig,
        grid: { cells: cleanedCells, powerupTypes: cachedGrid.powerupTypes },
        players: [...cachedPlayers],
        bombs: cachedBombs,
        delegated,
      };

      // Find local player index (one-time)
      if (!localPlayerFoundRef.current) {
        const idx = fullState.players.findIndex(
          (p) =>
            p.authority &&
            matchPubkey &&
            p.authority.toBase58() === matchPubkey.toBase58()
        );
        if (idx !== -1) {
          setLocalPlayerIndex(idx);
          localPlayerFoundRef.current = true;
        }
      }

      setGameState(fullState);
      setIsLoading(false);
      bombCooldownRef.current = false;
    };

    // ── Subscription callbacks: decode inline, compose, push ──

    // Game PDA: contains config, grid, bombs
    const onGameChange = (accountInfo: { data: Buffer }) => {
      if (!active) return;
      const decoded = gameService.decodeGameAccount(accountInfo.data);
      if (!decoded) return;
      cachedGameConfig = decoded.config;
      cachedGrid = decoded.grid;
      cachedBombs = decoded.bombs;
      lastSubTime = Date.now();
      composeAndSetState();
    };

    // Player PDAs: contain position, alive, stats
    const makePlayerHandler = (index: number) => {
      return (accountInfo: { data: Buffer }) => {
        if (!active) return;
        const decoded = gameService.decodePlayerAccount(accountInfo.data);
        if (decoded) {
          cachedPlayers[index] = decoded;
        }
        lastSubTime = Date.now();
        composeAndSetState();
      };
    };

    // ── Set up subscriptions ──

    try {
      subscriptionIds.push(
        conn.onAccountChange(gamePda, onGameChange, { commitment: "confirmed" })
      );
    } catch (e) {
      console.warn("[Sub] Failed to subscribe to game PDA:", e);
    }

    for (let i = 0; i < maxPlayers; i++) {
      try {
        const [playerPda] = gameService.derivePlayerPda(gamePda, i);
        subscriptionIds.push(
          conn.onAccountChange(playerPda, makePlayerHandler(i), { commitment: "confirmed" })
        );
      } catch (e) {
        console.warn(`[Sub] Failed to subscribe to player ${i} PDA:`, e);
      }
    }

    // ── Initial fetch (one-time, populates cache before first subscription) ──
    const doInitialFetch = async () => {
      if (!active) return;
      try {
        const serverState = await gameService.fetchGameStateBatched(
          conn, gamePda, maxPlayers, delegated
        );
        if (serverState && active) {
          cachedGameConfig = serverState.config;
          cachedGrid = serverState.grid;
          cachedBombs = serverState.bombs;
          for (let i = 0; i < maxPlayers; i++) {
            cachedPlayers[i] = serverState.players[i] || gameService.emptyPlayer(i);
          }
          lastSubTime = Date.now();
          composeAndSetState();
        }
      } catch (e) {
        console.error("[Sub] Initial fetch failed:", e);
      }
    };
    doInitialFetch();

    // ── Safety net: if subscriptions go quiet for 3s, do one reconciliation fetch ──
    const safetyPoll = setInterval(async () => {
      if (!active) return;
      if (Date.now() - lastSubTime < 3000) return;
      try {
        const serverState = await gameService.fetchGameStateBatched(
          conn, gamePda, maxPlayers, delegated
        );
        if (serverState && active) {
          cachedGameConfig = serverState.config;
          cachedGrid = serverState.grid;
          cachedBombs = serverState.bombs;
          for (let i = 0; i < maxPlayers; i++) {
            cachedPlayers[i] = serverState.players[i] || gameService.emptyPlayer(i);
          }
          lastSubTime = Date.now();
          composeAndSetState();
        }
      } catch {
        // Safety poll failure — subscriptions should still be active
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(safetyPoll);
      for (const id of subscriptionIds) {
        try { conn.removeAccountChangeListener(id); } catch {}
      }
      localPlayerFoundRef.current = false;
    };
  }, [mode, liveConfig?.gamePda.toBase58(), isDelegated]);

  // ─── LIVE MODE: Frontend delegation detection ──────────────
  // Check if the game PDA is owned by the delegation program.
  // When detected, sets delegatedOverride → isDelegated becomes true →
  // subscription effect re-runs and switches to ER connection.

  useEffect(() => {
    if (mode !== "live" || !liveConfig) return;
    if (!gameState || gameState.config.status !== STATUS_ACTIVE) return;
    if (isDelegated) return; // Already delegated (from gameState or override ref)

    let active = true;
    const check = async () => {
      if (!active) return;
      try {
        const delegated = await gameService.isDelegatedOnChain(liveConfig.gamePda);
        if (delegated && active) {
          console.log("[Delegation] Detected on-chain — switching to ER");
          // Set override state — does NOT merge into gameState.
          // Triggers re-render so subscription effect switches to ER connection.
          setDelegatedOverride(true);
          return; // Stop checking
        }
      } catch {}
      if (active) setTimeout(check, 2000); // Retry every 2s
    };
    check();
    return () => { active = false; };
  }, [mode, liveConfig?.gamePda.toBase58(), gameState?.config.status, isDelegated]);

  // Shared bomb detonation scheduler (mock mode only)
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

  // ─── LIVE: Move player ────────────────────────────────────
  // Validate locally, send TX to ER. No optimistic state mutation.
  // Next ER update will contain the authoritative position.

  const liveMove = useCallback(
    (direction: number) => {
      if (!liveConfig || !gameState || gameState.config.status !== STATUS_ACTIVE) return;
      const localPlayer = gameState.players[localPlayerIndex];
      if (!localPlayer || !localPlayer.alive) return;

      // On base layer (not delegated), throttle moves to avoid 429 rate-limiting
      if (!gameState.delegated) {
        if (moveCooldownRef.current) return;
        moveCooldownRef.current = true;
        setTimeout(() => { moveCooldownRef.current = false; }, 400);
      }

      // Local validation: prevent sending obviously invalid TXs
      const [nx, ny] = getNewPos(localPlayer.x, localPlayer.y, direction);
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) return;
      const targetCell = gameState.grid.cells[ny * GRID_WIDTH + nx];
      if (!isWalkable(targetCell)) return;

      // Send TX to ER — no local state mutation
      const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
      const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
      gameService.movePlayer(
        signer,
        liveConfig.gamePda,
        localPlayerPda,
        direction,
        gameState.delegated,
      ).then((sig) => {
        if (sig) showTxToast("Move", sig);
      }).catch((e) => {
        console.error("Move TX failed:", e);
      });
    },
    [liveConfig, gameState, localPlayerIndex]
  );

  // ─── LIVE: Place bomb ─────────────────────────────────────
  // Send TX to ER. No optimistic state mutation.
  // Bomb appears when ER state includes it.

  const livePlaceBomb = useCallback(() => {
    if (!liveConfig || !gameState || gameState.config.status !== STATUS_ACTIVE) return;
    const p = gameState.players[localPlayerIndex];
    if (!p || !p.alive || p.activeBombs >= p.maxBombs) return;

    // Cooldown guard: prevent spamming before ER confirms
    if (bombCooldownRef.current) return;
    bombCooldownRef.current = true;
    setTimeout(() => { bombCooldownRef.current = false; }, 1000);

    // Send TX to ER — no local state mutation
    const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
    const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
    gameService.placeBomb(
      signer,
      liveConfig.gamePda,
      localPlayerPda,
      gameState.delegated,
    ).then((sig) => {
      if (sig) showTxToast("Bomb", sig);
    }).catch((e) => {
      console.error("Place bomb TX failed:", e);
      bombCooldownRef.current = false;
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

  // Only report dead AFTER the local player has been positively identified.
  // Before that, localPlayerIndex is 0 (default) and players[0] might be
  // a fallback or another player — showing "YOU DIED" falsely.
  const isLocalPlayerDead = (gameState && localPlayerFoundRef.current)
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

// ─── Mock Mode Helpers (not used in live mode) ──────────────

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
    currentSlot: state.currentSlot,
  };
}
