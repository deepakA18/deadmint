use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Aup9nTYaxPfvXiu4jLzj4oQQXwkJe5CiyBixRb57wfZM");

#[program]
pub mod deadmint {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        game_id: u64,
        entry_fee: u64,
        max_players: u8,
    ) -> Result<()> {
        instructions::initialize_game::handler(ctx, game_id, entry_fee, max_players)
    }

    pub fn join_game(ctx: Context<JoinGame>, player_authority: Pubkey) -> Result<()> {
        instructions::join_game::handler(ctx, player_authority)
    }

    pub fn move_player(ctx: Context<MovePlayer>, direction: u8) -> Result<()> {
        instructions::move_player::handler(ctx, direction)
    }

    pub fn place_bomb(ctx: Context<PlaceBomb>) -> Result<()> {
        instructions::place_bomb::handler(ctx)
    }

    pub fn detonate_bomb(ctx: Context<DetonateBomb>, bomb_index: u8) -> Result<()> {
        instructions::detonate_bomb::handler(ctx, bomb_index)
    }

    pub fn check_game_end(ctx: Context<CheckGameEnd>) -> Result<()> {
        instructions::check_game_end::handler(ctx)
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        instructions::claim_prize::handler(ctx)
    }
}
