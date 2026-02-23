use anchor_lang::prelude::*;

#[error_code]
pub enum DeadmintError {
    // Game errors
    #[msg("Game is not in lobby state")]
    GameNotInLobby,
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Game is not finished")]
    GameNotFinished,
    #[msg("Game is full")]
    GameFull,

    // Player errors
    #[msg("Player is not alive")]
    PlayerNotAlive,
    #[msg("Player does not belong to this game")]
    PlayerGameMismatch,
    #[msg("Unauthorized — signer does not match player authority")]
    Unauthorized,

    // Move errors
    #[msg("Invalid direction (must be 0-3)")]
    InvalidDirection,
    #[msg("Cell is not walkable")]
    CellNotWalkable,
    #[msg("Move out of bounds")]
    OutOfBounds,
    #[msg("Moving too fast — wait for cooldown")]
    MoveTooFast,

    // Bomb errors
    #[msg("No bombs available")]
    NoBombsAvailable,
    #[msg("Cell is occupied by a bomb")]
    CellOccupied,
    #[msg("All bomb slots are full")]
    BombSlotsFull,
    #[msg("Invalid bomb index")]
    InvalidBombIndex,
    #[msg("Bomb is not active")]
    BombNotActive,
    #[msg("Bomb already detonated")]
    BombAlreadyDetonated,
    #[msg("Fuse has not expired yet")]
    FuseNotExpired,

    // Claim errors
    #[msg("No winner set")]
    NoWinner,
    #[msg("Not the winner")]
    NotWinner,
    #[msg("Prize already claimed")]
    AlreadyClaimed,

    // Math
    #[msg("Math overflow")]
    MathOverflow,
}
