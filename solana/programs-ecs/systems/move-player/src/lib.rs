use bolt_lang::*;
use borsh::{BorshDeserialize, BorshSerialize};
use game_config::GameConfig;
use grid::Grid;
use player::Player;

declare_id!("F7qDssjJp9USkMakyj8FbnyuV5HR2CMGP8PRx6bmL89T");

/// Direction: 0=Up(y-1), 1=Down(y+1), 2=Left(x-1), 3=Right(x+1)

#[system]
pub mod move_player {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args = Args::try_from_slice(&args_p)?;
        let game = &mut ctx.accounts.game_config;
        let grid = &mut ctx.accounts.grid;
        let player = &mut ctx.accounts.player;

        require!(game.status == 1, MoveError::GameNotActive);
        require!(player.alive, MoveError::PlayerNotAlive);

        // Anti-spam: enforce minimum gap based on speed
        let clock = Clock::get()?;
        let current_slot = clock.slot;
        let min_gap = 2u64.saturating_sub(player.speed.saturating_sub(1) as u64).max(1);
        if player.last_move_slot > 0 {
            require!(
                current_slot >= player.last_move_slot + min_gap,
                MoveError::MoveTooFast
            );
        }

        // Calculate new position
        let (new_x, new_y) = match args.direction {
            0 => {
                // Up
                require!(player.y > 0, MoveError::OutOfBounds);
                (player.x, player.y - 1)
            }
            1 => {
                // Down
                require!(player.y < game.grid_height - 1, MoveError::OutOfBounds);
                (player.x, player.y + 1)
            }
            2 => {
                // Left
                require!(player.x > 0, MoveError::OutOfBounds);
                (player.x - 1, player.y)
            }
            3 => {
                // Right
                require!(player.x < game.grid_width - 1, MoveError::OutOfBounds);
                (player.x + 1, player.y)
            }
            _ => return Err(MoveError::InvalidDirection.into()),
        };

        let idx = (new_y as usize) * (game.grid_width as usize) + (new_x as usize);
        let cell = grid.cells[idx];

        match cell {
            0 => {
                // Empty - just move
            }
            4 => {
                // Explosion - player dies
                player.alive = false;
            }
            5 => {
                // Loot pickup — value computed dynamically from prize pool
                let loot_amount = (game.prize_pool / 50).max(1000);
                player.collected_sol = player
                    .collected_sol
                    .checked_add(loot_amount)
                    .ok_or(MoveError::MathOverflow)?;
                grid.cells[idx] = 0;
            }
            6 => {
                // Powerup pickup
                match grid.powerup_types[idx] {
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
                grid.powerup_types[idx] = 0;
                grid.cells[idx] = 0;
            }
            _ => {
                // 1=wall, 2=block, 3=bomb - not walkable
                return Err(MoveError::CellNotWalkable.into());
            }
        }

        player.x = new_x;
        player.y = new_y;
        player.last_move_slot = current_slot;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_config: GameConfig,
        pub grid: Grid,
        pub player: Player,
    }
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Args {
    pub direction: u8,
}

#[error_code]
pub enum MoveError {
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Player is not alive")]
    PlayerNotAlive,
    #[msg("Invalid direction")]
    InvalidDirection,
    #[msg("Cell is not walkable")]
    CellNotWalkable,
    #[msg("Move too fast")]
    MoveTooFast,
    #[msg("Out of bounds")]
    OutOfBounds,
    #[msg("Math overflow")]
    MathOverflow,
}
