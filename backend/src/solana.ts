import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { RPC_URL, PROGRAM_ID_STR, loadCrankKeypair } from "./config";
import idlJson from "./idl/deadmint.json";
import type { Deadmint } from "./idl/deadmint";

// ─── Constants ─────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

// ─── Singletons ────────────────────────────────────────────

let _connection: Connection | null = null;
let _program: Program<Deadmint> | null = null;
let _crankKeypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, "confirmed");
  return _connection;
}

export function getProgram(): Program<Deadmint> {
  if (!_program) {
    const conn = getConnection();
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    };
    const provider = new AnchorProvider(conn, dummyWallet as any, {
      commitment: "confirmed",
    });
    _program = new Program(idlJson as any, provider) as unknown as Program<Deadmint>;
  }
  return _program;
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
  bump: number;
}

export interface FetchedGameState {
  game: RawGameAccount;
  players: (RawPlayerAccount | null)[];
  currentSlot: number;
}

/**
 * Fetches game + all player accounts in a single batched RPC call.
 */
export async function fetchFullGameState(
  gamePda: PublicKey,
  maxPlayers: number
): Promise<FetchedGameState | null> {
  const conn = getConnection();
  const program = getProgram();

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
 * Returns the TX signature or null on expected errors.
 */
export async function sendDetonateBomb(
  gamePda: PublicKey,
  bombIndex: number,
  playerPdas: PublicKey[]
): Promise<string | null> {
  const conn = getConnection();
  const program = getProgram();
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
 */
export async function sendCheckGameEnd(
  gamePda: PublicKey,
  playerPdas: PublicKey[]
): Promise<string | null> {
  const conn = getConnection();
  const program = getProgram();
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
