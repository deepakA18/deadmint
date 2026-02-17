pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("CSAEZjQaAui4j3nQhbLBtwACf5BVK49V2MN61toztavW");

#[program]
pub mod deadmint {
    use super::*;

    pub fn create_tournament(
        ctx: Context<CreateTournament>,
        name: String,
        tournament_id: u64,
        max_fighters: Option<u8>,
        entry_fee: Option<u64>,
        creator_fee_bps: Option<u16>,
        registration_seconds: Option<i64>,
    ) -> Result<()> {
        ctx.accounts.handle(
            name,
            tournament_id,
            max_fighters,
            entry_fee,
            creator_fee_bps,
            registration_seconds,
            &ctx.bumps,
        )
    }

    pub fn register_fighter(
        ctx: Context<RegisterFighter>,
        token_name: String,
        token_symbol: String,
        hp: u8,
        atk: u8,
        def: u8,
        spd: u8,
        luck: u8,
        deposit_amount: u64,
    ) -> Result<()> {
        ctx.accounts.handle(
            token_name,
            token_symbol,
            hp, atk, def, spd, luck,
            deposit_amount,
            &ctx.bumps,
        )
    }

    pub fn start_battle(
        ctx: Context<StartBattle>,
        round: u8,
        match_index: u8,
    ) -> Result<()> {
        ctx.accounts.handle(round, match_index, &ctx.bumps)
    }
}
