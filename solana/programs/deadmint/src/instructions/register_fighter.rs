use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::error::ErrorCode;
use crate::state::{Tournament, TournamentStatus, Fighter, PrizePool};

// ===== ACCOUNTS =====

#[derive(Accounts)]
pub struct RegisterFighter<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::Registration @ ErrorCode::RegistrationClosed,
        constraint = tournament.registered_fighters < tournament.max_fighters @ ErrorCode::TournamentFull,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = owner,
        seeds = [
            b"fighter",
            tournament.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        space = Fighter::SIZE,
        bump,
    )]
    pub fighter: Account<'info, Fighter>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = owner_token_account.mint == token_mint.key() @ ErrorCode::MintMismatch,
        constraint = owner_token_account.owner == owner.key() @ ErrorCode::TokenOwnerMismatch,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        token::mint = token_mint,
        token::authority = fighter_token_escrow,
        seeds = [b"fighter_escrow", fighter.key().as_ref()],
        bump,
    )]
    pub fighter_token_escrow: Account<'info, TokenAccount>,

    /// Prize pool PDA — receives the SOL entry fee
    #[account(
        mut,
        seeds = [b"prize_pool", tournament.key().as_ref()],
        bump = prize_pool.bump,
    )]
    pub prize_pool: Account<'info, PrizePool>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> RegisterFighter<'info> {
    pub fn handle(
        &mut self,
        token_name: String,
        token_symbol: String,
        hp: u8,
        atk: u8,
        def: u8,
        spd: u8,
        luck: u8,
        deposit_amount: u64,
        bumps: &RegisterFighterBumps,
    ) -> Result<()> {
        // --- validate registration window ---
        let now = Clock::get()?.unix_timestamp;
        require!(
            now < self.tournament.registration_deadline,
            ErrorCode::RegistrationClosed
        );

        // --- validate inputs ---
        require!(
            !token_name.is_empty() && token_name.len() <= 32,
            ErrorCode::InvalidFighterName
        );
        require!(
            !token_symbol.is_empty() && token_symbol.len() <= 10,
            ErrorCode::InvalidFighterSymbol
        );
        require!(
            hp <= 100 && atk <= 100 && def <= 100 && spd <= 100 && luck <= 100,
            ErrorCode::InvalidStats
        );
        require!(deposit_amount > 0, ErrorCode::ZeroDeposit);

        // --- transfer SOL entry fee to prize pool PDA ---
        if self.tournament.entry_fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    self.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: self.owner.to_account_info(),
                        to: self.prize_pool.to_account_info(),
                    },
                ),
                self.tournament.entry_fee,
            )?;
            self.prize_pool.total_entry_fees += self.tournament.entry_fee;
        }

        // --- transfer dead tokens to fighter escrow ---
        token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.owner_token_account.to_account_info(),
                    to: self.fighter_token_escrow.to_account_info(),
                    authority: self.owner.to_account_info(),
                },
            ),
            deposit_amount,
        )?;

        // --- init fighter ---
        let fighter = &mut self.fighter;
        fighter.tournament = self.tournament.key();
        fighter.owner = self.owner.key();
        fighter.token_mint = self.token_mint.key();
        fighter.token_name = token_name;
        fighter.token_symbol = token_symbol;
        fighter.hp = hp;
        fighter.atk = atk;
        fighter.def = def;
        fighter.spd = spd;
        fighter.luck = luck;
        fighter.seed_index = self.tournament.registered_fighters;
        fighter.is_alive = true;
        fighter.wins = 0;
        fighter.deposited_amount = deposit_amount;
        fighter.bump = bumps.fighter;

        self.tournament.registered_fighters += 1;

        msg!(
            "Fighter ${} registered at seed {} | stats {}/{}/{}/{}/{}",
            self.fighter.token_symbol,
            self.fighter.seed_index,
            hp, atk, def, spd, luck,
        );

        Ok(())
    }
}
