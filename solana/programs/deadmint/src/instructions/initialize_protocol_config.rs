use anchor_lang::prelude::*;
use crate::state::ProtocolConfig;

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct InitializeProtocolConfig<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [b"protocol_config"],
        space = ProtocolConfig::SIZE,
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeProtocolConfig<'info> {
    pub fn handle(
        &mut self,
        treasury: Pubkey,
        protocol_fee_bps: u16,
        bumps: &InitializeProtocolConfigBumps,
    ) -> Result<()> {
        let config = &mut self.protocol_config;
        config.admin = self.admin.key();
        config.treasury = treasury;
        config.protocol_fee_bps = protocol_fee_bps;
        config.is_active = true;
        config.bump = bumps.protocol_config;

        msg!(
            "Protocol initialized | admin: {} | treasury: {} | fee: {} bps",
            config.admin,
            config.treasury,
            config.protocol_fee_bps,
        );

        Ok(())
    }
}
