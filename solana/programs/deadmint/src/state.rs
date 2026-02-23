use anchor_lang::prelude::*;

// Cell types
pub const CELL_EMPTY: u8 = 0;
pub const CELL_WALL: u8 = 1;
pub const CELL_BLOCK: u8 = 2;
pub const CELL_BOMB: u8 = 3;
pub const CELL_EXPLOSION: u8 = 4;
pub const CELL_LOOT: u8 = 5;
pub const CELL_POWERUP: u8 = 6;

// Game status
pub const STATUS_LOBBY: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_FINISHED: u8 = 2;
pub const STATUS_CLAIMED: u8 = 3;

pub const GRID_WIDTH: u8 = 13;
pub const GRID_HEIGHT: u8 = 11;
pub const GRID_CELLS: usize = 143; // 13 × 11
pub const MAX_BOMBS: usize = 12; // 4 players × 3 max bombs each
pub const EXPLOSION_DURATION_SLOTS: u64 = 5; // ~2 seconds at 400ms slots

pub const SPAWN_POSITIONS: [(u8, u8); 4] = [(1, 1), (11, 1), (1, 9), (11, 9)];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct BombSlot {
    pub active: bool,
    pub owner: Pubkey,
    pub x: u8,
    pub y: u8,
    pub range: u8,
    pub fuse_slots: u8,
    pub placed_at_slot: u64,
    pub detonated: bool,
}

// BombSlot size: 1 + 32 + 1 + 1 + 1 + 1 + 8 + 1 = 46 bytes

#[account]
pub struct Game {
    pub game_id: u64,
    pub authority: Pubkey,
    pub grid_width: u8,
    pub grid_height: u8,
    pub max_players: u8,
    pub current_players: u8,
    pub entry_fee: u64,
    pub prize_pool: u64,
    pub status: u8,
    pub winner: Pubkey, // Pubkey::default() means no winner
    pub created_at: i64,
    pub started_at: i64,
    pub round_duration: u16,
    pub platform_fee_bps: u16,
    pub bump: u8,
    // Grid data (embedded)
    pub cells: [u8; GRID_CELLS],
    pub powerup_types: [u8; GRID_CELLS],
    // Bombs (embedded — no separate accounts!)
    pub bombs: [BombSlot; MAX_BOMBS],
    pub bomb_count: u8,
    pub last_detonate_slot: u64,
}

impl Game {
    // 8 (discriminator) + 8 + 32 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 32 + 8 + 8 + 2 + 2 + 1
    // + 143 + 143 + (46 * 12) + 1 + 8 = 1112
    pub const SIZE: usize = 8 + 8 + 32 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 32 + 8 + 8 + 2 + 2 + 1
        + GRID_CELLS + GRID_CELLS + (46 * MAX_BOMBS) + 1 + 8;

    pub fn cell_idx(&self, x: u8, y: u8) -> usize {
        (y as usize) * (self.grid_width as usize) + (x as usize)
    }

    pub fn find_free_bomb_slot(&self) -> Option<usize> {
        self.bombs.iter().position(|b| !b.active)
    }
}

#[account]
pub struct Player {
    pub game: Pubkey,
    pub authority: Pubkey, // session key pubkey
    pub player_index: u8,
    pub x: u8,
    pub y: u8,
    pub alive: bool,
    pub collected_sol: u64,
    pub wager: u64,
    pub bomb_range: u8,
    pub max_bombs: u8,
    pub active_bombs: u8,
    pub speed: u8,
    pub last_move_slot: u64,
    pub kills: u8,
    pub bump: u8,
}

impl Player {
    // 8 (discriminator) + 32 + 32 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 1 + 1 + 1 + 8 + 1 + 1 = 106
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 1 + 1 + 1 + 8 + 1 + 1;
}
