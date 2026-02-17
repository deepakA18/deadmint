use anchor_lang::prelude::*;

#[account]
pub struct Battle {
    pub tournament: Pubkey,
    pub round: u8,
    pub match_index: u8,
    pub fighter_a: Pubkey,
    pub fighter_b: Pubkey,
    pub winner: Option<Pubkey>,
    pub status: BattleStatus,
    
    // Randomness
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    
    // Betting
    pub total_bet_a: u64,
    pub total_bet_b: u64,
    pub total_bettors: u16,
    
    pub bump: u8,
}

impl Battle {
    pub const SIZE: usize = 8  // discriminator
        + 32  // tournament
        + 1   // round
        + 1   // match_index
        + 32  // fighter_a
        + 32  // fighter_b
        + 33  // winner (Option<Pubkey>)
        + 1   // status
        + 32  // randomness_account
        + 8   // commit_slot
        + 8   // total_bet_a
        + 8   // total_bet_b
        + 2   // total_bettors
        + 1;  // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BattleStatus {
    Pending,      // waiting for fighters
    BettingOpen,  // accepting bets
    Committed,    // randomness committed, bets closed
    Resolved,     // battle outcome determined
}