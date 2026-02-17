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

impl BetSlip {
    pub const SIZE: usize = 8  // discriminator
        + 32  // battle
        + 32  // bettor
        + 32  // fighter_backed
        + 8   // amount
        + 1   // claimed
        + 1;  // bump
}