use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::{Tournament, TournamentStatus, Fighter, PrizePool, ProtocolConfig};

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct ClaimResurrection<'info> {
    #[account(
        constraint = tournament.status == TournamentStatus::Completed @ ErrorCode::TournamentNotComplete,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        seeds = [b"prize_pool", tournament.key().as_ref()],
        bump = prize_pool.bump,
        constraint = prize_pool.tournament == tournament.key(),
        constraint = !prize_pool.champion_claimed @ ErrorCode::AlreadyClaimed,
    )]
    pub prize_pool: Account<'info, PrizePool>,

    #[account(
        constraint = champion_fighter.tournament == tournament.key(),
        constraint = Some(champion_fighter.key()) == tournament.champion @ ErrorCode::NotChampion,
        constraint = champion_fighter.owner == claimer.key() @ ErrorCode::Unauthorized,
    )]
    pub champion_fighter: Account<'info, Fighter>,

    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// CHECK: Protocol treasury — receives protocol fee cut
    #[account(
        mut,
        constraint = treasury.key() == protocol_config.treasury @ ErrorCode::Unauthorized,
    )]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Tournament creator — receives creator fee cut
    #[account(
        mut,
        constraint = creator.key() == tournament.creator @ ErrorCode::Unauthorized,
    )]
    pub creator: AccountInfo<'info>,

    /// Champion fighter's owner — receives the resurrection prize
    #[account(mut)]
    pub claimer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimResurrection<'info> {
    pub fn handle(&mut self) -> Result<()> {
        // --- calculate distributable balance ---
        // Prize pool is a program-owned account; balance above rent is distributable
        let prize_pool_info = self.prize_pool.to_account_info();
        let rent = Rent::get()?.minimum_balance(PrizePool::SIZE);
        let balance = prize_pool_info.lamports();
        let distributable = balance.saturating_sub(rent);

        if distributable == 0 {
            self.prize_pool.champion_claimed = true;
            return Ok(());
        }

        // --- calculate fee splits ---
        let protocol_fee = distributable
            .checked_mul(self.protocol_config.protocol_fee_bps as u64)
            .unwrap()
            .checked_div(10_000)
            .unwrap();

        let creator_fee = distributable
            .checked_mul(self.tournament.creator_fee_bps as u64)
            .unwrap()
            .checked_div(10_000)
            .unwrap();

        let champion_prize = distributable - protocol_fee - creator_fee;

        // --- distribute (direct lamport manipulation for program-owned account) ---
        **prize_pool_info.try_borrow_mut_lamports()? -= distributable;

        if protocol_fee > 0 {
            **self.treasury.try_borrow_mut_lamports()? += protocol_fee;
        }
        if creator_fee > 0 {
            **self.creator.try_borrow_mut_lamports()? += creator_fee;
        }
        **self.claimer.to_account_info().try_borrow_mut_lamports()? += champion_prize;

        // --- mark all claims as done ---
        self.prize_pool.champion_claimed = true;
        self.prize_pool.protocol_claimed = true;
        self.prize_pool.creator_claimed = true;

        msg!(
            "RESURRECTION! ${} wins {} lamports | Protocol: {} | Creator: {}",
            self.champion_fighter.token_symbol,
            champion_prize,
            protocol_fee,
            creator_fee,
        );

        Ok(())
    }
}
