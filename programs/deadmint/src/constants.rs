use anchor_lang::prelude::*;

#[constant]
pub const MAX_FIGHTERS: usize = 32;
pub const ENTRY_FEE_LAMPORTS: u64 = 50_000_000; // 0.05 SOL
pub const BETTING_RAKE_BPS: u16 = 500; // 5%