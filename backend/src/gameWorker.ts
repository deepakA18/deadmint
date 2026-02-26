import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_ACTIVE_ER_MS,
  POLL_INTERVAL_LOBBY_MS,
  CRANK_COOLDOWN_MS,
  DELEGATION_TIMEOUT_MS,
  DELEGATION_CHECK_INTERVAL_MS,
  STATUS_LOBBY,
  STATUS_ACTIVE,
  STATUS_FINISHED,
  STATUS_CLAIMED,
  MAX_BOMBS,
} from "./config";
import {
  fetchFullGameState,
  getAllPlayerPdas,
  deriveGamePda,
  derivePlayerPda,
  sendDetonateBomb,
  sendCheckGameEnd,
  sendDelegatePda,
  sendUndelegatePda,
  isDelegated,
  type FetchedGameState,
} from "./solana";
import type { WireGameState, WireBombState, WirePlayerState, ServerMessage } from "./types";
import { broadcastToGame } from "./wsServer";

// ─── Per-Game Worker ───────────────────────────────────────

export class GameWorker {
  readonly gamePda: PublicKey;
  readonly gamePdaStr: string;
  readonly gameId: BN;
  readonly maxPlayers: number;

  private _rpcTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastCrankTime = 0;
  private checkGameEndSent = false;
  private _lastWireState: WireGameState | null = null;
  private _status: number;
  private _delegated = false;
  private _delegating = false;
  private _undelegating = false;

  constructor(gamePda: PublicKey, gameId: BN, maxPlayers: number, initialStatus = STATUS_LOBBY) {
    this.gamePda = gamePda;
    this.gamePdaStr = gamePda.toBase58();
    this.gameId = gameId;
    this.maxPlayers = maxPlayers;
    this._status = initialStatus;
  }

  get status(): number {
    return this._status;
  }

  get lastWireState(): WireGameState | null {
    return this._lastWireState;
  }

  start(staggerMs = 0) {
    if (this.running) return;
    this.running = true;
    console.log(`[GameWorker] Started for game ${this.gamePdaStr.slice(0, 8)}...`);
    // Stagger first tick to avoid all workers hitting RPC simultaneously
    if (staggerMs > 0) {
      this._rpcTimer = setTimeout(() => this.rpcTick(), staggerMs);
    } else {
      this.scheduleRpcLoop();
    }
  }

  stop() {
    this.running = false;
    if (this._rpcTimer) { clearTimeout(this._rpcTimer); this._rpcTimer = null; }
    console.log(`[GameWorker] Stopped for game ${this.gamePdaStr.slice(0, 8)}...`);
  }

  // ─── RPC Poll → Broadcast Loop ─────────────────────────────

  private scheduleRpcLoop() {
    if (!this.running) return;
    const ms = this._status === STATUS_ACTIVE
      ? (this._delegated ? POLL_INTERVAL_ACTIVE_ER_MS : POLL_INTERVAL_ACTIVE_MS)
      : POLL_INTERVAL_LOBBY_MS;
    this._rpcTimer = setTimeout(() => this.rpcTick(), ms);
  }

  /**
   * Fetches authoritative state from ER/chain, broadcasts to WS clients,
   * sends crank TXs, and handles delegation transitions.
   * Pure relay — no simulation, no ticks, no state derivation.
   */
  private async rpcTick() {
    if (!this.running) return;

    try {
      const state = await fetchFullGameState(this.gamePda, this.maxPlayers, this._delegated);
      if (!state) {
        this.scheduleRpcLoop();
        return;
      }

      const prevStatus = this._status;
      this._status = state.game.status;

      // Trigger delegation when game transitions to ACTIVE
      if (prevStatus !== STATUS_ACTIVE && state.game.status === STATUS_ACTIVE && !this._delegated && !this._delegating) {
        this.triggerDelegation();
      }

      // Trigger undelegation when game transitions to FINISHED while delegated
      if (state.game.status === STATUS_FINISHED && this._delegated && !this._undelegating) {
        this.triggerUndelegation();
      }

      // Active-only: crank TXs (detonateBomb, checkGameEnd)
      if (state.game.status === STATUS_ACTIVE) {
        await this.crankBombs(state);
        await this.crankGameEnd(state);
      }

      // Broadcast ER state to all connected clients
      const wire = toWireState(state, this._delegated);
      this._lastWireState = wire;
      broadcastToGame(this.gamePdaStr, { type: "state", data: wire });
    } catch (e) {
      console.error(`[GameWorker] rpcTick error for ${this.gamePdaStr.slice(0, 8)}:`, e);
    }

    this.scheduleRpcLoop();
  }

  private async crankBombs(state: FetchedGameState) {
    const now = Date.now();
    if (now - this.lastCrankTime < CRANK_COOLDOWN_MS) return;

    const playerPdas = getAllPlayerPdas(this.gamePda, this.maxPlayers);
    const expiredIndices: number[] = [];

    for (let i = 0; i < MAX_BOMBS; i++) {
      const bomb = state.game.bombs[i];
      if (!bomb || !bomb.active || bomb.detonated) continue;

      const placedAt = typeof bomb.placedAtSlot === "number"
        ? bomb.placedAtSlot
        : parseInt(bomb.placedAtSlot.toString());
      const fuseSlots = bomb.fuseSlots;

      if (state.currentSlot >= placedAt + fuseSlots) {
        expiredIndices.push(i);
      }
    }

    // Send up to 2 detonations per poll (TX size limits)
    for (const idx of expiredIndices.slice(0, 2)) {
      const sig = await sendDetonateBomb(this.gamePda, idx, playerPdas, this._delegated);
      if (sig) {
        console.log(`[Crank] detonateBomb(${idx}) for ${this.gamePdaStr.slice(0, 8)}: ${sig.slice(0, 16)}...`);
        broadcastToGame(this.gamePdaStr, { type: "crank", action: "detonateBomb", tx: sig });
        this.lastCrankTime = Date.now();
      }
    }
  }

  private async crankGameEnd(state: FetchedGameState) {
    if (this.checkGameEndSent) return;
    if (state.game.status !== STATUS_ACTIVE) return;

    // Count alive joined players
    const joinedPlayers = state.players.filter((p) => p !== null);
    if (joinedPlayers.length < state.game.maxPlayers) return;

    const alivePlayers = joinedPlayers.filter((p) => p!.alive);
    if (alivePlayers.length > 1) return;

    // Only 0 or 1 alive — time to end
    this.checkGameEndSent = true;
    const playerPdas = getAllPlayerPdas(this.gamePda, this.maxPlayers);
    const sig = await sendCheckGameEnd(this.gamePda, playerPdas, this._delegated);

    if (sig) {
      console.log(`[Crank] checkGameEnd for ${this.gamePdaStr.slice(0, 8)}: ${sig.slice(0, 16)}...`);
      broadcastToGame(this.gamePdaStr, { type: "crank", action: "checkGameEnd", tx: sig });
    } else {
      // Reset so we can try again next poll
      this.checkGameEndSent = false;
    }
  }

  // ─── Delegation Lifecycle ───────────────────────────────

  /**
   * Delegates the Game PDA and all Player PDAs to the Ephemeral Rollup.
   * Runs asynchronously (fire-and-forget from poll loop).
   */
  private async triggerDelegation() {
    this._delegating = true;
    const tag = this.gamePdaStr.slice(0, 8);
    console.log(`[ER] Delegating game ${tag}...`);

    try {
      // Build seeds for game PDA: ["game", gameId as LE u64]
      const gameIdLE = Buffer.alloc(8);
      gameIdLE.writeBigUInt64LE(BigInt(this.gameId.toString()));
      const gameSeeds = [Buffer.from("game"), gameIdLE];

      // Delegate game PDA
      const gameSig = await sendDelegatePda(this.gamePda, gameSeeds);
      if (!gameSig) {
        console.error(`[ER] Game delegation failed for ${tag}, falling back to base layer`);
        this._delegating = false;
        return;
      }
      console.log(`[ER] Game PDA delegated: ${gameSig.slice(0, 16)}...`);

      // Delegate all player PDAs
      for (let i = 0; i < this.maxPlayers; i++) {
        const [playerPda] = derivePlayerPda(this.gamePda, i);
        const playerSeeds = [Buffer.from("player"), this.gamePda.toBuffer(), Buffer.from([i])];
        const pSig = await sendDelegatePda(playerPda, playerSeeds);
        if (pSig) {
          console.log(`[ER] Player ${i} PDA delegated: ${pSig.slice(0, 16)}...`);
        } else {
          console.warn(`[ER] Player ${i} delegation failed for ${tag}`);
        }
      }

      // Poll until game PDA is confirmed delegated on base layer
      const deadline = Date.now() + DELEGATION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await isDelegated(this.gamePda)) {
          this._delegated = true;
          this._delegating = false;
          console.log(`[ER] Delegation confirmed for game ${tag}`);
          return;
        }
        await sleep(DELEGATION_CHECK_INTERVAL_MS);
      }

      console.warn(`[ER] Delegation timeout for ${tag}, continuing on base layer`);
    } catch (e) {
      console.error(`[ER] Delegation error for ${tag}:`, e);
    }
    this._delegating = false;
  }

  /**
   * Undelegates all accounts — commits state back to base layer.
   * Runs asynchronously when game finishes.
   */
  private async triggerUndelegation() {
    this._undelegating = true;
    const tag = this.gamePdaStr.slice(0, 8);
    console.log(`[ER] Undelegating game ${tag}...`);

    try {
      // Undelegate player PDAs first, then game PDA
      for (let i = 0; i < this.maxPlayers; i++) {
        const [playerPda] = derivePlayerPda(this.gamePda, i);
        const pSig = await sendUndelegatePda(playerPda);
        if (pSig) {
          console.log(`[ER] Player ${i} undelegated: ${pSig.slice(0, 16)}...`);
        }
      }

      const gameSig = await sendUndelegatePda(this.gamePda);
      if (gameSig) {
        console.log(`[ER] Game PDA undelegated: ${gameSig.slice(0, 16)}...`);
      }

      // Poll until game PDA ownership returns to our program on base layer
      const deadline = Date.now() + DELEGATION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (!(await isDelegated(this.gamePda))) {
          this._delegated = false;
          this._undelegating = false;
          console.log(`[ER] Undelegation confirmed for game ${tag}`);
          return;
        }
        await sleep(DELEGATION_CHECK_INTERVAL_MS);
      }

      console.warn(`[ER] Undelegation timeout for ${tag}`);
    } catch (e) {
      console.error(`[ER] Undelegation error for ${tag}:`, e);
    }
    this._delegated = false;
    this._undelegating = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── State Conversion (pure relay: BN→string, PK→base58) ───

const PUBKEY_DEFAULT = PublicKey.default.toBase58();

function toWireState(
  state: FetchedGameState,
  delegated: boolean,
): WireGameState {
  const g = state.game;

  const config = {
    gameId: g.gameId.toString(),
    authority: pubkeyOrNull(g.authority),
    gridWidth: g.gridWidth,
    gridHeight: g.gridHeight,
    maxPlayers: g.maxPlayers,
    currentPlayers: g.currentPlayers,
    entryFee: g.entryFee.toString(),
    prizePool: g.prizePool.toString(),
    status: g.status,
    winner: pubkeyOrNull(g.winner),
    createdAt: g.createdAt.toString(),
    startedAt: g.startedAt.toString(),
    roundDuration: g.roundDuration,
    platformFeeBps: g.platformFeeBps,
  };

  const grid = {
    cells: Array.from(g.cells),
    powerupTypes: Array.from(g.powerupTypes),
  };

  const players: WirePlayerState[] = [];
  for (let i = 0; i < state.game.maxPlayers; i++) {
    const p = state.players[i];
    if (p) {
      players.push({
        authority: pubkeyOrNull(p.authority),
        x: p.x,
        y: p.y,
        alive: p.alive,
        collectedSol: p.collectedSol.toString(),
        wager: p.wager.toString(),
        bombRange: p.bombRange,
        maxBombs: p.maxBombs,
        activeBombs: p.activeBombs,
        speed: p.speed,
        playerIndex: p.playerIndex,
        lastMoveSlot: p.lastMoveSlot.toString(),
        kills: p.kills,
        inputNonce: typeof p.inputNonce === "number" ? p.inputNonce : parseInt((p.inputNonce ?? 0).toString()),
      });
    } else {
      players.push({
        authority: null,
        x: 0, y: 0, alive: false,
        collectedSol: "0", wager: "0",
        bombRange: 0, maxBombs: 0, activeBombs: 0, speed: 0,
        playerIndex: i, lastMoveSlot: "0", kills: 0,
        inputNonce: 0,
      });
    }
  }

  const bombs: WireBombState[] = [];
  for (let i = 0; i < MAX_BOMBS; i++) {
    const b = g.bombs[i];
    if (b && (b.active || b.detonated)) {
      bombs.push({
        owner: pubkeyOrNull(b.owner),
        x: b.x,
        y: b.y,
        range: b.range,
        fuseSlots: b.fuseSlots,
        placedAtSlot: b.placedAtSlot.toString(),
        active: b.active,
        detonated: b.detonated,
        originalIndex: i,
      });
    }
  }

  return {
    config,
    grid,
    players,
    bombs,
    currentSlot: state.currentSlot,
    timestamp: Date.now(),
    delegated,
  };
}

function pubkeyOrNull(pk: PublicKey | any): string | null {
  if (!pk) return null;
  const str = pk.toBase58 ? pk.toBase58() : String(pk);
  return str === PUBKEY_DEFAULT ? null : str;
}
