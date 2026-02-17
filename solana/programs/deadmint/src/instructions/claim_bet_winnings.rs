use anchor_lang::prelude::*;
use crate::constants::BETTING_RAKE_BPS;
use crate::error::ErrorCode;
use crate::state::{Battle, BattleStatus, BetSlip, PrizePool};

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct ClaimBetWinnings<'info> {
    #[account(
        constraint = battle.status == BattleStatus::Resolved @ ErrorCode::BattleNotResolved,
    )]
    pub battle: Account<'info, Battle>,

    #[account(
        mut,
        seeds = [b"bet", battle.key().as_ref(), bettor.key().as_ref()],
        bump = bet_slip.bump,
        constraint = bet_slip.battle == battle.key() @ ErrorCode::FighterMismatch,
        constraint = bet_slip.bettor == bettor.key() @ ErrorCode::Unauthorized,
        constraint = !bet_slip.claimed @ ErrorCode::AlreadyClaimed,
        constraint = Some(bet_slip.fighter_backed) == battle.winner @ ErrorCode::BetLost,
    )]
    pub bet_slip: Account<'info, BetSlip>,

    /// CHECK: Battle escrow PDA — holds the bet SOL
    #[account(
        mut,
        seeds = [b"battle_escrow", battle.key().as_ref()],
        bump,
    )]
    pub battle_escrow: SystemAccount<'info>,

    /// Prize pool receives the betting rake
    #[account(
        mut,
        seeds = [b"prize_pool", battle.tournament.as_ref()],
        bump = prize_pool.bump,
    )]
    pub prize_pool: Account<'info, PrizePool>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimBetWinnings<'info> {
    pub fn handle(&mut self, bumps: &ClaimBetWinningsBumps) -> Result<()> {
        // --- calculate payout ---
        let total_pool = self.battle.total_bet_a + self.battle.total_bet_b;
        let rake = total_pool * BETTING_RAKE_BPS as u64 / 10_000;
        let payout_pool = total_pool - rake;

        let winning_side_total = if self.bet_slip.fighter_backed == self.battle.fighter_a {
            self.battle.total_bet_a
        } else {
            self.battle.total_bet_b
        };

        // Proportional payout: (my_bet / winning_side) * payout_pool
        let payout = (self.bet_slip.amount as u128)
            .checked_mul(payout_pool as u128)
            .unwrap()
            .checked_div(winning_side_total as u128)
            .unwrap() as u64;

        // Proportional rake share: (my_bet / winning_side) * total_rake
        let rake_share = (self.bet_slip.amount as u128)
            .checked_mul(rake as u128)
            .unwrap()
            .checked_div(winning_side_total as u128)
            .unwrap() as u64;

        // --- transfer from battle escrow (PDA signer) ---
        let battle_key = self.battle.key();
        let signer_seeds: &[&[u8]] = &[
            b"battle_escrow",
            battle_key.as_ref(),
            &[bumps.battle_escrow],
        ];

        // Transfer payout to bettor
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: self.battle_escrow.to_account_info(),
                    to: self.bettor.to_account_info(),
                },
                &[signer_seeds],
            ),
            payout,
        )?;

        // Transfer rake share to prize pool
        if rake_share > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    self.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: self.battle_escrow.to_account_info(),
                        to: self.prize_pool.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                rake_share,
            )?;
            self.prize_pool.total_betting_rake += rake_share;
        }

        // --- mark bet as claimed ---
        self.bet_slip.claimed = true;

        msg!(
            "Bet claimed: {} lamports payout | {} rake to pool",
            payout,
            rake_share,
        );

        Ok(())
    }
}
