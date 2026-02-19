use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Boss, BossStatus, RaidTicket, ProtocolConfig};

#[derive(Accounts)]
pub struct ClaimLoot<'info> {
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        constraint = boss.status == BossStatus::Defeated @ ErrorCode::BossStillAlive,
    )]
    pub boss: Account<'info, Boss>,

    #[account(
        mut,
        constraint = raid_ticket.boss == boss.key(),
        constraint = raid_ticket.player == player.key(),
        constraint = !raid_ticket.claimed @ ErrorCode::AlreadyClaimed,
        constraint = raid_ticket.total_damage > 0 @ ErrorCode::NoDamageDealt,
    )]
    pub raid_ticket: Account<'info, RaidTicket>,

    /// CHECK: PDA vault holding SOL
    #[account(
        mut,
        seeds = [b"boss_vault", boss.key().as_ref()],
        bump,
    )]
    pub boss_vault: SystemAccount<'info>,

    /// CHECK: Protocol treasury
    #[account(
        mut,
        address = protocol_config.treasury,
    )]
    pub treasury: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimLoot<'info> {
    pub fn handle(&mut self, _vault_bump: u8) -> Result<()> {
        // --- compute proportional share ---
        let player_damage = self.raid_ticket.total_damage as u128;
        let total_damage = self.boss.total_damage as u128;
        let loot = self.boss.loot_pool as u128;

        let gross_share = (loot * player_damage / total_damage) as u64;

        // --- protocol fee ---
        let protocol_fee = gross_share * self.protocol_config.protocol_fee_bps as u64 / 10_000;
        let net_share = gross_share - protocol_fee;

        // --- transfer loot to player ---
        **self.boss_vault.to_account_info().try_borrow_mut_lamports()? -= net_share;
        **self.player.to_account_info().try_borrow_mut_lamports()? += net_share;

        // --- transfer protocol fee to treasury ---
        if protocol_fee > 0 {
            **self.boss_vault.to_account_info().try_borrow_mut_lamports()? -= protocol_fee;
            **self.treasury.to_account_info().try_borrow_mut_lamports()? += protocol_fee;
        }

        // --- mark claimed ---
        self.raid_ticket.claimed = true;

        msg!(
            "Loot claimed: {} lamports (fee: {} → treasury) | damage: {}/{}",
            net_share, protocol_fee,
            self.raid_ticket.total_damage, self.boss.total_damage,
        );

        Ok(())
    }
}
