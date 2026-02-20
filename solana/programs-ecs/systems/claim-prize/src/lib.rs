use bolt_lang::*;
use borsh::{BorshDeserialize, BorshSerialize};
use game_config::GameConfig;
use player::Player;

declare_id!("HSFH8eHW5cXpaCTsseCvrya6D4qfa98rXt4kC8S7nAAg");

#[system]
pub mod claim_prize {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args = Args::try_from_slice(&args_p)?;
        let game = &mut ctx.accounts.game_config;
        let player = &mut ctx.accounts.player;

        require!(game.status == 2, ClaimError::GameNotFinished);
        require!(game.winner.is_some(), ClaimError::NoWinner);
        require!(game.winner == player.authority, ClaimError::NotWinner);
        require!(game.prize_pool > 0, ClaimError::AlreadyClaimed);

        // Calculate payouts
        let platform_fee = game
            .prize_pool
            .checked_mul(game.platform_fee_bps as u64)
            .ok_or(ClaimError::MathOverflow)?
            / 10_000;
        let winner_payout = game
            .prize_pool
            .checked_sub(platform_fee)
            .ok_or(ClaimError::MathOverflow)?;

        // Record payout amount on player for client-side settlement
        player.collected_sol = winner_payout;

        game.status = 3; // Claimed
        game.prize_pool = 0;

        msg!(
            "Winner payout: {} lamports, platform fee: {} lamports, treasury: {}",
            winner_payout,
            platform_fee,
            args.treasury,
        );

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
    pub treasury: Pubkey,
}

#[error_code]
pub enum ClaimError {
    #[msg("Game is not finished")]
    GameNotFinished,
    #[msg("No winner set")]
    NoWinner,
    #[msg("Not the winner")]
    NotWinner,
    #[msg("Prize already claimed")]
    AlreadyClaimed,
    #[msg("Math overflow")]
    MathOverflow,
}
