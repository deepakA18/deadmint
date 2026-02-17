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