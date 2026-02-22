"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
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

interface UseGameStateOptions {
  mode: "mock" | "live";
}

interface UseGameStateReturn {
  gameState: FullGameState | null;
  localPlayerIndex: number;
  movePlayer: (direction: number) => void;
  placeBomb: () => void;
  isLoading: boolean;
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

export function useGameState({ mode }: UseGameStateOptions): UseGameStateReturn {
  const [gameState, setGameState] = useState<FullGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const localPlayerIndex = 0;
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(180);

  // Initialize mock game
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
      roundDuration: 180,
      platformFeeBps: 300,
    };

    const grid: GridState = {
      cells: generateGrid(),
      powerupTypes: new Array(GRID_CELLS).fill(0),
    };

    const players = [0, 1, 2, 3].map(createMockPlayer);

    setGameState({ config, grid, players, bombs: [] });
    setIsLoading(false);
  }, [mode]);

  // Countdown timer
  useEffect(() => {
    if (mode !== "mock" || !gameState || gameState.config.status !== STATUS_ACTIVE) return;

    timerRef.current = setInterval(() => {
      timeLeftRef.current--;
      if (timeLeftRef.current <= 0) {
        setGameState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            config: { ...prev.config, status: STATUS_FINISHED },
          };
        });
      }
      // Update startedAt to reflect timer (for HUD calculation)
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          config: {
            ...prev.config,
            startedAt: new BN(
              Math.floor(Date.now() / 1000) - (180 - timeLeftRef.current)
            ),
          },
        };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, gameState?.config.status]);

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

          // Random movement
          const dirs = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];
          const shuffled = dirs.sort(() => Math.random() - 0.5);
          for (const dir of shuffled) {
            const [nx, ny] = getNewPos(p.x, p.y, dir);
            if (
              nx >= 0 &&
              nx < GRID_WIDTH &&
              ny >= 0 &&
              ny < GRID_HEIGHT
            ) {
              const idx = ny * GRID_WIDTH + nx;
              const cell = next.grid.cells[idx];
              if (cell === CELL_EXPLOSION) {
                continue; // AI avoids explosions
              }
              if (cell === CELL_BOMB) {
                continue; // AI avoids bombs
              }
              if (isWalkable(cell)) {
                // Handle loot/powerup pickup
                if (cell === CELL_LOOT) {
                  const loot = Math.floor(
                    parseInt(next.config.prizePool.toString()) / 50
                  );
                  p.collectedSol = new BN(
                    parseInt(p.collectedSol.toString()) + Math.max(loot, 1000)
                  );
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

          // 15% chance to place bomb near destructible blocks
          if (Math.random() < 0.15 && p.activeBombs < p.maxBombs) {
            const nearBlock = hasAdjacentBlock(
              next.grid.cells,
              p.x,
              p.y
            );
            if (nearBlock) {
              const pidx = p.y * GRID_WIDTH + p.x;
              if (next.grid.cells[pidx] === CELL_EMPTY) {
                next.grid.cells[pidx] = CELL_BOMB;
                p.activeBombs++;
                // Schedule detonation
                scheduleBombDetonation(pidx, p.bombRange, i);
              }
            }
          }
        }

        // Check for player deaths from explosions
        checkPlayerDeaths(next);

        return next;
      });
    }, 600);

    return () => {
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    };
  }, [mode, gameState?.config.status]);

  // Bomb detonation scheduling
  const scheduleBombDetonation = useCallback(
    (cellIdx: number, range: number, ownerIdx: number) => {
      setTimeout(() => {
        setGameState((prev) => {
          if (!prev || prev.config.status !== STATUS_ACTIVE) return prev;
          const next = deepCloneState(prev);

          if (next.grid.cells[cellIdx] !== CELL_BOMB) return next;

          // Detonate
          detonateBombAt(next, cellIdx, range, ownerIdx);

          // Decrease active bombs
          if (next.players[ownerIdx]) {
            next.players[ownerIdx].activeBombs = Math.max(
              0,
              next.players[ownerIdx].activeBombs - 1
            );
          }

          // Check deaths
          checkPlayerDeaths(next);

          // Clear explosions after 500ms
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

  // Player move
  const movePlayer = useCallback(
    (direction: number) => {
      if (mode !== "mock") return;

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
          // Player walks into explosion — death
          p.alive = false;
          checkGameEnd(next);
          return next;
        }

        if (!isWalkable(cell)) return prev;

        // Loot pickup
        if (cell === CELL_LOOT) {
          const loot = Math.floor(
            parseInt(next.config.prizePool.toString()) / 50
          );
          p.collectedSol = new BN(
            parseInt(p.collectedSol.toString()) + Math.max(loot, 1000)
          );
          next.grid.cells[idx] = CELL_EMPTY;
        }

        // Powerup pickup
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
    [mode]
  );

  // Place bomb
  const placeBomb = useCallback(() => {
    if (mode !== "mock") return;

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
  }, [mode, scheduleBombDetonation]);

  return { gameState, localPlayerIndex, movePlayer, placeBomb, isLoading };
}

// ─── Utility Functions ────────────────────────────────────

function getNewPos(x: number, y: number, dir: number): [number, number] {
  switch (dir) {
    case DIR_UP:
      return [x, y - 1];
    case DIR_DOWN:
      return [x, y + 1];
    case DIR_LEFT:
      return [x - 1, y];
    case DIR_RIGHT:
      return [x + 1, y];
    default:
      return [x, y];
  }
}

function applyPowerup(player: PlayerState, type: number) {
  switch (type) {
    case 1: // bomb range
      player.bombRange = Math.min(5, player.bombRange + 1);
      break;
    case 2: // extra bomb
      player.maxBombs = Math.min(3, player.maxBombs + 1);
      break;
    case 3: // speed
      player.speed = Math.min(3, player.speed + 1);
      break;
  }
}

function hasAdjacentBlock(cells: number[], x: number, y: number): boolean {
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
      if (cells[ny * GRID_WIDTH + nx] === CELL_BLOCK) return true;
    }
  }
  return false;
}

function detonateBombAt(
  state: FullGameState,
  cellIdx: number,
  range: number,
  _ownerIdx: number
) {
  const bx = cellIdx % GRID_WIDTH;
  const by = Math.floor(cellIdx / GRID_WIDTH);

  state.grid.cells[cellIdx] = CELL_EXPLOSION;

  const directions: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  for (const [dx, dy] of directions) {
    for (let dist = 1; dist <= range; dist++) {
      const nx = bx + dx * dist;
      const ny = by + dy * dist;

      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) break;

      const idx = ny * GRID_WIDTH + nx;
      const cell = state.grid.cells[idx];

      if (cell === CELL_WALL) break;

      if (cell === CELL_BLOCK) {
        // Destroy block with random loot
        const roll = Math.random() * 100;
        if (roll < 40) {
          state.grid.cells[idx] = CELL_LOOT;
        } else if (roll < 55) {
          state.grid.cells[idx] = CELL_POWERUP;
          state.grid.powerupTypes[idx] = Math.floor(Math.random() * 3) + 1;
        } else {
          state.grid.cells[idx] = CELL_EMPTY;
        }
        break; // Explosion stops at first block
      }

      if (cell === CELL_BOMB) {
        // Chain reaction
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
  };
}
