import { PublicKey } from "@solana/web3.js";

// --- Network ---
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "/api/rpc";
export const EPHEMERAL_RPC_URL =
  process.env.NEXT_PUBLIC_EPHEMERAL_RPC || "https://devnet-as.magicblock.app";
export const EPHEMERAL_WS_URL =
  process.env.NEXT_PUBLIC_EPHEMERAL_WS || "wss://devnet-as.magicblock.app";

// --- Program ID (single Anchor program) ---
export const PROGRAM_ID = new PublicKey(
  "GLnaE4KiQUGDZTtDP1YnTV4dtUbXudBk1kApueC791c"
);

// --- MagicBlock Delegation Program ---
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

// --- Grid ---
export const GRID_WIDTH = 13;
export const GRID_HEIGHT = 11;
export const GRID_CELLS = GRID_WIDTH * GRID_HEIGHT; // 143
export const TILE_SIZE = 48;
export const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE; // 624
export const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE; // 528

// --- Cell Types ---
export const CELL_EMPTY = 0;
export const CELL_WALL = 1;
export const CELL_BLOCK = 2;
export const CELL_BOMB = 3;
export const CELL_EXPLOSION = 4;
export const CELL_LOOT = 5;
export const CELL_POWERUP = 6;

// --- Powerup Types ---
export const POWERUP_BOMB_RANGE = 1;
export const POWERUP_EXTRA_BOMB = 2;
export const POWERUP_SPEED = 3;

// --- Game Status ---
export const STATUS_LOBBY = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_FINISHED = 2;
export const STATUS_CLAIMED = 3;

// --- Directions ---
export const DIR_UP = 0;
export const DIR_DOWN = 1;
export const DIR_LEFT = 2;
export const DIR_RIGHT = 3;

// --- Spawn Positions [x, y] ---
export const SPAWN_POSITIONS: [number, number][] = [
  [1, 1], // P0 top-left
  [11, 1], // P1 top-right
  [1, 9], // P2 bottom-left
  [11, 9], // P3 bottom-right
];

// --- Color Palette ---
export const COLORS = {
  background: "#0a0a0a",
  panel: "#1a1a2e",
  panelLight: "#252547",
  solGreen: "#16c784",
  explosionRed: "#e74c3c",
  lootGold: "#f39c12",
  purpleAccent: "#7c3aed",
  purpleLight: "#a78bfa",
  purpleDark: "#4c1d95",
  textPrimary: "#ededed",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  // Player colors
  player0: "#e74c3c",
  player1: "#3498db",
  player2: "#16c784",
  player3: "#f1c40f",
  // Tile colors
  floorDark: "#0d0d15",
  floorLight: "#12121f",
  wallBase: "#2a2a3e",
  wallHighlight: "#3a3a52",
  wallDark: "#1a1a2e",
  blockBase: "#4a3728",
  blockHighlight: "#5a4738",
  blockDark: "#3a2718",
  bombBlack: "#1a1a1a",
  bombFuse: "#f39c12",
  explosionOrange: "#ff6b35",
  explosionYellow: "#ffd700",
} as const;

export const PLAYER_COLORS = [
  COLORS.player0,
  COLORS.player1,
  COLORS.player2,
  COLORS.player3,
];

export const PLAYER_NAMES = ["Red", "Blue", "Green", "Yellow"];
