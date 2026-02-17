use anchor_lang::prelude::*;

#[account]
pub struct Tournament {
    // ---- identity ----
    pub name: String,               // "BONK Deathmatch" (max 32 chars)
    pub creator: Pubkey,
    pub tournament_id: u64,

    // ---- progression ----
    pub status: TournamentStatus,
    pub registered_fighters: u8,
    pub current_round: u8,
    pub current_match: u8,
    pub champion: Option<Pubkey>,

    // ---- config (all have protocol defaults) ----
    pub max_fighters: u8,           // default 8
    pub min_fighters: u8,           // default 2
    pub entry_fee: u64,             // default 0.05 SOL
    pub creator_fee_bps: u16,       // default 5%
    pub cranker_tip: u64,           // default 0
    pub registration_deadline: i64, // default: created_at + 24h
    pub betting_window_slots: u64,  // default ~1 min

    // ---- metadata ----
    pub created_at: i64,
    pub bump: u8,
}

impl Tournament {
    pub const SIZE: usize = 8      // discriminator
        + (4 + 32)  // name (String: 4-byte len + max 32 chars)
        + 32   // creator
        + 8    // tournament_id
        + 1    // status
        + 1    // registered_fighters
        + 1    // current_round
        + 1    // current_match
        + 33   // champion (Option<Pubkey>)
        + 1    // max_fighters
        + 1    // min_fighters
        + 8    // entry_fee
        + 2    // creator_fee_bps
        + 8    // cranker_tip
        + 8    // registration_deadline
        + 8    // betting_window_slots
        + 8    // created_at
        + 1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TournamentStatus {
    Registration,   // accepting fighters
    InProgress,     // battles happening
    Completed,      // champion crowned
    Cancelled,      // not enough fighters by deadline
}

