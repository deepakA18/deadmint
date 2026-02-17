use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // --- tournament creation ---
    #[msg("Tournament name must be 1-32 characters")]
    InvalidTournamentName,
    #[msg("Bracket size must be 2, 4, 8, 16, or 32")]
    InvalidBracketSize,
    #[msg("Entry fee exceeds maximum (10 SOL)")]
    EntryFeeTooHigh,
    #[msg("Creator fee exceeds maximum (10%)")]
    CreatorFeeTooHigh,
    #[msg("Protocol is paused")]
    ProtocolPaused,
}
