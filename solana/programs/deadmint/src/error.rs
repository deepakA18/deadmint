use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // ===== BOSS =====
    #[msg("Boss name is empty or too long (max 32 chars)")]
    InvalidBossName,
    #[msg("Defense exceeds maximum allowed")]
    DefenseTooHigh,
    #[msg("Base price must be > 0")]
    InvalidBasePrice,
    #[msg("Slope must be > 0")]
    InvalidSlope,
    #[msg("Boss is not alive")]
    BossNotAlive,
    #[msg("Boss is still alive — cannot claim loot yet")]
    BossStillAlive,

    // ===== ATTACK =====
    #[msg("Attack SOL amount must be > 0")]
    ZeroAttackAmount,
    #[msg("Player has a pending attack — wait for VRF callback")]
    AttackPending,
    #[msg("No pending attack to resolve")]
    NoPendingAttack,

    // ===== SELL =====
    #[msg("Sell token amount must be > 0")]
    ZeroSellAmount,
    #[msg("Cannot sell more tokens than you hold")]
    InsufficientTokens,
    #[msg("Vault has insufficient SOL for this sell")]
    InsufficientVaultBalance,

    // ===== CLAIM =====
    #[msg("Loot already claimed")]
    AlreadyClaimed,
    #[msg("No damage dealt — nothing to claim")]
    NoDamageDealt,

    // ===== PROTOCOL =====
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Sell fee exceeds maximum")]
    SellFeeTooHigh,

    // ===== MATH =====
    #[msg("Math overflow")]
    MathOverflow,
}
