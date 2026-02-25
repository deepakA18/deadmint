import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { RPC_URL, EPHEMERAL_RPC_URL, PROGRAM_ID_STR, DELEGATION_PROGRAM_ID_STR, ER_VALIDATOR_STR, loadCrankKeypair } from "./config";
import idlJson from "./idl/deadmint.json";
import type { Deadmint } from "./idl/deadmint";

// ─── Constants ─────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);
export const DELEGATION_PROGRAM_ID = new PublicKey(DELEGATION_PROGRAM_ID_STR);
export const ER_VALIDATOR = new PublicKey(ER_VALIDATOR_STR);

// ─── Singletons ────────────────────────────────────────────

let _connection: Connection | null = null;
let _erConnection: Connection | null = null;
let _program: Program<Deadmint> | null = null;
let _erProgram: Program<Deadmint> | null = null;
let _crankKeypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, "confirmed");
  return _connection;
}

export function getErConnection(): Connection {
  if (!_erConnection) _erConnection = new Connection(EPHEMERAL_RPC_URL, "confirmed");
  return _erConnection;
}

function makeDummyWallet() {
  return {
    publicKey: PublicKey.default,
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs,
  };
}

export function getProgram(): Program<Deadmint> {
  if (!_program) {
    const provider = new AnchorProvider(getConnection(), makeDummyWallet() as any, {
      commitment: "confirmed",
    });
    _program = new Program(idlJson as any, provider) as unknown as Program<Deadmint>;
  }
  return _program;
}

export function getErProgram(): Program<Deadmint> {
  if (!_erProgram) {
    const provider = new AnchorProvider(getErConnection(), makeDummyWallet() as any, {
      commitment: "confirmed",
      skipPreflight: true,
    });
    _erProgram = new Program(idlJson as any, provider) as unknown as Program<Deadmint>;
  }
  return _erProgram;
}

export function getCrankKeypair(): Keypair {
  if (!_crankKeypair) _crankKeypair = loadCrankKeypair();
  return _crankKeypair;
}

// ─── PDA Helpers ───────────────────────────────────────────

export function deriveGamePda(gameId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function derivePlayerPda(gamePda: PublicKey, playerIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), gamePda.toBuffer(), Buffer.from([playerIndex])],
    PROGRAM_ID
  );
}

export function getAllPlayerPdas(gamePda: PublicKey, maxPlayers: number): PublicKey[] {
  const pdas: PublicKey[] = [];
  for (let i = 0; i < maxPlayers; i++) {
    const [pda] = derivePlayerPda(gamePda, i);
    pdas.push(pda);
  }
  return pdas;
}

// ─── Batch State Fetching ──────────────────────────────────

export interface RawGameAccount {
  gameId: any;
  authority: PublicKey;
  gridWidth: number;
  gridHeight: number;
  maxPlayers: number;
  currentPlayers: number;
  entryFee: any;
  prizePool: any;
  status: number;
  winner: PublicKey;
  createdAt: any;
  startedAt: any;
  roundDuration: number;
  platformFeeBps: number;
  bump: number;
  cells: number[];
  powerupTypes: number[];
  bombs: any[];
  bombCount: number;
  lastDetonateSlot: any;
}

export interface RawPlayerAccount {
  game: PublicKey;
  authority: PublicKey;
  playerIndex: number;
  x: number;
  y: number;
  alive: boolean;
  collectedSol: any;
  wager: any;
  bombRange: number;
  maxBombs: number;
  activeBombs: number;
  speed: number;
  lastMoveSlot: any;
  kills: number;
  inputNonce: any;
  bump: number;
}

export interface FetchedGameState {
  game: RawGameAccount;
  players: (RawPlayerAccount | null)[];
  currentSlot: number;
}

/**
 * Fetches game + all player accounts in a single batched RPC call.
 * When useEr=true, fetches from the Ephemeral Rollup instead of base layer.
 */
export async function fetchFullGameState(
  gamePda: PublicKey,
  maxPlayers: number,
  useEr = false
): Promise<FetchedGameState | null> {
  const conn = useEr ? getErConnection() : getConnection();
  const program = useEr ? getErProgram() : getProgram();

  try {
    const playerPdas = getAllPlayerPdas(gamePda, maxPlayers);
    const allKeys = [gamePda, ...playerPdas];

    const [accountInfos, currentSlot] = await Promise.all([
      conn.getMultipleAccountsInfo(allKeys),
      conn.getSlot(),
    ]);

    if (!accountInfos[0]) return null; // Game account doesn't exist

    // Decode game account
    const game = program.coder.accounts.decode("game", accountInfos[0].data) as unknown as RawGameAccount;

    // Decode player accounts
    const players: (RawPlayerAccount | null)[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const info = accountInfos[i + 1];
      if (info) {
        try {
          const player = program.coder.accounts.decode("player", info.data) as unknown as RawPlayerAccount;
          players.push(player);
        } catch {
          players.push(null);
        }
      } else {
        players.push(null);
      }
    }

    return { game, players, currentSlot };
  } catch (e) {
    console.error("fetchFullGameState error:", e);
    return null;
  }
}

// ─── TX Builders (Crank) ───────────────────────────────────

/**
 * Sends a detonateBomb TX signed by the crank keypair.
 * When useEr=true, sends to Ephemeral Rollup (gasless, skipPreflight).
 */
export async function sendDetonateBomb(
  gamePda: PublicKey,
  bombIndex: number,
  playerPdas: PublicKey[],
  useEr = false
): Promise<string | null> {
  const conn = useEr ? getErConnection() : getConnection();
  const program = useEr ? getErProgram() : getProgram();
  const crank = getCrankKeypair();

  const ix = await program.methods
    .detonateBomb(bombIndex)
    .accountsPartial({
      game: gamePda,
      authority: crank.publicKey,
    })
    .remainingAccounts(
      playerPdas.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: true }))
    )
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = crank.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(crank);

  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    return sig;
  } catch (e: any) {
    const msg = e?.message || "";
    // Expected timing races — silently ignore
    if (
      msg.includes("FuseNotExpired") ||
      msg.includes("BombAlreadyDetonated") ||
      msg.includes("BombNotActive") ||
      msg.includes("GameNotActive")
    ) {
      return null;
    }
    console.error(`detonateBomb(${bombIndex}) failed:`, msg);
    return null;
  }
}

/**
 * Sends a checkGameEnd TX signed by the crank keypair.
 * When useEr=true, sends to Ephemeral Rollup.
 */
export async function sendCheckGameEnd(
  gamePda: PublicKey,
  playerPdas: PublicKey[],
  useEr = false
): Promise<string | null> {
  const conn = useEr ? getErConnection() : getConnection();
  const program = useEr ? getErProgram() : getProgram();
  const crank = getCrankKeypair();

  const ix = await program.methods
    .checkGameEnd()
    .accountsPartial({
      game: gamePda,
      authority: crank.publicKey,
    })
    .remainingAccounts(
      playerPdas.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: false }))
    )
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = crank.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(crank);

  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    return sig;
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("GameNotActive")) return null;
    console.error("checkGameEnd failed:", msg);
    return null;
  }
}

// ─── Delegation / Undelegation ─────────────────────────────

/**
 * Checks if a PDA is currently delegated (owned by the delegation program on base layer).
 */
export async function isDelegated(pda: PublicKey): Promise<boolean> {
  try {
    const conn = getConnection();
    const info = await conn.getAccountInfo(pda);
    if (!info) return false;
    return info.owner.equals(DELEGATION_PROGRAM_ID);
  } catch {
    // On RPC error (429, 502, etc.) return false so callers keep retrying
    return false;
  }
}

/**
 * Sends a delegate TX for a single PDA (game or player) to base layer.
 * The seeds are the PDA derivation seeds (e.g. ["game", gameIdLE] or ["player", gamePda, index]).
 */
export async function sendDelegatePda(
  pda: PublicKey,
  seeds: Buffer[]
): Promise<string | null> {
  const conn = getConnection();
  const program = getProgram();
  const crank = getCrankKeypair();

  try {
    const seedsArg = seeds.map((s) => s as Buffer);

    const ix = await program.methods
      .delegate(seedsArg)
      .accountsPartial({
        payer: crank.publicKey,
        pda: pda,
      })
      .remainingAccounts([
        { pubkey: ER_VALIDATOR, isSigner: false, isWritable: false },
      ])
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = crank.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(crank);

    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    return sig;
  } catch (e: any) {
    console.error(`[Delegate] Failed for ${pda.toBase58().slice(0, 8)}:`, e?.message || e);
    return null;
  }
}

/**
 * Sends an undelegate TX for a single PDA to the Ephemeral Rollup.
 * This commits state back to base layer and returns ownership to the program.
 */
export async function sendUndelegatePda(pda: PublicKey): Promise<string | null> {
  const conn = getErConnection();
  const program = getErProgram();
  const crank = getCrankKeypair();

  try {
    const ix = await program.methods
      .undelegate()
      .accountsPartial({
        payer: crank.publicKey,
        pda: pda,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = crank.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(crank);

    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    return sig;
  } catch (e: any) {
    console.error(`[Undelegate] Failed for ${pda.toBase58().slice(0, 8)}:`, e?.message || e);
    return null;
  }
}

// ─── Discovery ─────────────────────────────────────────────

export interface DiscoveredGame {
  gamePda: PublicKey;
  gameId: BN;
  maxPlayers: number;
  status: number;
}

/**
 * Discovers all non-claimed games via getProgramAccounts.
 */
export async function discoverAllGames(): Promise<DiscoveredGame[]> {
  const program = getProgram();
  try {
    const allGames = await program.account.game.all();
    return allGames
      .map((g) => ({
        gamePda: g.publicKey,
        gameId: g.account.gameId as BN,
        maxPlayers: (g.account as any).maxPlayers as number,
        status: (g.account as any).status as number,
      }))
      .filter((g) => g.status < 3); // Exclude STATUS_CLAIMED
  } catch (e) {
    console.error("discoverAllGames error:", e);
    return [];
  }
}
