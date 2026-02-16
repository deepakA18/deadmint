use anchor_lang::prelude::*;

#[account]
pub struct BetSlip {
    pub battle: Pubkey,
    pub bettor: Pubkey,
    pub fighter_backed: Pubkey,    // which fighter they bet on
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}