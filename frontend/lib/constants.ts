import { PublicKey } from "@solana/web3.js";

// --- Network ---
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
export const EPHEMERAL_RPC_URL =
  process.env.NEXT_PUBLIC_EPHEMERAL_RPC || "https://devnet.magicblock.app";
export const WORLD_PROGRAM_ID = new PublicKey(
  "WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n"
);

// --- Component Program IDs ---
export const GAME_CONFIG_ID = new PublicKey(
  "919ULGHVd8Ei2NCeCg3zfpNrCg5QKNh6dJtnTLdRp8DP"
);
export const GRID_ID = new PublicKey(
  "B6aeQFgTVwCfjQiiDXbiZxcZbCBzzSFQV8h9CBDx1QqF"
);
export const PLAYER_ID = new PublicKey(
  "22jhJmsR9JDRbbzy6TLuGkr7jMjSAgwMKtG2SJ3oATew"
);
export const BOMB_ID = new PublicKey(
  "HPyYmnUfG2a1zhLMibMZGVF9UP8xcBvCKLU4e9FnYhu4"
);

// --- System Program IDs ---
export const INIT_GAME_ID = new PublicKey(
  "6LRsvRNMA9uFa3XnKi4tswXrgsJPzhGEaCQSCcc6tdht"
);
export const JOIN_GAME_ID = new PublicKey(
  "B5KDtjkRhhGkUKmaZAyPDjeLF6bTBSxWrVu4pjHBpmvN"
);
export const MOVE_PLAYER_ID = new PublicKey(
  "F7qDssjJp9USkMakyj8FbnyuV5HR2CMGP8PRx6bmL89T"
);
export const PLACE_BOMB_ID = new PublicKey(
  "69QgbvubUeQ8V335u1pdpECXoMu3UU9Xp1sZtCGKH17T"
);
export const DETONATE_BOMB_ID = new PublicKey(
  "D9yXnYNNPUc4SGMZsxydYcFp1np7WPXnEB8Vvati8c6D"
);
export const CHECK_GAME_END_ID = new PublicKey(
  "7z2CQjGyDAv3REvjj1Y19sKM9edgE9tB3QFD8pAAji3N"
);
export const CLAIM_PRIZE_ID = new PublicKey(
  "HSFH8eHW5cXpaCTsseCvrya6D4qfa98rXt4kC8S7nAAg"
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
