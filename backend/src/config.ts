import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "fs";

// ─── Environment ─────────────────────────────────────────────

export const PORT = parseInt(process.env.PORT || "8080");
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) throw new Error("Set RPC_URL in .env (e.g. https://devnet.helius-rpc.com/?api-key=YOUR_KEY)");
export const RPC_URL = rpcUrl;
export const EPHEMERAL_RPC_URL = process.env.EPHEMERAL_RPC_URL || "https://devnet-as.magicblock.app";
export const PROGRAM_ID_STR = "Hx7eQa2NhDDKiBThKyo4VNLnBi7pApQX9JZTsA5xBbdb";
export const DELEGATION_PROGRAM_ID_STR = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
export const ER_VALIDATOR_STR = process.env.ER_VALIDATOR || "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"; // Asia devnet ER validator

// ─── Timing ──────────────────────────────────────────────────

export const POLL_INTERVAL_ACTIVE_MS = 2000;       // base layer: brief pre-delegation window, just detect delegation
export const POLL_INTERVAL_ACTIVE_ER_MS = 500;     // ER: crank-only polling (players subscribe directly)
export const POLL_INTERVAL_LOBBY_MS = 30_000;      // lobby: only need to detect lobby→active transition
export const CRANK_COOLDOWN_MS = 500;
export const GAME_CLEANUP_AFTER_MS = 120_000; // 2 min after finish
export const DELEGATION_TIMEOUT_MS = 15_000; // max wait for delegation confirmation
export const DELEGATION_CHECK_INTERVAL_MS = 2000; // how often to check isDelegated during delegation

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
