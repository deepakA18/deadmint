use bolt_lang::*;
use borsh::{BorshDeserialize, BorshSerialize};
use game_config::GameConfig;
use player::Player;

declare_id!("7z2CQjGyDAv3REvjj1Y19sKM9edgE9tB3QFD8pAAji3N");

#[system]
pub mod check_game_end {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args = Args::try_from_slice(&args_p)?;
        let game = &mut ctx.accounts.game_config;
        let _player = &mut ctx.accounts.player;

        require!(game.status == 1, GameEndError::GameNotActive);

        // Check timer expiry
        let clock = Clock::get()?;
        let timed_out = game.started_at > 0
            && (clock.unix_timestamp - game.started_at) >= game.round_duration as i64;

        // Client provides alive_count and winner (reads all player accounts off-chain)
        if args.alive_count <= 1 || timed_out {
            game.status = 2; // Finished
            if args.winner != Pubkey::default() {
                game.winner = Some(args.winner);
            }
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
    pub alive_count: u8,
    pub winner: Pubkey,
}

#[error_code]
pub enum GameEndError {
    #[msg("Game is not active")]
    GameNotActive,
}
