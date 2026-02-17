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
        instructions::create_tournament::handle_create_tournament(
            ctx,
            name,
            tournament_id,
            max_fighters,
            entry_fee,
            creator_fee_bps,
            registration_seconds,
        )
    }
}
