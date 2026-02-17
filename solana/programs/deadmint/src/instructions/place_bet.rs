use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Battle, BattleStatus, BetSlip};

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        constraint = battle.status == BattleStatus::BettingOpen @ ErrorCode::BettingClosed,
    )]
    pub battle: Account<'info, Battle>,

    #[account(
        init,
        payer = bettor,
        seeds = [b"bet", battle.key().as_ref(), bettor.key().as_ref()],
        space = BetSlip::SIZE,
        bump,
    )]
    pub bet_slip: Account<'info, BetSlip>,

    /// CHECK: Battle escrow PDA — holds the bet SOL
    #[account(
        mut,
        seeds = [b"battle_escrow", battle.key().as_ref()],
        bump,
    )]
    pub battle_escrow: SystemAccount<'info>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> PlaceBet<'info> {
    pub fn handle(
        &mut self,
        amount: u64,
        backing_fighter_a: bool,
        bumps: &PlaceBetBumps,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidBetAmount);

        // --- transfer SOL to battle escrow ---
        anchor_lang::system_program::transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: self.bettor.to_account_info(),
                    to: self.battle_escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        // --- update battle totals ---
        if backing_fighter_a {
            self.battle.total_bet_a += amount;
        } else {
            self.battle.total_bet_b += amount;
        }
        self.battle.total_bettors += 1;

        // --- init bet slip ---
        let bet_slip = &mut self.bet_slip;
        bet_slip.battle = self.battle.key();
        bet_slip.bettor = self.bettor.key();
        bet_slip.fighter_backed = if backing_fighter_a {
            self.battle.fighter_a
        } else {
            self.battle.fighter_b
        };
        bet_slip.amount = amount;
        bet_slip.claimed = false;
        bet_slip.bump = bumps.bet_slip;

        msg!(
            "Bet placed: {} lamports on fighter {}",
            amount,
            if backing_fighter_a { "A" } else { "B" },
        );

        Ok(())
    }
}
