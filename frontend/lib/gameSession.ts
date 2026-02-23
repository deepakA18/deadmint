import { PublicKey } from "@solana/web3.js";
import { derivePlayerPda } from "./gameService";

// ─── Game session persisted in localStorage ───────────────

export interface GameSession {
  gamePda: string;
  gameId: string;
  maxPlayers: number;
  localPlayerIndex?: number; // this wallet's player index (0-based)
}

function storageKey(gameId: string): string {
  return `deadmint_session_${gameId}`;
}

export function saveSession(session: GameSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(session.gameId), JSON.stringify(session));
}

export function loadSession(gameId: string): GameSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Derive all player PDAs for a game ──────────────────────

export function getAllPlayerPdas(
  gamePda: PublicKey,
  maxPlayers: number
): PublicKey[] {
  const pdas: PublicKey[] = [];
  for (let i = 0; i < maxPlayers; i++) {
    const [pda] = derivePlayerPda(gamePda, i);
    pdas.push(pda);
  }
  return pdas;
}
