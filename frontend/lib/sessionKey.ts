import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_PREFIX = "deadmint_sessionkey_";
const DEFAULT_FUND_LAMPORTS = Math.floor(0.01 * LAMPORTS_PER_SOL); // 10,000,000 lamports

/**
 * Get existing session key from localStorage or generate a new one.
 * Each wallet address gets its own session key so multiple wallets
 * can play in separate tabs without colliding.
 */
export function getOrCreateSessionKey(walletPubkey: PublicKey): Keypair {
  if (typeof window === "undefined") return Keypair.generate();

  const storageKey = STORAGE_PREFIX + walletPubkey.toBase58();
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      const secretKey = bs58.decode(raw);
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // Corrupted — fall through to generate new
    }
  }

  const keypair = Keypair.generate();
  localStorage.setItem(storageKey, bs58.encode(keypair.secretKey));
  return keypair;
}

/**
 * Fund the session key with SOL from the user's wallet.
 * Idempotent — skips transfer if already funded above threshold.
 * This is the ONE wallet popup the user experiences for session setup.
 */
export async function fundSessionKey(
  wallet: { publicKey: PublicKey; sendTransaction: (tx: Transaction, connection: Connection) => Promise<string> },
  connection: Connection,
  sessionKey: Keypair,
  lamports: number = DEFAULT_FUND_LAMPORTS
): Promise<string> {
  const balance = await connection.getBalance(sessionKey.publicKey);
  if (balance >= lamports) return "already-funded";

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: sessionKey.publicKey,
      lamports: lamports - balance,
    })
  );
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

/**
 * Withdraw remaining SOL from session key back to the user's wallet.
 * Signed by the session key directly — no wallet popup.
 */
export async function withdrawToWallet(
  sessionKey: Keypair,
  walletPubkey: PublicKey,
  connection: Connection
): Promise<string | null> {
  const balance = await connection.getBalance(sessionKey.publicKey);
  if (balance <= 5000) return null; // not worth withdrawing

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sessionKey.publicKey,
      toPubkey: walletPubkey,
      lamports: balance - 5000, // leave dust for rent
    })
  );
  tx.feePayer = sessionKey.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(sessionKey);

  return connection.sendRawTransaction(tx.serialize());
}

/** Clear session key from localStorage for a specific wallet. */
export function clearSessionKey(walletPubkey: PublicKey): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_PREFIX + walletPubkey.toBase58());
}

/** Check if a session key exists in localStorage for a specific wallet. */
export function hasSessionKey(walletPubkey: PublicKey): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_PREFIX + walletPubkey.toBase58()) !== null;
}
