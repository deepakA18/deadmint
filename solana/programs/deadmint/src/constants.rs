use anchor_lang::prelude::*;

// ===== TOURNAMENT DEFAULTS (pump.fun simplicity) =====
#[constant]
pub const DEFAULT_MAX_FIGHTERS: u8 = 8;            // quick 8-fighter bracket
pub const DEFAULT_MIN_FIGHTERS: u8 = 2;            // minimum to start
pub const DEFAULT_ENTRY_FEE: u64 = 50_000_000;     // 0.05 SOL
pub const DEFAULT_CREATOR_FEE_BPS: u16 = 500;      // 5% to creator
pub const DEFAULT_CRANKER_TIP: u64 = 0;            // no tip by default
pub const DEFAULT_REGISTRATION_WINDOW: i64 = 86_400;  // 24 hours
pub const DEFAULT_BETTING_WINDOW_SLOTS: u64 = 150;    // ~1 min on solana

// ===== PROTOCOL CONSTANTS =====
pub const BETTING_RAKE_BPS: u16 = 500;             // 5% rake on bets
pub const MAX_FIGHTERS: u8 = 32;                    // hard cap
pub const MAX_TOURNAMENT_NAME: usize = 32;
pub const MAX_ENTRY_FEE: u64 = 10_000_000_000;     // 10 SOL cap
pub const MAX_CREATOR_FEE_BPS: u16 = 1_000;        // 10% max creator cut