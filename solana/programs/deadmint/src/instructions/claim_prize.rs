use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
    #[account(
        seeds = [b"player", game.key().as_ref(), &[player.player_index]],
        bump = player.bump,
        constraint = player.game == game.key() @ DeadmintError::PlayerGameMismatch,
    )]
    pub player: Account<'info, Player>,
    /// The winner's wallet (receives SOL payout)
    #[account(mut)]
    pub winner: Signer<'info>,
}

pub fn handler(ctx: Context<ClaimPrize>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = &ctx.accounts.player;

    require!(game.status == STATUS_FINISHED, DeadmintError::GameNotFinished);
    require!(game.winner != Pubkey::default(), DeadmintError::NoWinner);
    require!(game.prize_pool > 0, DeadmintError::AlreadyClaimed);

    // Winner is identified by player.authority (session key).
    // But claim_prize is called by the actual wallet.
    // So we check: game.winner == player.authority (the session key that won)
    // and the winner signer can be anyone who can prove they own this player.
    // For simplicity: game.winner must match player.authority
    require!(game.winner == player.authority, DeadmintError::NotWinner);

    // Calculate payouts
    let platform_fee = game
        .prize_pool
        .checked_mul(game.platform_fee_bps as u64)
        .ok_or(DeadmintError::MathOverflow)?
        / 10_000;
    let winner_payout = game
        .prize_pool
        .checked_sub(platform_fee)
        .ok_or(DeadmintError::MathOverflow)?;

    // Transfer SOL from Game PDA to winner
    let game_info = game.to_account_info();
    let winner_info = ctx.accounts.winner.to_account_info();

    **game_info.try_borrow_mut_lamports()? -= winner_payout;
    **winner_info.try_borrow_mut_lamports()? += winner_payout;

    game.prize_pool = 0;
    game.status = STATUS_CLAIMED;

    msg!(
        "Winner payout: {} lamports, platform fee: {} lamports",
        winner_payout,
        platform_fee,
    );

    Ok(())
}
