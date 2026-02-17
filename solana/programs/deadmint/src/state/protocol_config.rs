use anchor_lang::prelude::*;

/// Global singleton — one per program deployment.
/// Seeds: [b"protocol_config"]
#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,            // can update config & pause protocol
    pub treasury: Pubkey,         // wallet that receives protocol fees
    pub protocol_fee_bps: u16,   // protocol cut from prize pools (e.g. 250 = 2.5%)
    pub is_active: bool,          // kill switch — pause all tournaments
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SIZE: usize = 8  // discriminator
        + 32  // admin
        + 32  // treasury
        + 2   // protocol_fee_bps
        + 1   // is_active
        + 1;  // bump
}
