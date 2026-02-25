import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export interface GameConfig {
  gameId: BN;
  authority: PublicKey | null;
  gridWidth: number;
  gridHeight: number;
  maxPlayers: number;
  currentPlayers: number;
  entryFee: BN;
  prizePool: BN;
  status: number; // 0=Lobby, 1=Active, 2=Finished, 3=Claimed
  winner: PublicKey | null;
  createdAt: BN;
  startedAt: BN;
  roundDuration: number;
  platformFeeBps: number;
}

export interface GridState {
  cells: number[]; // 143 elements, values 0-6
  powerupTypes: number[]; // 143 elements
}

export interface PlayerState {
  authority: PublicKey | null;
  x: number;
  y: number;
  alive: boolean;
  collectedSol: BN;
  wager: BN;
  bombRange: number;
  maxBombs: number;
  activeBombs: number;
  speed: number;
  playerIndex: number;
  lastMoveSlot: BN;
  kills: number;
}

export interface BombState {
  owner: PublicKey | null;
  x: number;
  y: number;
  range: number;
  fuseSlots: number;
  placedAtSlot: BN;
  detonated: boolean;
}

export interface FullGameState {
  config: GameConfig;
  grid: GridState;
  players: PlayerState[];
  bombs: BombState[];
  delegated: boolean;
}
