import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GameWorker } from "./gameWorker";
import { discoverAllGames } from "./solana";
import { GAME_CLEANUP_AFTER_MS, STATUS_FINISHED, STATUS_CLAIMED } from "./config";

// ─── In-Memory Game Registry ───────────────────────────────

const workers = new Map<string, GameWorker>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getWorker(gamePdaStr: string): GameWorker | undefined {
  return workers.get(gamePdaStr);
}

export function getAllWorkers(): GameWorker[] {
  return Array.from(workers.values());
}

export function getActiveGameCount(): number {
  return workers.size;
}

/**
 * Register a game and start its worker.
 * Returns true if newly registered, false if already exists.
 */
export function registerGame(
  gamePda: PublicKey,
  gameId: BN,
  maxPlayers: number,
  initialStatus = 0
): boolean {
  const key = gamePda.toBase58();
  if (workers.has(key)) return false;

  const worker = new GameWorker(gamePda, gameId, maxPlayers, initialStatus);
  workers.set(key, worker);
  worker.start();

  console.log(`[GameManager] Registered game ${key.slice(0, 8)}... (id=${gameId.toString()}, maxPlayers=${maxPlayers})`);
  return true;
}

/**
 * Unregister a game and stop its worker.
 */
export function unregisterGame(gamePdaStr: string) {
  const worker = workers.get(gamePdaStr);
  if (worker) {
    worker.stop();
    workers.delete(gamePdaStr);
    console.log(`[GameManager] Unregistered game ${gamePdaStr.slice(0, 8)}...`);
  }
  const timer = cleanupTimers.get(gamePdaStr);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(gamePdaStr);
  }
}

/**
 * Schedule auto-cleanup for finished/claimed games.
 */
export function scheduleCleanup(gamePdaStr: string) {
  if (cleanupTimers.has(gamePdaStr)) return;
  cleanupTimers.set(
    gamePdaStr,
    setTimeout(() => {
      unregisterGame(gamePdaStr);
    }, GAME_CLEANUP_AFTER_MS)
  );
}

/**
 * Periodic check: schedule cleanup for finished games.
 */
export function checkForFinishedGames() {
  for (const [key, worker] of workers) {
    if (worker.status >= STATUS_FINISHED) {
      scheduleCleanup(key);
    }
  }
}

/**
 * Discover all existing non-claimed games on-chain and register them.
 */
export async function discoverAndRegisterAll(): Promise<number> {
  console.log("[GameManager] Discovering existing games on-chain...");
  const games = await discoverAllGames();
  let registered = 0;

  for (const g of games) {
    const isNew = registerGame(g.gamePda, g.gameId, g.maxPlayers, g.status);
    if (isNew) registered++;
  }

  console.log(`[GameManager] Discovered ${games.length} games, registered ${registered} new`);
  return registered;
}

// Run cleanup check every 30s
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupLoop() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(checkForFinishedGames, 30_000);
}

export function stopCleanupLoop() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
