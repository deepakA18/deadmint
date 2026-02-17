use anchor_lang::prelude::*;

#[account] 
pub struct Tournament {
    pub creator: Pubkey,
    pub tournament_id: u64,
    pub status: TournamentStatus,
    pub max_fighters: u8,
    pub min_fighters: u8,
    pub registered_fighters: u8,
    pub current_round: u8,
    pub current_match: u8,
    pub prize_pool: u64,
    pub entry_fee: u64,
    pub creator_fee_bps: u16,
    pub cranker_tip: u64,
    pub registration_deadline: i64,
    pub betting_window_slots: u64,
    pub champion: Option<Pubkey>,
    pub created_at: i64,
    pub bump: u8
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TournamentStatus {
    Registration,   // accepting fighters
    InProgress,     // battles happening
    Completed,      // champion crowned
    Cancelled,      // not enough fighters by deadline
}

