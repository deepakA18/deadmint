use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Tournament, TournamentStatus, PrizePool, ProtocolConfig};

// ===== ACCOUNTS =====

#[derive(Accounts)]
#[instruction(name: String, tournament_id: u64)]
pub struct CreateTournament<'info> {
    #[account(
        init,
        payer = creator,
        seeds = [b"tournament", tournament_id.to_le_bytes().as_ref()],
        space = Tournament::SIZE,
        bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = creator,
        seeds = [b"prize_pool", tournament.key().as_ref()],
        space = PrizePool::SIZE,
        bump,
    )]
    pub prize_pool: Account<'info, PrizePool>,

    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateTournament<'info> {
    pub fn handle(
        &mut self,
        name: String,
        tournament_id: u64,
        max_fighters: Option<u8>,
        entry_fee: Option<u64>,
        creator_fee_bps: Option<u16>,
        registration_seconds: Option<i64>,
        bumps: &CreateTournamentBumps,
    ) -> Result<()> {
        // --- validate name ---
        require!(
            !name.is_empty() && name.len() <= MAX_TOURNAMENT_NAME,
            ErrorCode::InvalidTournamentName
        );

        // --- resolve config (defaults vs overrides) ---
        let max = max_fighters.unwrap_or(DEFAULT_MAX_FIGHTERS);
        require!(
            max == 2 || max == 4 || max == 8 || max == 16 || max == 32,
            ErrorCode::InvalidBracketSize
        );

        let fee = entry_fee.unwrap_or(DEFAULT_ENTRY_FEE);
        require!(fee <= MAX_ENTRY_FEE, ErrorCode::EntryFeeTooHigh);

        let creator_bps = creator_fee_bps.unwrap_or(DEFAULT_CREATOR_FEE_BPS);
        require!(creator_bps <= MAX_CREATOR_FEE_BPS, ErrorCode::CreatorFeeTooHigh);

        let reg_window = registration_seconds.unwrap_or(DEFAULT_REGISTRATION_WINDOW);
        let now = Clock::get()?.unix_timestamp;

        // --- check protocol is active ---
        require!(self.protocol_config.is_active, ErrorCode::ProtocolPaused);

        // --- init tournament ---
        let tournament = &mut self.tournament;
        tournament.name = name;
        tournament.creator = self.creator.key();
        tournament.tournament_id = tournament_id;
        tournament.status = TournamentStatus::Registration;
        tournament.registered_fighters = 0;
        tournament.current_round = 0;
        tournament.current_match = 0;
        tournament.champion = None;
        tournament.max_fighters = max;
        tournament.min_fighters = DEFAULT_MIN_FIGHTERS;
        tournament.entry_fee = fee;
        tournament.creator_fee_bps = creator_bps;
        tournament.cranker_tip = DEFAULT_CRANKER_TIP;
        tournament.registration_deadline = now + reg_window;
        tournament.betting_window_slots = DEFAULT_BETTING_WINDOW_SLOTS;
        tournament.created_at = now;
        tournament.bump = bumps.tournament;

        // --- init prize pool escrow ---
        let prize_pool = &mut self.prize_pool;
        prize_pool.tournament = self.tournament.key();
        prize_pool.total_entry_fees = 0;
        prize_pool.total_betting_rake = 0;
        prize_pool.creator_claimed = false;
        prize_pool.protocol_claimed = false;
        prize_pool.champion_claimed = false;
        prize_pool.bump = bumps.prize_pool;

        msg!(
            "Tournament '{}' created | {} fighters | {} lamport entry",
            self.tournament.name,
            self.tournament.max_fighters,
            self.tournament.entry_fee,
        );

        Ok(())
    }
}
