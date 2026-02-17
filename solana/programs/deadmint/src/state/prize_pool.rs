use anchor_lang::prelude::*;

/// Per-tournament escrow PDA that holds SOL and tracks fee breakdown.
/// Seeds: [b"prize_pool", tournament.key()]
#[account]
pub struct PrizePool {
    pub tournament: Pubkey,          // back-reference to parent tournament
    pub total_entry_fees: u64,       // SOL accumulated from fighter entry fees
    pub total_betting_rake: u64,     // SOL accumulated from betting rake
    pub creator_claimed: bool,       // whether tournament creator took their cut
    pub protocol_claimed: bool,      // whether protocol treasury took their cut
    pub champion_claimed: bool,      // whether champion claimed resurrection prize
    pub bump: u8,
}

impl PrizePool {
    pub const SIZE: usize = 8  // discriminator
        + 32  // tournament
        + 8   // total_entry_fees
        + 8   // total_betting_rake
        + 1   // creator_claimed
        + 1   // protocol_claimed
        + 1   // champion_claimed
        + 1;  // bump

    /// Total SOL held in this escrow
    pub fn total(&self) -> u64 {
        self.total_entry_fees + self.total_betting_rake
    }
}