use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Boss, BossStatus, RaidTicket};
use crate::instructions::attack::sol_for_tokens;

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(
        mut,
        constraint = boss.status == BossStatus::Alive @ ErrorCode::BossNotAlive,
    )]
    pub boss: Account<'info, Boss>,

    #[account(
        mut,
        constraint = raid_ticket.boss == boss.key(),
        constraint = raid_ticket.player == player.key(),
    )]
    pub raid_ticket: Account<'info, RaidTicket>,

    /// CHECK: PDA vault holding SOL
    #[account(
        mut,
        seeds = [b"boss_vault", boss.key().as_ref()],
        bump,
    )]
    pub boss_vault: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Sell<'info> {
    pub fn handle(&mut self, token_amount: u64, _vault_bump: u8) -> Result<()> {
        require!(token_amount > 0, ErrorCode::ZeroSellAmount);
        require!(
            token_amount <= self.raid_ticket.tokens_held,
            ErrorCode::InsufficientTokens
        );

        // --- compute SOL out from curve ---
        let gross_sol = sol_for_tokens(
            self.boss.base_price,
            self.boss.slope,
            self.boss.total_supply,
            token_amount,
        )?;

        // --- sell fee → loot pool ---
        let fee = gross_sol * self.boss.sell_fee_bps as u64 / 10_000;
        let net_sol = gross_sol - fee;

        require!(
            net_sol <= self.boss_vault.lamports(),
            ErrorCode::InsufficientVaultBalance
        );

        // --- transfer SOL from vault to player (direct lamport manipulation) ---
        **self.boss_vault.to_account_info().try_borrow_mut_lamports()? -= net_sol;
        **self.player.to_account_info().try_borrow_mut_lamports()? += net_sol;

        // --- update state ---
        self.boss.total_supply -= token_amount;
        self.boss.reserve_balance = self.boss.reserve_balance.saturating_sub(gross_sol);
        self.boss.loot_pool += fee;

        // --- boss heals by half the gross SOL value ---
        let heal = gross_sol / 2;
        self.boss.current_hp = self.boss.current_hp.saturating_add(heal)
            .min(self.boss.max_hp);

        self.raid_ticket.tokens_held -= token_amount;

        msg!(
            "Sold {} tokens → {} SOL (fee: {} → loot) | Boss healed {} → HP: {}/{}",
            token_amount, net_sol, fee, heal,
            self.boss.current_hp, self.boss.max_hp,
        );

        Ok(())
    }
}
