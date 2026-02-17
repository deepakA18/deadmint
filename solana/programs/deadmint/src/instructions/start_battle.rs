use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Tournament, TournamentStatus, Fighter, Battle, BattleStatus};

// ===== ACCOUNTS =====

#[derive(Accounts)]
#[instruction(round: u8, match_index: u8)]
pub struct StartBattle<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::Registration
            || tournament.status == TournamentStatus::InProgress
            @ ErrorCode::TournamentNotActive,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = authority,
        seeds = [
            b"battle",
            tournament.key().as_ref(),
            &[round],
            &[match_index],
        ],
        space = Battle::SIZE,
        bump,
    )]
    pub battle: Account<'info, Battle>,

    #[account(
        constraint = fighter_a.tournament == tournament.key() @ ErrorCode::FighterTournamentMismatch,
        constraint = fighter_a.is_alive @ ErrorCode::FighterEliminated,
    )]
    pub fighter_a: Account<'info, Fighter>,

    #[account(
        constraint = fighter_b.tournament == tournament.key() @ ErrorCode::FighterTournamentMismatch,
        constraint = fighter_b.is_alive @ ErrorCode::FighterEliminated,
        constraint = fighter_b.key() != fighter_a.key() @ ErrorCode::SameFighter,
    )]
    pub fighter_b: Account<'info, Fighter>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> StartBattle<'info> {
    pub fn handle(
        &mut self,
        round: u8,
        match_index: u8,
        bumps: &StartBattleBumps,
    ) -> Result<()> {
        // --- transition tournament Registration → InProgress on first battle ---
        if self.tournament.status == TournamentStatus::Registration {
            require!(
                self.tournament.registered_fighters >= self.tournament.min_fighters,
                ErrorCode::NotEnoughFighters
            );
            self.tournament.status = TournamentStatus::InProgress;
            self.tournament.current_round = 0;
            self.tournament.current_match = 0;
        }

        // --- validate round matches current tournament progression ---
        require!(
            round == self.tournament.current_round,
            ErrorCode::InvalidRound
        );

        // --- init battle ---
        let battle = &mut self.battle;
        battle.tournament = self.tournament.key();
        battle.round = round;
        battle.match_index = match_index;
        battle.fighter_a = self.fighter_a.key();
        battle.fighter_b = self.fighter_b.key();
        battle.winner = None;
        battle.status = BattleStatus::BettingOpen;
        battle.randomness_account = Pubkey::default();
        battle.commit_slot = 0;
        battle.total_bet_a = 0;
        battle.total_bet_b = 0;
        battle.total_bettors = 0;
        battle.bump = bumps.battle;

        // --- advance tournament match counter ---
        self.tournament.current_match += 1;

        msg!(
            "Battle started: Round {} Match {} | ${} vs ${}",
            round,
            match_index,
            self.fighter_a.token_symbol,
            self.fighter_b.token_symbol,
        );

        Ok(())
    }
}
