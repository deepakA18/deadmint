use anchor_lang::prelude::*;

// ===== BOSS DEFAULTS =====
#[constant]
pub const DEFAULT_MAX_HP: u64 = 100_000;
pub const DEFAULT_DEFENSE: u8 = 20;
pub const DEFAULT_BASE_PRICE: u64 = 1_000;       // lamports per token at supply=0
pub const DEFAULT_SLOPE: u64 = 10;                // lamports price increase per token
pub const DEFAULT_ATTACK_FEE_BPS: u16 = 0;        // fee on buys (attack)
pub const DEFAULT_SELL_FEE_BPS: u16 = 500;         // 5% fee on sells → loot pool

// ===== HIT THRESHOLDS (randomness[0] % 100) =====
pub const HIT_MISS_UPPER: u8 = 5;        // 0..4   = MISS
pub const HIT_NORMAL_UPPER: u8 = 50;     // 5..49  = NORMAL
pub const HIT_STRONG_UPPER: u8 = 80;     // 50..79 = STRONG
pub const HIT_CRIT_UPPER: u8 = 95;       // 80..94 = CRITICAL
pub const HIT_MEGA_UPPER: u8 = 99;       // 95..98 = MEGA CRIT
                                           // 99     = BOSS COUNTER

// ===== DAMAGE MULTIPLIERS (x100 to avoid floats) =====
pub const MULT_MISS: u64 = 0;
pub const MULT_NORMAL: u64 = 100;
pub const MULT_STRONG: u64 = 150;
pub const MULT_CRIT: u64 = 200;
pub const MULT_MEGA: u64 = 300;
pub const MULT_COUNTER: u64 = 100;

// ===== BOSS COUNTER PENALTY =====
pub const COUNTER_TOKEN_LOSS_BPS: u64 = 1_000;   // lose 10% of tokens

// ===== PROTOCOL =====
pub const MAX_BOSS_NAME: usize = 32;
pub const MAX_PROTOCOL_FEE_BPS: u16 = 1_000;     // 10% max
pub const MAX_SELL_FEE_BPS: u16 = 1_000;          // 10% max
pub const MAX_DEFENSE: u8 = 80;                    // can't make boss invincible
