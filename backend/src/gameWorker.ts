import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_LOBBY_MS,
  CRANK_COOLDOWN_MS,
  STATUS_LOBBY,
  STATUS_ACTIVE,
  STATUS_FINISHED,
  STATUS_CLAIMED,
  MAX_BOMBS,
  EXPLOSION_DURATION_SLOTS,
} from "./config";
import {
  fetchFullGameState,
  getAllPlayerPdas,
  sendDetonateBomb,
  sendCheckGameEnd,
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

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastCrankTime = 0;
  private checkGameEndSent = false;
  private _lastWireState: WireGameState | null = null;
  private _status: number;

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

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[GameWorker] Started for game ${this.gamePdaStr.slice(0, 8)}...`);
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[GameWorker] Stopped for game ${this.gamePdaStr.slice(0, 8)}...`);
  }

  private scheduleNext() {
    if (!this.running) return;
    const interval = this._status === STATUS_ACTIVE
      ? POLL_INTERVAL_ACTIVE_MS
      : POLL_INTERVAL_LOBBY_MS;
    this.timer = setTimeout(() => this.tick(), interval);
  }

  private async tick() {
    if (!this.running) return;

    try {
      const state = await fetchFullGameState(this.gamePda, this.maxPlayers);
      if (!state) {
        this.scheduleNext();
        return;
      }

      this._status = state.game.status;

      // Crank bombs if active
      if (state.game.status === STATUS_ACTIVE) {
        await this.crankBombs(state);
        await this.crankGameEnd(state);
      }

      // Convert to wire format and broadcast
      const wire = toWireState(state);
      this._lastWireState = wire;
      broadcastToGame(this.gamePdaStr, { type: "state", data: wire });
    } catch (e) {
      console.error(`[GameWorker] tick error for ${this.gamePdaStr.slice(0, 8)}:`, e);
    }

    this.scheduleNext();
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

    // Send up to 2 detonations per tick (TX size limits)
    for (const idx of expiredIndices.slice(0, 2)) {
      const sig = await sendDetonateBomb(this.gamePda, idx, playerPdas);
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
    const sig = await sendCheckGameEnd(this.gamePda, playerPdas);

    if (sig) {
      console.log(`[Crank] checkGameEnd for ${this.gamePdaStr.slice(0, 8)}: ${sig.slice(0, 16)}...`);
      broadcastToGame(this.gamePdaStr, { type: "crank", action: "checkGameEnd", tx: sig });
    } else {
      // Reset so we can try again next tick
      this.checkGameEndSent = false;
    }
  }
}

// ─── State Conversion ──────────────────────────────────────

const PUBKEY_DEFAULT = PublicKey.default.toBase58();

function toWireState(state: FetchedGameState): WireGameState {
  const g = state.game;

  // Clear expired explosions in the wire state (on-chain only clears on
  // next detonateBomb/movePlayer, so without this patch explosions persist
  // visually if no one acts after a detonation).
  const cells = Array.from(g.cells);
  const lastDet = typeof g.lastDetonateSlot === "number"
    ? g.lastDetonateSlot
    : parseInt(g.lastDetonateSlot.toString());
  if (lastDet > 0 && state.currentSlot > lastDet + EXPLOSION_DURATION_SLOTS) {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 4 /* CELL_EXPLOSION */) {
        cells[i] = 0 /* CELL_EMPTY */;
      }
    }
  }

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
    cells,
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
      });
    } else {
      players.push({
        authority: null,
        x: 0, y: 0, alive: false,
        collectedSol: "0", wager: "0",
        bombRange: 0, maxBombs: 0, activeBombs: 0, speed: 0,
        playerIndex: i, lastMoveSlot: "0", kills: 0,
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
  };
}

function pubkeyOrNull(pk: PublicKey | any): string | null {
  if (!pk) return null;
  const str = pk.toBase58 ? pk.toBase58() : String(pk);
  return str === PUBKEY_DEFAULT ? null : str;
}
