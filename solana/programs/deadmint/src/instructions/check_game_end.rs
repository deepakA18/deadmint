use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct CheckGameEnd<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
    pub authority: Signer<'info>,
    // remaining_accounts: all Player accounts for alive counting
}

pub fn handler(ctx: Context<CheckGameEnd>) -> Result<()> {
    let game = &mut ctx.accounts.game;

    require!(game.status == STATUS_ACTIVE, DeadmintError::GameNotActive);

    // Check timer expiry (round_duration == 0 means no time limit)
    let clock = Clock::get()?;
    let timed_out = game.round_duration > 0
        && game.started_at > 0
        && (clock.unix_timestamp - game.started_at) >= game.round_duration as i64;

    // Count alive players from remaining_accounts (trustless, on-chain!)
    let program_id = crate::ID;
    let mut alive_count: u8 = 0;
    let mut last_alive_authority = Pubkey::default();

    for acc_info in ctx.remaining_accounts.iter() {
        if acc_info.owner != &program_id {
            continue;
        }

        let data = acc_info.try_borrow_data()?;
        if data.len() < Player::SIZE {
            continue;
        }

        // Check discriminator
        let disc = &data[..8];
        if disc != Player::DISCRIMINATOR {
            continue;
        }

        // Verify player belongs to this game
        let player_game = Pubkey::try_from(&data[8..40]).unwrap();
        if player_game != game.key() {
            continue;
        }

        let player_authority = Pubkey::try_from(&data[40..72]).unwrap();
        let alive = data[75] != 0;

        if alive {
            alive_count += 1;
            last_alive_authority = player_authority;
        }
    }

    if alive_count <= 1 || timed_out {
        game.status = STATUS_FINISHED;
        if alive_count == 1 {
            game.winner = last_alive_authority;
        }
    }

    Ok(())
}
