use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
    #[account(
        init,
        payer = payer,
        space = Player::SIZE,
        seeds = [b"player", game.key().as_ref(), &[game.current_players]],
        bump,
    )]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinGame>, player_authority: Pubkey) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = &mut ctx.accounts.player;

    require!(game.status == STATUS_LOBBY, DeadmintError::GameNotInLobby);
    require!(game.current_players < game.max_players, DeadmintError::GameFull);

    let idx = game.current_players as usize;
    let (spawn_x, spawn_y) = SPAWN_POSITIONS[idx];

    // Initialize player
    player.game = game.key();
    player.authority = player_authority;
    player.player_index = game.current_players;
    player.x = spawn_x;
    player.y = spawn_y;
    player.alive = true;
    player.collected_sol = 0;
    player.wager = game.entry_fee;
    player.bomb_range = 1;
    player.max_bombs = 1;
    player.active_bombs = 0;
    player.speed = 1;
    player.last_move_slot = 0;
    player.kills = 0;
    player.input_nonce = 0;
    player.bump = ctx.bumps.player;

    // Transfer entry fee from payer to game account
    if game.entry_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: game.to_account_info(),
                },
            ),
            game.entry_fee,
        )?;
    }

    game.current_players += 1;
    game.prize_pool = game
        .prize_pool
        .checked_add(game.entry_fee)
        .ok_or(DeadmintError::MathOverflow)?;

    // Auto-start when full
    if game.current_players == game.max_players {
        game.status = STATUS_ACTIVE;
        let clock = Clock::get()?;
        game.started_at = clock.unix_timestamp;
    }

    Ok(())
}
