use anchor_lang::prelude::*;

#[account]
pub struct Fighter {
    pub tournament: Pubkey,
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub token_name: String,
    pub token_symbol: String,

    //Stats (0-100 scale, derived off-chain, stored on-chain)
    pub hp: u8,
    pub atk: u8,
    pub def: u8,
    pub spd: u8,
    pub luck: u8,

    // Tournament state
    pub seed_index: u8,            // bracket position
    pub is_alive: bool,
    pub wins: u8,
    pub deposited_amount: u64,     // tokens deposited
    pub bump: u8,
}

impl Fighter {
    pub const SIZE: usize = 8  // discriminator
        + 32  // tournament
        + 32  // owner
        + 32  // token_mint
        + (4 + 32)  // token_name (String: 4-byte len + max 32 chars)
        + (4 + 10)  // token_symbol (String: 4-byte len + max 10 chars)
        + 1   // hp
        + 1   // atk
        + 1   // def
        + 1   // spd
        + 1   // luck
        + 1   // seed_index
        + 1   // is_alive
        + 1   // wins
        + 8   // deposited_amount
        + 1;  // bump
}