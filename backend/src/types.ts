/**
 * Wire-safe game state for WebSocket transport.
 * All BN → string, all PublicKey → base58 string.
 */

export interface WireGameConfig {
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
}

export interface WirePlayerState {
  authority: string | null;
  x: number;
  y: number;
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
}

export interface WireBombState {
  owner: string | null;
  x: number;
  y: number;
  range: number;
  fuseSlots: number;
  placedAtSlot: string;
  active: boolean;
  detonated: boolean;
}

export interface WireGameState {
  config: WireGameConfig;
  grid: {
    cells: number[];
    powerupTypes: number[];
  };
  players: WirePlayerState[];
  bombs: WireBombState[];
  currentSlot: number;
  timestamp: number;
  delegated: boolean;
}

// ─── Server → Client messages ──────────────────────────────

export type ServerMessage =
  | { type: "state"; data: WireGameState }
  | { type: "crank"; action: string; tx: string | null }
  | { type: "error"; message: string };
