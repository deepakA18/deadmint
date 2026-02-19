use anchor_lang::prelude::*;

/// Per-player ticket for a boss fight.
/// Seeds: [b"raid_ticket", boss.key(), player.key()]
#[account]
pub struct RaidTicket {
    pub boss: Pubkey,
    pub player: Pubkey,
    pub tokens_held: u64,          // virtual token balance
    pub total_damage: u64,         // cumulative damage dealt to boss
    pub pending_sol: u64,          // SOL committed in current attack (awaiting VRF)
    pub pending_tokens: u64,       // tokens to receive after VRF resolves
    pub claimed: bool,             // loot claimed?
    pub bump: u8,
}

impl RaidTicket {
    pub const SIZE: usize = 8      // discriminator
        + 32                        // boss
        + 32                        // player
        + 8                         // tokens_held
        + 8                         // total_damage
        + 8                         // pending_sol
        + 8                         // pending_tokens
        + 1                         // claimed
        + 1;                        // bump
    // = 8 + 32 + 32 + 8*4 + 1 + 1 = 106
}
