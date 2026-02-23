use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct MovePlayer<'info> {
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

pub fn handler(ctx: Context<MovePlayer>, direction: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = &mut ctx.accounts.player;

    require!(game.status == STATUS_ACTIVE, DeadmintError::GameNotActive);
    require!(player.alive, DeadmintError::PlayerNotAlive);

    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // Clean up old explosions (only if enough time has passed since last detonation)
    if game.last_detonate_slot > 0 && current_slot > game.last_detonate_slot + EXPLOSION_DURATION_SLOTS {
        let total = (game.grid_width as usize) * (game.grid_height as usize);
        for i in 0..total {
            if game.cells[i] == CELL_EXPLOSION {
                game.cells[i] = CELL_EMPTY;
            }
        }
    }

    // Anti-spam: enforce minimum gap based on speed
    let min_gap = 2u64.saturating_sub(player.speed.saturating_sub(1) as u64).max(1);
    if player.last_move_slot > 0 {
        require!(
            current_slot >= player.last_move_slot + min_gap,
            DeadmintError::MoveTooFast
        );
    }

    // Calculate new position
    let (new_x, new_y) = match direction {
        0 => {
            // Up
            require!(player.y > 0, DeadmintError::OutOfBounds);
            (player.x, player.y - 1)
        }
        1 => {
            // Down
            require!(player.y < game.grid_height - 1, DeadmintError::OutOfBounds);
            (player.x, player.y + 1)
        }
        2 => {
            // Left
            require!(player.x > 0, DeadmintError::OutOfBounds);
            (player.x - 1, player.y)
        }
        3 => {
            // Right
            require!(player.x < game.grid_width - 1, DeadmintError::OutOfBounds);
            (player.x + 1, player.y)
        }
        _ => return Err(DeadmintError::InvalidDirection.into()),
    };

    let idx = game.cell_idx(new_x, new_y);
    let cell = game.cells[idx];

    match cell {
        CELL_EMPTY => {
            // Just move
        }
        CELL_EXPLOSION => {
            // Player dies
            player.alive = false;
        }
        CELL_LOOT => {
            // Loot pickup — value computed dynamically from prize pool
            let loot_amount = (game.prize_pool / 50).max(1000);
            player.collected_sol = player
                .collected_sol
                .checked_add(loot_amount)
                .ok_or(DeadmintError::MathOverflow)?;
            game.cells[idx] = CELL_EMPTY;
        }
        CELL_POWERUP => {
            // Powerup pickup
            match game.powerup_types[idx] {
                1 => {
                    // Bomb range +1 (max 5)
                    player.bomb_range = player.bomb_range.saturating_add(1).min(5);
                }
                2 => {
                    // Extra bomb +1 (max 3)
                    player.max_bombs = player.max_bombs.saturating_add(1).min(3);
                }
                3 => {
                    // Speed +1 (max 3)
                    player.speed = player.speed.saturating_add(1).min(3);
                }
                _ => {}
            }
            game.powerup_types[idx] = 0;
            game.cells[idx] = CELL_EMPTY;
        }
        _ => {
            // CELL_WALL, CELL_BLOCK, CELL_BOMB — not walkable
            return Err(DeadmintError::CellNotWalkable.into());
        }
    }

    player.x = new_x;
    player.y = new_y;
    player.last_move_slot = current_slot;

    Ok(())
}
