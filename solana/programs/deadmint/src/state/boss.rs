use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BossStatus {
    Alive,
    Defeated,
}

/// Seeds: [b"boss", id.to_le_bytes()]
#[account]
pub struct Boss {
    pub id: u64,
    pub creator: Pubkey,
    pub name: String,              // max 32 chars → 4 + 32 = 36
    pub max_hp: u64,
    pub current_hp: u64,
    pub defense: u8,
    pub status: BossStatus,

    // bonding curve params
    pub base_price: u64,           // lamports at supply=0
    pub slope: u64,                // lamports increase per token
    pub total_supply: u64,         // virtual tokens outstanding
    pub reserve_balance: u64,      // SOL backing the curve (in vault)

    // loot
    pub loot_pool: u64,            // SOL accumulated from sell fees
    pub total_damage: u64,         // sum of all damage dealt

    // fees
    pub attack_fee_bps: u16,
    pub sell_fee_bps: u16,

    pub bump: u8,
}

impl Boss {
    pub const SIZE: usize = 8      // discriminator
        + 8                         // id
        + 32                        // creator
        + (4 + 32)                  // name (String)
        + 8                         // max_hp
        + 8                         // current_hp
        + 1                         // defense
        + 1                         // status (enum)
        + 8                         // base_price
        + 8                         // slope
        + 8                         // total_supply
        + 8                         // reserve_balance
        + 8                         // loot_pool
        + 8                         // total_damage
        + 2                         // attack_fee_bps
        + 2                         // sell_fee_bps
        + 1;                        // bump
    // = 8 + 8 + 32 + 36 + 8*8 + 1 + 1 + 2 + 2 + 1 = 155
}
