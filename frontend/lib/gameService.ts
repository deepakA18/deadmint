import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  type SendOptions,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  RPC_URL,
  EPHEMERAL_RPC_URL,
  PROGRAM_ID,
} from "./constants";
import type { FullGameState, GameConfig, GridState, PlayerState, BombState } from "./types";
import idlJson from "./idl/deadmint.json";
import type { Deadmint } from "./idl/deadmint";

// ─── Wallet interface (matches wallet-adapter-react) ──────────

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  sendTransaction: (
    tx: Transaction,
    connection: Connection,
    options?: SendOptions
  ) => Promise<string>;
}

// ─── Connection helpers ───────────────────────────────────────

function resolveRpcUrl(url: string): string {
  if (url.startsWith("http")) return url;
  if (typeof window !== "undefined") return `${window.location.origin}${url}`;
  return `http://localhost:3000${url}`;
}

let _baseConn: Connection | null = null;
let _erConn: Connection | null = null;

export function getBaseConnection(): Connection {
  if (!_baseConn) {
    const httpUrl = resolveRpcUrl(RPC_URL);
    // If using the /api/rpc proxy, WS isn't supported — use public devnet WS endpoint
    const wsEndpoint = httpUrl.includes("/api/rpc")
      ? "wss://api.devnet.solana.com"
      : undefined;
    _baseConn = new Connection(httpUrl, { commitment: "confirmed", wsEndpoint });
  }
  return _baseConn;
}

export function getErConnection(): Connection {
  if (!_erConn) _erConn = new Connection(EPHEMERAL_RPC_URL, "confirmed");
  return _erConn;
}

// ─── Program helper ──────────────────────────────────────────

function getProgram(connection: Connection): Program<Deadmint> {
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, {
    commitment: "confirmed",
  });
  return new Program(idlJson as any, provider) as unknown as Program<Deadmint>;
}

// ─── PDA helpers ─────────────────────────────────────────────

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

// ─── Send helpers ─────────────────────────────────────────────

async function sendTx(
  wallet: WalletAdapter,
  connection: Connection,
  tx: Transaction,
  opts?: SendOptions
): Promise<string> {
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const sig = await wallet.sendTransaction(tx, connection, opts);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function sendTxWithLogs(
  wallet: WalletAdapter,
  connection: Connection,
  tx: Transaction
): Promise<string> {
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  if (!wallet.signTransaction) {
    return wallet.sendTransaction(tx, connection, { skipPreflight: true });
  }
  const signed = await wallet.signTransaction(tx);
  const raw = signed.serialize();
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: true });

  try {
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (e) {
    const txInfo = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (txInfo?.meta?.logMessages) {
      console.error("TX failed — on-chain logs:", txInfo.meta.logMessages);
    }
    throw e;
  }
  return sig;
}

// ─── Session Key / Signer Abstraction ─────────────────────────

export type Signer = WalletAdapter | Keypair;

function isKeypair(signer: Signer): signer is Keypair {
  return "secretKey" in signer;
}

function getSignerPublicKey(signer: Signer): PublicKey {
  return signer.publicKey;
}

// Cache recent blockhash to avoid a round-trip on every gameplay TX
let _cachedBlockhash: { hash: string; fetchedAt: number } | null = null;
const BLOCKHASH_TTL_MS = 5000; // refresh every 5s (slots are ~400ms)

async function getRecentBlockhash(connection: Connection): Promise<string> {
  const now = Date.now();
  if (_cachedBlockhash && now - _cachedBlockhash.fetchedAt < BLOCKHASH_TTL_MS) {
    return _cachedBlockhash.hash;
  }
  const { blockhash } = await connection.getLatestBlockhash();
  _cachedBlockhash = { hash: blockhash, fetchedAt: now };
  return blockhash;
}

async function sendTxWithSessionKey(
  sessionKey: Keypair,
  connection: Connection,
  tx: Transaction
): Promise<string> {
  tx.feePayer = sessionKey.publicKey;
  tx.recentBlockhash = await getRecentBlockhash(connection);
  tx.sign(sessionKey);
  return connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
}

async function sendGameplayTx(
  signer: Signer,
  connection: Connection,
  tx: Transaction,
  delegated: boolean
): Promise<string> {
  if (isKeypair(signer)) {
    return sendTxWithSessionKey(signer, connection, tx);
  }
  return sendTxWithLogs(signer, connection, tx);
}

// ─── Create Game ──────────────────────────────────────────────

export interface CreateGameResult {
  gamePda: PublicKey;
  gameId: BN;
  playerPda: PublicKey;
}

export async function createGameAndJoin(
  wallet: WalletAdapter,
  entryFeeLamports: BN,
  maxPlayers: number = 4,
  sessionKeyPubkey?: PublicKey
): Promise<CreateGameResult> {
  const connection = getBaseConnection();
  const program = getProgram(connection);
  const payer = wallet.publicKey;

  const gameId = new BN(Date.now());
  const [gamePda] = deriveGamePda(gameId);
  const [playerPda] = derivePlayerPda(gamePda, 0);

  const initGameIx = await program.methods
    .initializeGame(gameId, entryFeeLamports, maxPlayers)
    .accountsPartial({
      game: gamePda,
      payer,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const joinGameIx = await program.methods
    .joinGame(sessionKeyPubkey || payer)
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      payer,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // Single transaction: init + join (one wallet popup)
  await sendTx(wallet, connection, new Transaction().add(initGameIx, joinGameIx));

  return { gamePda, gameId, playerPda };
}

// ─── Join Game ────────────────────────────────────────────────

export interface JoinGameResult {
  playerPda: PublicKey;
}

export async function joinGame(
  wallet: WalletAdapter,
  gamePda: PublicKey,
  sessionKeyPubkey?: PublicKey
): Promise<JoinGameResult> {
  const connection = getBaseConnection();
  const program = getProgram(connection);
  const payer = wallet.publicKey;

  const game = await program.account.game.fetch(gamePda);
  if (game.status !== 0) throw new Error("Game is not in lobby — cannot join");

  // Check for duplicate join
  for (let i = 0; i < game.currentPlayers; i++) {
    const [existingPlayerPda] = derivePlayerPda(gamePda, i);
    try {
      const existingPlayer = await program.account.player.fetch(existingPlayerPda);
      if (existingPlayer.authority.toBase58() === payer.toBase58()) {
        throw new Error("You have already joined this game");
      }
    } catch (e: any) {
      if (e.message === "You have already joined this game") throw e;
    }
  }

  const playerIndex = game.currentPlayers;
  const [playerPda] = derivePlayerPda(gamePda, playerIndex);

  const joinIx = await program.methods
    .joinGame(sessionKeyPubkey || payer)
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      payer,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  await sendTx(wallet, connection, new Transaction().add(joinIx));
  return { playerPda };
}

// ─── Gameplay Actions ─────────────────────────────────────────

export async function movePlayer(
  signer: Signer,
  gamePda: PublicKey,
  playerPda: PublicKey,
  direction: number,
  delegated = false
): Promise<string> {
  const connection = delegated ? getErConnection() : getBaseConnection();
  const program = getProgram(connection);

  const ix = await program.methods
    .movePlayer(direction)
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      authority: getSignerPublicKey(signer),
    })
    .instruction();

  return sendGameplayTx(signer, connection, new Transaction().add(ix), delegated);
}

export async function movePlayerWithCrank(
  signer: Signer,
  gamePda: PublicKey,
  playerPda: PublicKey,
  direction: number,
  expiredBombIndices: number[],
  playerPdas: PublicKey[],
  delegated = false
): Promise<string> {
  const connection = delegated ? getErConnection() : getBaseConnection();
  const program = getProgram(connection);
  const authority = getSignerPublicKey(signer);
  const tx = new Transaction();

  // Add detonation IXs for expired bombs (limit to 2 for tx size)
  for (const bombIdx of expiredBombIndices.slice(0, 2)) {
    const detonateIx = await program.methods
      .detonateBomb(bombIdx)
      .accountsPartial({
        game: gamePda,
        authority,
      })
      .remainingAccounts(
        playerPdas.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: true }))
      )
      .instruction();
    tx.add(detonateIx);
  }

  const moveIx = await program.methods
    .movePlayer(direction)
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      authority,
    })
    .instruction();
  tx.add(moveIx);

  return sendGameplayTx(signer, connection, tx, delegated);
}

export async function placeBomb(
  signer: Signer,
  gamePda: PublicKey,
  playerPda: PublicKey,
  delegated = false
): Promise<string> {
  const connection = delegated ? getErConnection() : getBaseConnection();
  const program = getProgram(connection);

  const ix = await program.methods
    .placeBomb()
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      authority: getSignerPublicKey(signer),
    })
    .instruction();

  return sendGameplayTx(signer, connection, new Transaction().add(ix), delegated);
}

export async function detonateBomb(
  signer: Signer,
  gamePda: PublicKey,
  bombIndex: number,
  playerPdas: PublicKey[],
  delegated = false
): Promise<string> {
  const connection = delegated ? getErConnection() : getBaseConnection();
  const program = getProgram(connection);

  const ix = await program.methods
    .detonateBomb(bombIndex)
    .accountsPartial({
      game: gamePda,
      authority: getSignerPublicKey(signer),
    })
    .remainingAccounts(
      playerPdas.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: true }))
    )
    .instruction();

  return sendGameplayTx(signer, connection, new Transaction().add(ix), delegated);
}

export async function checkGameEnd(
  signer: Signer,
  gamePda: PublicKey,
  playerPdas: PublicKey[],
  delegated = false
): Promise<string> {
  const connection = delegated ? getErConnection() : getBaseConnection();
  const program = getProgram(connection);

  const ix = await program.methods
    .checkGameEnd()
    .accountsPartial({
      game: gamePda,
      authority: getSignerPublicKey(signer),
    })
    .remainingAccounts(
      playerPdas.map((pk) => ({ pubkey: pk, isSigner: false, isWritable: false }))
    )
    .instruction();

  return sendGameplayTx(signer, connection, new Transaction().add(ix), delegated);
}

export async function claimPrize(
  signer: Signer,
  gamePda: PublicKey,
  playerPda: PublicKey
): Promise<string> {
  const connection = getBaseConnection();
  const program = getProgram(connection);

  const ix = await program.methods
    .claimPrize()
    .accountsPartial({
      game: gamePda,
      player: playerPda,
      winner: getSignerPublicKey(signer),
    })
    .instruction();

  return sendGameplayTx(signer, connection, new Transaction().add(ix), false);
}

// ─── State Fetching ───────────────────────────────────────────

export async function fetchGameConfig(
  connection: Connection,
  gamePda: PublicKey
): Promise<GameConfig | null> {
  const program = getProgram(connection);
  try {
    const game = await program.account.game.fetch(gamePda);
    return anchorGameToConfig(game);
  } catch {
    return null;
  }
}

export async function fetchFullGameState(
  connection: Connection,
  gamePda: PublicKey,
  maxPlayers: number
): Promise<FullGameState | null> {
  const program = getProgram(connection);

  try {
    const game = await program.account.game.fetch(gamePda);
    const config = anchorGameToConfig(game);
    const grid: GridState = {
      cells: Array.from(game.cells),
      powerupTypes: Array.from(game.powerupTypes),
    };

    const players: PlayerState[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const [playerPda] = derivePlayerPda(gamePda, i);
      try {
        const p = await program.account.player.fetch(playerPda);
        players.push(anchorPlayerToState(p));
      } catch {
        players.push({
          authority: null,
          x: 0, y: 0, alive: false,
          collectedSol: new BN(0), wager: new BN(0),
          bombRange: 0, maxBombs: 0, activeBombs: 0, speed: 0,
          playerIndex: i, lastMoveSlot: new BN(0), kills: 0,
        });
      }
    }

    // Bombs embedded in game account
    const bombs: BombState[] = game.bombs
      .filter((b: any) => b.active || b.detonated)
      .map((b: any) => ({
        owner: b.owner.toBase58() === PublicKey.default.toBase58() ? null : b.owner,
        x: b.x, y: b.y, range: b.range,
        fuseSlots: b.fuseSlots,
        placedAtSlot: b.placedAtSlot,
        detonated: b.detonated,
      }));

    return { config, grid, players, bombs, delegated: false };
  } catch (e) {
    console.error("fetchFullGameState error:", e);
    return null;
  }
}

// ─── Anchor ↔ App Type Converters ─────────────────────────────

function anchorGameToConfig(game: any): GameConfig {
  return {
    gameId: game.gameId,
    authority: game.authority.toBase58() === PublicKey.default.toBase58() ? null : game.authority,
    gridWidth: game.gridWidth,
    gridHeight: game.gridHeight,
    maxPlayers: game.maxPlayers,
    currentPlayers: game.currentPlayers,
    entryFee: game.entryFee,
    prizePool: game.prizePool,
    status: game.status,
    winner: game.winner.toBase58() === PublicKey.default.toBase58() ? null : game.winner,
    createdAt: game.createdAt,
    startedAt: game.startedAt,
    roundDuration: game.roundDuration,
    platformFeeBps: game.platformFeeBps,
  };
}

function anchorPlayerToState(p: any): PlayerState {
  return {
    authority: p.authority.toBase58() === PublicKey.default.toBase58() ? null : p.authority,
    x: p.x, y: p.y,
    alive: p.alive,
    collectedSol: p.collectedSol,
    wager: p.wager,
    bombRange: p.bombRange,
    maxBombs: p.maxBombs,
    activeBombs: p.activeBombs,
    speed: p.speed,
    playerIndex: p.playerIndex,
    lastMoveSlot: p.lastMoveSlot,
    kills: p.kills,
  };
}

// ─── Discover Games (getProgramAccounts) ──────────────────────

export async function discoverGames(
  connection: Connection
): Promise<{ gamePda: PublicKey; config: GameConfig }[]> {
  const program = getProgram(connection);
  try {
    const allGames = await program.account.game.all();
    return allGames.map((g) => ({
      gamePda: g.publicKey,
      config: anchorGameToConfig(g.account),
    }));
  } catch {
    return [];
  }
}
