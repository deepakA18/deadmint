use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Tournament, TournamentStatus, Fighter, Battle, BattleStatus};

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct AdvanceRound<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::InProgress @ ErrorCode::TournamentNotActive,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        constraint = battle.tournament == tournament.key() @ ErrorCode::FighterTournamentMismatch,
        constraint = battle.status == BattleStatus::Resolved @ ErrorCode::BattleNotResolved,
    )]
    pub battle: Account<'info, Battle>,

    #[account(
        mut,
        constraint = Some(winner_fighter.key()) == battle.winner @ ErrorCode::FighterMismatch,
    )]
    pub winner_fighter: Account<'info, Fighter>,

    #[account(
        mut,
        constraint = loser_fighter.key() == battle.fighter_a
            || loser_fighter.key() == battle.fighter_b @ ErrorCode::FighterMismatch,
        constraint = Some(loser_fighter.key()) != battle.winner @ ErrorCode::FighterMismatch,
    )]
    pub loser_fighter: Account<'info, Fighter>,

    pub authority: Signer<'info>,
}

impl<'info> AdvanceRound<'info> {
    pub fn handle(&mut self) -> Result<()> {
        // --- mark outcomes ---
        self.winner_fighter.wins += 1;
        self.loser_fighter.is_alive = false;

        // --- check for champion ---
        // In single-elimination with N fighters, champion needs log2(N) wins
        let total_rounds = self.total_rounds();

        if self.winner_fighter.wins >= total_rounds {
            self.tournament.champion = Some(self.winner_fighter.key());
            self.tournament.status = TournamentStatus::Completed;

            msg!(
                "CHAMPION CROWNED: ${} with {} wins!",
                self.winner_fighter.token_symbol,
                self.winner_fighter.wins,
            );
        } else {
            msg!(
                "Fighter ${} advances! Wins: {}/{}",
                self.winner_fighter.token_symbol,
                self.winner_fighter.wins,
                total_rounds,
            );
        }

        Ok(())
    }

    /// Number of rounds needed to crown a champion: log2(max_fighters)
    fn total_rounds(&self) -> u8 {
        let mut n = self.tournament.max_fighters;
        let mut rounds = 0u8;
        while n > 1 {
            n /= 2;
            rounds += 1;
        }
        rounds
    }
}
