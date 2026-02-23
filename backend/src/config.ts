import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "fs";

// ─── Environment ─────────────────────────────────────────────

export const PORT = parseInt(process.env.PORT || "8080");
export const RPC_URL = process.env.RPC_URL || "https://devnet.helius-rpc.com/?api-key=90a86d9d-6820-4f75-9f5b-c8099b59eef9";
export const PROGRAM_ID_STR = "Aj2fUK4fdw6Y6BCgtuUPsBL761AAgFjNjzt5Zd3Sp2Qb";

// ─── Timing ──────────────────────────────────────────────────

export const POLL_INTERVAL_ACTIVE_MS = 800;
export const POLL_INTERVAL_LOBBY_MS = 3000;
export const CRANK_COOLDOWN_MS = 500;
export const GAME_CLEANUP_AFTER_MS = 120_000; // 2 min after finish

// ─── On-chain constants (mirrored from state.rs) ────────────

export const MAX_BOMBS = 12;
export const EXPLOSION_DURATION_SLOTS = 5;
export const STATUS_LOBBY = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_FINISHED = 2;
export const STATUS_CLAIMED = 3;

// ─── Crank Keypair ───────────────────────────────────────────

export function loadCrankKeypair(): Keypair {
  const b58 = process.env.CRANK_KEYPAIR;
  if (b58) {
    return Keypair.fromSecretKey(bs58.decode(b58));
  }

  const path = process.env.CRANK_KEYPAIR_PATH;
  if (path) {
    const resolved = path.startsWith("~")
      ? path.replace("~", process.env.HOME || "")
      : path;
    const raw = JSON.parse(readFileSync(resolved, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  throw new Error(
    "Set CRANK_KEYPAIR (base58 secret key) or CRANK_KEYPAIR_PATH (JSON file path)"
  );
}
