use bolt_lang::*;
use bomb::Bomb;
use game_config::GameConfig;
use grid::Grid;
use player::Player;

declare_id!("69QgbvubUeQ8V335u1pdpECXoMu3UU9Xp1sZtCGKH17T");

#[system]
pub mod place_bomb {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let game = &mut ctx.accounts.game_config;
        let grid = &mut ctx.accounts.grid;
        let player = &mut ctx.accounts.player;
        let bomb = &mut ctx.accounts.bomb;

        require!(game.status == 1, BombError::GameNotActive);
        require!(player.alive, BombError::PlayerNotAlive);
        require!(
            player.active_bombs < player.max_bombs,
            BombError::NoBombsAvailable
        );

        let idx = (player.y as usize) * (game.grid_width as usize) + (player.x as usize);
        require!(
            grid.cells[idx] == 0 || grid.cells[idx] == 5 || grid.cells[idx] == 6,
            BombError::CellOccupied
        );

        // Mark cell as bomb on the grid
        grid.cells[idx] = 3;

        // Initialize bomb component
        let clock = Clock::get()?;
        bomb.owner = player.authority;
        bomb.x = player.x;
        bomb.y = player.y;
        bomb.range = player.bomb_range;
        bomb.fuse_slots = 6; // ~3 seconds at ~500ms slots
        bomb.placed_at_slot = clock.slot;
        bomb.detonated = false;

        player.active_bombs += 1;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_config: GameConfig,
        pub grid: Grid,
        pub player: Player,
        pub bomb: Bomb,
    }
}

#[error_code]
pub enum BombError {
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Player is not alive")]
    PlayerNotAlive,
    #[msg("No bombs available")]
    NoBombsAvailable,
    #[msg("Cell is occupied by a bomb")]
    CellOccupied,
}
