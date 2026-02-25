import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { FullGameState, GameConfig, PlayerState, BombState, GridState } from "./types";

// ─── Wire Types (matches backend/src/types.ts) ─────────────

interface WireGameState {
  config: {
    gameId: string;
    authority: string | null;
    gridWidth: number;
    gridHeight: number;
    maxPlayers: number;
    currentPlayers: number;
    entryFee: string;
    prizePool: string;
    status: number;
    winner: string | null;
    createdAt: string;
    startedAt: string;
    roundDuration: number;
    platformFeeBps: number;
  };
  grid: { cells: number[]; powerupTypes: number[] };
  players: {
    authority: string | null;
    x: number; y: number;
    alive: boolean;
    collectedSol: string;
    wager: string;
    bombRange: number;
    maxBombs: number;
    activeBombs: number;
    speed: number;
    playerIndex: number;
    lastMoveSlot: string;
    kills: number;
  }[];
  bombs: {
    owner: string | null;
    x: number; y: number;
    range: number;
    fuseSlots: number;
    placedAtSlot: string;
    active: boolean;
    detonated: boolean;
  }[];
  currentSlot: number;
  timestamp: number;
  delegated: boolean;
}

type ServerMessage =
  | { type: "state"; data: WireGameState }
  | { type: "crank"; action: string; tx: string | null }
  | { type: "error"; message: string };

// ─── Backend URL ───────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "ws://localhost:8080";

// ─── Wire → App Type Conversion ────────────────────────────

function wireToFullState(wire: WireGameState): FullGameState {
  const w = wire.config;

  const config: GameConfig = {
    gameId: new BN(w.gameId),
    authority: w.authority ? new PublicKey(w.authority) : null,
    gridWidth: w.gridWidth,
    gridHeight: w.gridHeight,
    maxPlayers: w.maxPlayers,
    currentPlayers: w.currentPlayers,
    entryFee: new BN(w.entryFee),
    prizePool: new BN(w.prizePool),
    status: w.status,
    winner: w.winner ? new PublicKey(w.winner) : null,
    createdAt: new BN(w.createdAt),
    startedAt: new BN(w.startedAt),
    roundDuration: w.roundDuration,
    platformFeeBps: w.platformFeeBps,
  };

  const grid: GridState = {
    cells: wire.grid.cells,
    powerupTypes: wire.grid.powerupTypes,
  };

  const players: PlayerState[] = wire.players.map((p) => ({
    authority: p.authority ? new PublicKey(p.authority) : null,
    x: p.x,
    y: p.y,
    alive: p.alive,
    collectedSol: new BN(p.collectedSol),
    wager: new BN(p.wager),
    bombRange: p.bombRange,
    maxBombs: p.maxBombs,
    activeBombs: p.activeBombs,
    speed: p.speed,
    playerIndex: p.playerIndex,
    lastMoveSlot: new BN(p.lastMoveSlot),
    kills: p.kills,
  }));

  const bombs: BombState[] = wire.bombs.map((b) => ({
    owner: b.owner ? new PublicKey(b.owner) : null,
    x: b.x,
    y: b.y,
    range: b.range,
    fuseSlots: b.fuseSlots,
    placedAtSlot: new BN(b.placedAtSlot),
    detonated: b.detonated,
  }));

  return { config, grid, players, bombs, delegated: wire.delegated ?? false };
}

// ─── WebSocket Connection ──────────────────────────────────

export interface GameConnection {
  close: () => void;
}

export function connectToGame(
  gamePda: string,
  onState: (state: FullGameState) => void,
  onCrank?: (action: string, tx: string | null) => void
): GameConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;

    const url = `${BACKEND_URL}/ws?game=${gamePda}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WS] Connected to backend");
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "state") {
          onState(wireToFullState(msg.data));
        } else if (msg.type === "crank" && onCrank) {
          onCrank(msg.action, msg.tx);
        }
      } catch (e) {
        console.error("[WS] Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      if (!closed) {
        console.log("[WS] Disconnected, reconnecting in 2s...");
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },
  };
}

// ─── HTTP Helpers ──────────────────────────────────────────

const HTTP_URL = BACKEND_URL.replace(/^ws/, "http");

export async function registerGameWithBackend(
  gamePda: string,
  gameId: string,
  maxPlayers: number
): Promise<void> {
  try {
    await fetch(`${HTTP_URL}/api/games/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamePda, gameId, maxPlayers }),
    });
  } catch {
    // Best-effort — backend also auto-discovers
    console.warn("[Backend] Failed to register game, backend will auto-discover");
  }
}

export async function fetchGamesFromBackend(): Promise<
  { gamePda: string; gameId: string; maxPlayers: number; status: number }[]
> {
  try {
    const res = await fetch(`${HTTP_URL}/api/games`);
    const data = await res.json();
    return data.games || [];
  } catch {
    return [];
  }
}
