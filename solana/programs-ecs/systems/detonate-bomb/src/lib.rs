use bolt_lang::*;
use bomb::Bomb;
use game_config::GameConfig;
use grid::Grid;
use player::Player;

declare_id!("D9yXnYNNPUc4SGMZsxydYcFp1np7WPXnEB8Vvati8c6D");

#[system]
pub mod detonate_bomb {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let game = &mut ctx.accounts.game_config;
        let grid = &mut ctx.accounts.grid;
        let bomb = &mut ctx.accounts.bomb;
        let player = &mut ctx.accounts.player; // bomb owner

        require!(game.status == 1, DetonateError::GameNotActive);
        require!(!bomb.detonated, DetonateError::AlreadyDetonated);

        let clock = Clock::get()?;
        require!(
            clock.slot >= bomb.placed_at_slot + bomb.fuse_slots as u64,
            DetonateError::FuseNotExpired
        );

        bomb.detonated = true;
        player.active_bombs = player.active_bombs.saturating_sub(1);

        let width = game.grid_width as usize;
        let bx = bomb.x as usize;
        let by = bomb.y as usize;
        let range = bomb.range as usize;

        // Mark bomb cell as explosion
        let bomb_idx = by * width + bx;
        grid.cells[bomb_idx] = 4;

        // Propagate explosion in 4 directions
        let directions: [(i16, i16); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

        // Use slot as pseudo-random seed for loot determination (Phase 1)
        let slot_bytes = clock.slot.to_le_bytes();

        for (dx, dy) in directions {
            for dist in 1..=range {
                let nx = bx as i16 + dx * dist as i16;
                let ny = by as i16 + dy * dist as i16;

                if nx < 0
                    || nx >= game.grid_width as i16
                    || ny < 0
                    || ny >= game.grid_height as i16
                {
                    break;
                }

                let idx = ny as usize * width + nx as usize;
                match grid.cells[idx] {
                    1 => {
                        // Indestructible wall - stop this direction
                        break;
                    }
                    2 => {
                        // Destructible block - destroy and determine loot drop
                        let seed_val = slot_bytes[dist % 8].wrapping_add(idx as u8);
                        let roll = seed_val % 100;

                        if roll < 40 {
                            // 40% chance: SOL loot (value computed at pickup time)
                            grid.cells[idx] = 5;
                        } else if roll < 55 {
                            // 15% chance: powerup
                            grid.cells[idx] = 6;
                            grid.powerup_types[idx] = (seed_val % 3) + 1;
                        } else {
                            // 45% chance: empty
                            grid.cells[idx] = 0;
                        }
                        // Explosion stops at first block in this direction
                        break;
                    }
                    3 => {
                        // Another bomb - mark as explosion for chain reaction
                        grid.cells[idx] = 4;
                        break;
                    }
                    _ => {
                        // Empty, loot, powerup, or existing explosion - mark as explosion
                        grid.cells[idx] = 4;
                    }
                }
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_config: GameConfig,
        pub grid: Grid,
        pub bomb: Bomb,
        pub player: Player,
    }
}

#[error_code]
pub enum DetonateError {
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Bomb already detonated")]
    AlreadyDetonated,
    #[msg("Fuse has not expired yet")]
    FuseNotExpired,
}
