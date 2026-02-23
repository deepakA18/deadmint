use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = payer,
        space = Game::SIZE,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeGame>, game_id: u64, entry_fee: u64, max_players: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;

    game.game_id = game_id;
    game.authority = ctx.accounts.payer.key();
    game.grid_width = GRID_WIDTH;
    game.grid_height = GRID_HEIGHT;
    game.max_players = max_players;
    game.current_players = 0;
    game.entry_fee = entry_fee;
    game.prize_pool = 0;
    game.status = STATUS_LOBBY;
    game.winner = Pubkey::default();
    game.round_duration = 0; // No time limit
    game.platform_fee_bps = 300; // 3%
    game.bump = ctx.bumps.game;

    let clock = Clock::get()?;
    game.created_at = clock.unix_timestamp;
    game.started_at = 0;

    // Generate classic Bomberman grid (13×11)
    for y in 0..GRID_HEIGHT {
        for x in 0..GRID_WIDTH {
            let idx = (y as usize) * (GRID_WIDTH as usize) + (x as usize);
            if x == 0 || x == 12 || y == 0 || y == 10 {
                // Border walls
                game.cells[idx] = CELL_WALL;
            } else if x % 2 == 0 && y % 2 == 0 {
                // Indestructible pillars at even x,y
                game.cells[idx] = CELL_WALL;
            } else if is_spawn_safe_zone(x, y) {
                // Keep spawn corners clear
                game.cells[idx] = CELL_EMPTY;
            } else {
                // Destructible block
                game.cells[idx] = CELL_BLOCK;
            }
        }
    }

    // Initialize bombs and powerup_types to zeros (already default)
    game.bomb_count = 0;
    game.last_detonate_slot = 0;

    Ok(())
}

/// Spawn corners at (1,1), (11,1), (1,9), (11,9).
/// Keep cells clear within Manhattan distance <= 2 of each spawn.
fn is_spawn_safe_zone(x: u8, y: u8) -> bool {
    for (sx, sy) in SPAWN_POSITIONS {
        let dx = if x > sx { x - sx } else { sx - x };
        let dy = if y > sy { y - sy } else { sy - y };
        if dx + dy <= 2 {
            return true;
        }
    }
    false
}
