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

// ─── Nonce-Based Input Buffer for Client-Side Prediction ──
// Each input is tagged with the expected server nonce AFTER the server
// processes it.  Reconciliation uses `server.player.inputNonce` (an
// authoritative counter that increments on every successful move_player
// or place_bomb on-chain) instead of fragile position matching.
//
// Invariant: inputs are ordered by expectedNonce (ascending).

interface InputFrame {
  /** Local sequence id — used only for removeBySeq on TX failure. */
  seq: number;
  type: "move" | "bomb";
  direction?: number;
  /** The server inputNonce value we expect AFTER this input is confirmed. */
  expectedNonce: number;
}

class InputBuffer {
  private frames: InputFrame[] = [];
  private nextSeq = 0;

  /** Record a new input.  `baseNonce` = current local nonce before this input. */
  push(type: "move" | "bomb", direction: number | undefined, baseNonce: number): number {
    const seq = this.nextSeq++;
    this.frames.push({ seq, type, direction, expectedNonce: baseNonce + 1 });
    return seq;
  }

  /**
   * Acknowledge all inputs confirmed by the server.
   * Inputs whose expectedNonce ≤ serverNonce have been processed.
   */
  acknowledge(serverNonce: number): void {
    this.frames = this.frames.filter((f) => f.expectedNonce > serverNonce);
  }

  /** Remove a single input by local seq (called when its TX fails). */
  removeBySeq(seq: number): void {
    this.frames = this.frames.filter((f) => f.seq !== seq);
  }

  getUnconfirmed(): InputFrame[] {
    return [...this.frames];
  }

  clear(): void {
    this.frames = [];
  }

  get length(): number {
    return this.frames.length;
  }
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

// ─── Deterministic Input Replay ──────────────────────────
// Applies a single unconfirmed input to a state clone.
// Must mirror on-chain move_player / place_bomb logic exactly.
// Replay is idempotent: bomb placement checks for existing CELL_BOMB.

function replayInput(
  state: FullGameState,
  playerIndex: number,
  input: InputFrame
): boolean {
  const p = state.players[playerIndex];
  if (!p || !p.alive) return false;

  if (input.type === "move" && input.direction != null) {
    const [nx, ny] = getNewPos(p.x, p.y, input.direction);
    if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) return false;
    const cellIdx = ny * GRID_WIDTH + nx;
    const targetCell = state.grid.cells[cellIdx];
    if (!isWalkable(targetCell)) return false;

    p.x = nx;
    p.y = ny;

    if (targetCell === CELL_LOOT) {
      state.grid.cells[cellIdx] = CELL_EMPTY;
    } else if (targetCell === CELL_POWERUP) {
      applyPowerup(p, state.grid.powerupTypes[cellIdx]);
      state.grid.cells[cellIdx] = CELL_EMPTY;
      state.grid.powerupTypes[cellIdx] = 0;
    }
    return true;
  }

  if (input.type === "bomb") {
    if (p.activeBombs >= p.maxBombs) return false;
    const cellIdx = p.y * GRID_WIDTH + p.x;
    // Idempotent: if cell already has a bomb (from server or prior replay), skip
    if (state.grid.cells[cellIdx] === CELL_BOMB) return true;
    if (state.grid.cells[cellIdx] !== CELL_EMPTY &&
        state.grid.cells[cellIdx] !== CELL_LOOT &&
        state.grid.cells[cellIdx] !== CELL_POWERUP) return false;
    state.grid.cells[cellIdx] = CELL_BOMB;
    p.activeBombs++;
    return true;
  }

  return false;
}

/**
 * Nonce-based reconciliation.
 * 1. Use server.player.inputNonce to acknowledge confirmed inputs.
 * 2. Replay remaining unconfirmed inputs on a clone of server state.
 * No position matching. No Date.now(). Fully deterministic.
 */
function reconcileWithNonce(
  serverState: FullGameState,
  localPlayerIndex: number,
  inputBuffer: InputBuffer
): FullGameState {
  const serverPlayer = serverState.players[localPlayerIndex];
  if (!serverPlayer || !serverPlayer.alive) {
    inputBuffer.clear();
    return serverState;
  }

  // Acknowledge all inputs the server has confirmed
  inputBuffer.acknowledge(serverPlayer.inputNonce);

  const unconfirmed = inputBuffer.getUnconfirmed();
  if (unconfirmed.length === 0) {
    return serverState;
  }

  // Replay unconfirmed inputs on top of authoritative server state
  const reconciled = deepCloneState(serverState);
  for (const frame of unconfirmed) {
    const ok = replayInput(reconciled, localPlayerIndex, frame);
    if (!ok) break; // Input can't apply — stop; TX failure handler will clean up
  }

  return reconciled;
}

// ─── Hook ─────────────────────────────────────────────────

export function useGameState({ mode, liveConfig }: UseGameStateOptions): UseGameStateReturn {
  const [gameState, setGameState] = useState<FullGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localPlayerIndex, setLocalPlayerIndex] = useState(0);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<GameConnection | null>(null);
  const localPlayerFoundRef = useRef(false);
  const localPlayerIndexRef = useRef(localPlayerIndex);
  localPlayerIndexRef.current = localPlayerIndex;

  // Bomb cooldown to prevent spamming before server confirms
  const bombCooldownRef = useRef(false);
  // Move cooldown for non-delegated mode (prevents 429 rate-limit on base layer RPC)
  const moveCooldownRef = useRef(false);

  // Input buffer: tracks unconfirmed inputs for replay-based reconciliation.
  // Replaces the old position-preservation hack that caused rubber-banding.
  const inputBufferRef = useRef(new InputBuffer());

  // Track delegation status in a ref so the WS callback closure can read it.
  const isDelegatedRef = useRef(false);

  // ─── LIVE MODE: WebSocket connection ───────────────────────

  useEffect(() => {
    if (mode !== "live" || !liveConfig) return;

    const gamePdaStr = liveConfig.gamePda.toBase58();
    const matchPubkey = liveConfig.sessionKey
      ? liveConfig.sessionKey.publicKey
      : liveConfig.wallet.publicKey;

    const conn = connectToGame(gamePdaStr, (state) => {
      // Find local player index
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
        }
      }

      // When delegated, ER polling is authoritative — skip WS for gameplay state
      if (isDelegatedRef.current) return;

      // Reconcile server state with unconfirmed local inputs via nonce
      const reconciled = reconcileWithNonce(
        state, localPlayerIndexRef.current, inputBufferRef.current
      );
      setGameState(reconciled);
      setIsLoading(false);
      bombCooldownRef.current = false;
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
      conn.close();
      wsRef.current = null;
      localPlayerFoundRef.current = false;
    };
  }, [mode, liveConfig?.gamePda.toBase58()]);

  // ─── LIVE MODE: Direct ER polling (bypasses backend round-trip) ──
  // When delegated, poll the ER directly for low-latency state updates.
  // The backend WS still runs for cranking and as a fallback.

  const isDelegated = gameState?.delegated ?? false;
  isDelegatedRef.current = isDelegated;

  useEffect(() => {
    if (mode !== "live" || !liveConfig || !isDelegated) return;
    if (gameState && gameState.config.status !== STATUS_ACTIVE) return;

    let active = true;
    const erConn = gameService.getErConnection();
    const matchPubkey = liveConfig.sessionKey
      ? liveConfig.sessionKey.publicKey
      : liveConfig.wallet.publicKey;

    const poll = async () => {
      if (!active) return;
      try {
        const serverState = await gameService.fetchGameStateBatched(
          erConn,
          liveConfig.gamePda,
          liveConfig.maxPlayers,
          true
        );
        if (serverState && active) {
          // Find local player index
          if (!localPlayerFoundRef.current) {
            const idx = serverState.players.findIndex(
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

          // Reconcile: replay unconfirmed inputs on server state
          const reconciled = reconcileWithNonce(
            serverState, localPlayerIndexRef.current, inputBufferRef.current
          );
          setGameState(reconciled);
          setIsLoading(false);
          bombCooldownRef.current = false;
        }
      } catch {
        // ER poll failed — backend WS is the fallback
      }
      if (active) setTimeout(poll, 150);
    };

    poll();
    return () => { active = false; };
  }, [mode, liveConfig?.gamePda.toBase58(), isDelegated, gameState?.config.status]);

  // ─── LIVE MODE: Frontend delegation detection ──────────────
  // Don't rely solely on backend WS for delegated flag.
  // Independently check if the game PDA is owned by the delegation program.
  // This activates ER routing even if backend WS never broadcasts delegated=true.

  useEffect(() => {
    if (mode !== "live" || !liveConfig) return;
    if (!gameState || gameState.config.status !== STATUS_ACTIVE) return;
    if (gameState.delegated) return; // Already delegated

    let active = true;
    const check = async () => {
      if (!active) return;
      try {
        const delegated = await gameService.isDelegatedOnChain(liveConfig.gamePda);
        if (delegated && active) {
          console.log("[Delegation] Detected on-chain — switching to ER");
          setGameState((prev) => prev ? { ...prev, delegated: true } : prev);
          return; // Stop checking
        }
      } catch {}
      if (active) setTimeout(check, 2000); // Retry every 2s
    };
    check();
    return () => { active = false; };
  }, [mode, liveConfig?.gamePda.toBase58(), gameState?.config.status, gameState?.delegated]);

  // ─── LIVE MODE: Frontend bomb detonation ───────────────────
  // Track active bombs and send detonateBomb TX when fuse expires.
  // This removes dependency on backend cranking for bomb timing.

  const detonationSentRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (mode !== "live" || !liveConfig || !gameState) return;
    if (gameState.config.status !== STATUS_ACTIVE) return;
    if (!gameState.currentSlot) return;

    const currentSlot = gameState.currentSlot;
    const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
    const playerPdas: PublicKey[] = [];
    for (let i = 0; i < liveConfig.maxPlayers; i++) {
      const [pda] = derivePlayerPda(liveConfig.gamePda, i);
      playerPdas.push(pda);
    }

    for (const bomb of gameState.bombs) {
      if (bomb.detonated) continue;
      if (bomb.originalIndex == null) continue;
      const fuseExpiry = new BN(bomb.placedAtSlot.toString()).toNumber() + bomb.fuseSlots;
      if (currentSlot < fuseExpiry) continue;

      // Bomb fuse expired — send detonateBomb if we haven't already
      if (detonationSentRef.current.has(bomb.originalIndex)) continue;
      detonationSentRef.current.add(bomb.originalIndex);

      gameService.detonateBomb(
        signer,
        liveConfig.gamePda,
        bomb.originalIndex,
        playerPdas,
        gameState.delegated,
      ).catch((e) => {
        console.error("Detonate bomb failed:", e);
        // Allow retry next poll
        detonationSentRef.current.delete(bomb.originalIndex!);
      });
    }

    // Clean up detonation tracking for bombs that are gone
    for (const idx of detonationSentRef.current) {
      if (!gameState.bombs.some((b) => b.originalIndex === idx && !b.detonated)) {
        detonationSentRef.current.delete(idx);
      }
    }
  }, [mode, liveConfig, gameState, localPlayerIndex]);

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

  // ─── LIVE: Move player (nonce-based prediction + replay reconciliation) ──
  // Record input with expectedNonce, apply locally, fire TX to ER.
  // On server state, reconcileWithNonce uses inputNonce to ack — no position matching.

  // Track the local nonce (server nonce + unconfirmed count).
  // This lets us compute expectedNonce for new inputs without reading stale state.
  const localNonceRef = useRef(0);

  // Keep localNonce in sync: when server confirms inputs, our buffer shrinks,
  // so localNonce = serverNonce + remaining unconfirmed count.
  useEffect(() => {
    if (!gameState) return;
    const serverNonce = gameState.players[localPlayerIndex]?.inputNonce ?? 0;
    localNonceRef.current = serverNonce + inputBufferRef.current.length;
  }, [gameState, localPlayerIndex]);

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

      // Deterministic prediction: same collision rules as on-chain move_player
      const [nx, ny] = getNewPos(localPlayer.x, localPlayer.y, direction);
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) return;
      const targetCell = gameState.grid.cells[ny * GRID_WIDTH + nx];
      if (!isWalkable(targetCell)) return;

      // Record in input buffer with nonce-based tracking
      const baseNonce = localNonceRef.current;
      const seq = inputBufferRef.current.push("move", direction, baseNonce);
      localNonceRef.current = baseNonce + 1;

      // Apply move instantly (zero input lag)
      setGameState((prev) => {
        if (!prev) return prev;
        const next = deepCloneState(prev);
        const p = next.players[localPlayerIndex];
        if (!p || !p.alive) return prev;
        p.x = nx;
        p.y = ny;
        const cellIdx = ny * GRID_WIDTH + nx;
        if (targetCell === CELL_LOOT) {
          next.grid.cells[cellIdx] = CELL_EMPTY;
        } else if (targetCell === CELL_POWERUP) {
          applyPowerup(p, next.grid.powerupTypes[cellIdx]);
          next.grid.cells[cellIdx] = CELL_EMPTY;
          next.grid.powerupTypes[cellIdx] = 0;
        }
        return next;
      });

      // Fire TX to ER — on failure, remove from buffer so next reconciliation corrects
      const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
      const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
      gameService.movePlayer(
        signer,
        liveConfig.gamePda,
        localPlayerPda,
        direction,
        gameState.delegated,
      ).catch((e) => {
        console.error("Move TX failed:", e);
        inputBufferRef.current.removeBySeq(seq);
      });
    },
    [liveConfig, gameState, localPlayerIndex]
  );

  // ─── LIVE: Place bomb (nonce-based + optimistic local) ───────

  const livePlaceBomb = useCallback(() => {
    if (!liveConfig || !gameState || gameState.config.status !== STATUS_ACTIVE) return;
    const p = gameState.players[localPlayerIndex];
    if (!p || !p.alive || p.activeBombs >= p.maxBombs) return;

    // Cooldown guard: prevent spamming before server confirms
    if (bombCooldownRef.current) return;
    bombCooldownRef.current = true;
    setTimeout(() => { bombCooldownRef.current = false; }, 1000);

    const cellIdx = p.y * GRID_WIDTH + p.x;

    // Record in input buffer with nonce-based tracking
    const baseNonce = localNonceRef.current;
    const seq = inputBufferRef.current.push("bomb", undefined, baseNonce);
    localNonceRef.current = baseNonce + 1;

    // Optimistic: show bomb on local state immediately
    setGameState((prev) => {
      if (!prev) return prev;
      const next = deepCloneState(prev);
      const player = next.players[localPlayerIndex];
      if (player) player.activeBombs++;
      if (next.grid.cells[cellIdx] === CELL_EMPTY) {
        next.grid.cells[cellIdx] = CELL_BOMB;
      }
      return next;
    });

    // Fire TX to ER — on failure, remove from buffer
    const signer: gameService.Signer = liveConfig.sessionKey || liveConfig.wallet;
    const [localPlayerPda] = derivePlayerPda(liveConfig.gamePda, localPlayerIndex);
    gameService.placeBomb(
      signer,
      liveConfig.gamePda,
      localPlayerPda,
      gameState.delegated,
    ).catch((e) => {
      console.error("Place bomb TX failed:", e);
      inputBufferRef.current.removeBySeq(seq);
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
