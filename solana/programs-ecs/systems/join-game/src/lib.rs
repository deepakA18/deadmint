use bolt_lang::*;
use borsh::{BorshDeserialize, BorshSerialize};
use game_config::GameConfig;
use player::Player;

declare_id!("B5KDtjkRhhGkUKmaZAyPDjeLF6bTBSxWrVu4pjHBpmvN");

const SPAWN_POSITIONS: [(u8, u8); 4] = [(1, 1), (11, 1), (1, 9), (11, 9)];

#[system]
pub mod join_game {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args = Args::try_from_slice(&args_p)?;
        let game = &mut ctx.accounts.game_config;
        let player = &mut ctx.accounts.player;

        // Validate game is in Lobby
        require!(game.status == 0, JoinError::GameNotInLobby);
        require!(
            game.current_players < game.max_players,
            JoinError::GameFull
        );
        // Player must not have already joined
        require!(player.authority.is_none(), JoinError::PlayerAlreadyJoined);

        let idx = game.current_players as usize;
        let (spawn_x, spawn_y) = SPAWN_POSITIONS[idx];

        // Set player fields (authority passed as arg from the signing wallet)
        player.authority = Some(args.player_authority);
        player.x = spawn_x;
        player.y = spawn_y;
        player.alive = true;
        player.collected_sol = 0;
        player.wager = game.entry_fee;
        player.bomb_range = 1;
        player.max_bombs = 1;
        player.active_bombs = 0;
        player.speed = 1;
        player.player_index = game.current_players;
        player.last_move_slot = 0;
        player.kills = 0;

        game.current_players += 1;
        game.prize_pool = game
            .prize_pool
            .checked_add(game.entry_fee)
            .ok_or(JoinError::MathOverflow)?;

        // Auto-start when full
        if game.current_players == game.max_players {
            game.status = 1; // Active
            let clock = Clock::get()?;
            game.started_at = clock.unix_timestamp;
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_config: GameConfig,
        pub player: Player,
    }
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Args {
    pub player_authority: Pubkey,
}

#[error_code]
pub enum JoinError {
    #[msg("Game is not in lobby state")]
    GameNotInLobby,
    #[msg("Game is full")]
    GameFull,
    #[msg("Player already joined")]
    PlayerAlreadyJoined,
    #[msg("Math overflow")]
    MathOverflow,
}
