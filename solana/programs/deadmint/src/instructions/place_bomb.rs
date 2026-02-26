use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct PlaceBomb<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), &[player.player_index]],
        bump = player.bump,
        constraint = player.game == game.key() @ DeadmintError::PlayerGameMismatch,
        constraint = player.authority == authority.key() @ DeadmintError::Unauthorized,
    )]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<PlaceBomb>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = &mut ctx.accounts.player;

    require!(game.status == STATUS_ACTIVE, DeadmintError::GameNotActive);
    require!(player.alive, DeadmintError::PlayerNotAlive);
    require!(
        player.active_bombs < player.max_bombs,
        DeadmintError::NoBombsAvailable
    );

    let idx = game.cell_idx(player.x, player.y);
    require!(
        game.cells[idx] == CELL_EMPTY || game.cells[idx] == CELL_LOOT || game.cells[idx] == CELL_POWERUP,
        DeadmintError::CellOccupied
    );

    // Find a free bomb slot
    let slot_idx = game.find_free_bomb_slot().ok_or(DeadmintError::BombSlotsFull)?;

    // Mark cell as bomb on the grid
    game.cells[idx] = CELL_BOMB;

    // Initialize bomb slot
    let clock = Clock::get()?;
    game.bombs[slot_idx] = BombSlot {
        active: true,
        owner: player.authority,
        x: player.x,
        y: player.y,
        range: player.bomb_range,
        fuse_slots: 8, // ~3 seconds at ~400ms slots
        placed_at_slot: clock.slot,
        detonated: false,
    };
    game.bomb_count += 1;

    player.active_bombs += 1;
    player.input_nonce += 1;

    Ok(())
}
