use bolt_lang::*;
use borsh::{BorshDeserialize, BorshSerialize};
use game_config::GameConfig;
use grid::Grid;

declare_id!("6LRsvRNMA9uFa3XnKi4tswXrgsJPzhGEaCQSCcc6tdht");

#[system]
pub mod init_game {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args = Args::try_from_slice(&args_p)?;
        let game = &mut ctx.accounts.game_config;
        let grid = &mut ctx.accounts.grid;

        game.game_id = args.game_id;
        game.authority = Some(args.authority);
        game.grid_width = 13;
        game.grid_height = 11;
        game.max_players = 4;
        game.current_players = 0;
        game.entry_fee = args.entry_fee;
        game.prize_pool = 0;
        game.status = 0; // Lobby
        game.round_duration = 180;
        game.platform_fee_bps = 300; // 3%

        let clock = Clock::get()?;
        game.created_at = clock.unix_timestamp;
        game.started_at = 0;

        // Generate classic Bomberman grid (13x11)
        for y in 0..11u8 {
            for x in 0..13u8 {
                let idx = (y as usize) * 13 + (x as usize);
                if x == 0 || x == 12 || y == 0 || y == 10 {
                    // Border walls
                    grid.cells[idx] = 1;
                } else if x % 2 == 0 && y % 2 == 0 {
                    // Indestructible pillars at even x,y
                    grid.cells[idx] = 1;
                } else if is_spawn_safe_zone(x, y) {
                    // Keep spawn corners clear
                    grid.cells[idx] = 0;
                } else {
                    // Destructible block
                    grid.cells[idx] = 2;
                }
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_config: GameConfig,
        pub grid: Grid,
    }
}

/// Spawn corners at (1,1), (11,1), (1,9), (11,9).
/// Keep cells clear within Manhattan distance <= 2 of each spawn.
fn is_spawn_safe_zone(x: u8, y: u8) -> bool {
    let spawns: [(u8, u8); 4] = [(1, 1), (11, 1), (1, 9), (11, 9)];
    for (sx, sy) in spawns {
        let dx = if x > sx { x - sx } else { sx - x };
        let dy = if y > sy { y - sy } else { sy - y };
        if dx + dy <= 2 {
            return true;
        }
    }
    false
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Args {
    pub game_id: u64,
    pub authority: Pubkey,
    pub entry_fee: u64,
}
