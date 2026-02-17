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

    // --- fighter registration ---
    #[msg("Registration is closed")]
    RegistrationClosed,
    #[msg("Tournament is full")]
    TournamentFull,
    #[msg("Fighter name must be 1-32 characters")]
    InvalidFighterName,
    #[msg("Fighter symbol must be 1-10 characters")]
    InvalidFighterSymbol,
    #[msg("Stats must be 0-100")]
    InvalidStats,
    #[msg("Deposit amount must be greater than 0")]
    ZeroDeposit,
    #[msg("Token mint does not match")]
    MintMismatch,
    #[msg("Token account owner does not match signer")]
    TokenOwnerMismatch,

    // --- battle ---
    #[msg("Tournament is not active")]
    TournamentNotActive,
    #[msg("Fighter does not belong to this tournament")]
    FighterTournamentMismatch,
    #[msg("Fighter has been eliminated")]
    FighterEliminated,
    #[msg("Cannot battle a fighter against itself")]
    SameFighter,
    #[msg("Not enough fighters to start")]
    NotEnoughFighters,
    #[msg("Round does not match current tournament round")]
    InvalidRound,

    // --- betting ---
    #[msg("Betting is closed for this battle")]
    BettingClosed,
    #[msg("Bet amount must be greater than 0")]
    InvalidBetAmount,

    // --- resolve battle ---
    #[msg("Battle cannot be resolved in its current state")]
    BattleNotResolvable,
    #[msg("Fighter account does not match battle")]
    FighterMismatch,
    #[msg("Invalid or empty randomness account")]
    InvalidRandomnessAccount,
    #[msg("Randomness has expired (not from previous slot)")]
    RandomnessExpired,
    #[msg("Randomness already revealed — cannot commit")]
    RandomnessAlreadyRevealed,
    #[msg("Randomness account does not match committed account")]
    RandomnessMismatch,
    #[msg("Randomness not yet resolved by oracle")]
    RandomnessNotResolved,
}
