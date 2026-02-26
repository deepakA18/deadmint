use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Hx7eQa2NhDDKiBThKyo4VNLnBi7pApQX9JZTsA5xBbdb");

#[ephemeral]
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

    /// Delegate a PDA (Game or Player) to the Ephemeral Rollup validator.
    /// Seeds are passed as instruction data so the SDK can verify PDA ownership.
    pub fn delegate(ctx: Context<DelegateInput>, seeds: Vec<Vec<u8>>) -> Result<()> {
        instructions::delegate::handler(ctx, seeds)
    }

    /// Commit state and undelegate a PDA from the Ephemeral Rollup.
    pub fn undelegate(ctx: Context<UndelegateInput>) -> Result<()> {
        instructions::undelegate::handler(ctx)
    }
}
