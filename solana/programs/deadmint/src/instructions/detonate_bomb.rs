use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::DeadmintError;

#[derive(Accounts)]
pub struct DetonateBomb<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
    /// Anyone can call detonate (crank-able). Payer just pays tx fee.
    pub authority: Signer<'info>,
    // remaining_accounts: all Player accounts for kill detection
}

pub fn handler(ctx: Context<DetonateBomb>, bomb_index: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;

    require!(game.status == STATUS_ACTIVE, DeadmintError::GameNotActive);
    require!((bomb_index as usize) < MAX_BOMBS, DeadmintError::InvalidBombIndex);

    let bomb = &game.bombs[bomb_index as usize];
    require!(bomb.active, DeadmintError::BombNotActive);
    require!(!bomb.detonated, DeadmintError::BombAlreadyDetonated);

    let clock = Clock::get()?;
    require!(
        clock.slot >= bomb.placed_at_slot + bomb.fuse_slots as u64,
        DeadmintError::FuseNotExpired
    );

    // Copy bomb data before mutating
    let bx = bomb.x as usize;
    let by = bomb.y as usize;
    let range = bomb.range as usize;
    let bomb_owner = bomb.owner;
    let width = game.grid_width as usize;

    // Clean up any old explosions from previous detonations before creating new ones
    if game.last_detonate_slot > 0 && clock.slot > game.last_detonate_slot + EXPLOSION_DURATION_SLOTS {
        let total = (game.grid_width as usize) * (game.grid_height as usize);
        for i in 0..total {
            if game.cells[i] == CELL_EXPLOSION {
                game.cells[i] = CELL_EMPTY;
            }
        }
    }

    // Mark bomb as detonated
    game.bombs[bomb_index as usize].detonated = true;
    game.bombs[bomb_index as usize].active = false;
    game.bomb_count = game.bomb_count.saturating_sub(1);
    game.last_detonate_slot = clock.slot;

    // Mark bomb cell as explosion
    let bomb_idx = by * width + bx;
    game.cells[bomb_idx] = CELL_EXPLOSION;

    // Collect explosion cells for player kill detection
    let mut explosion_cells = Vec::with_capacity(1 + range * 4);
    explosion_cells.push(bomb_idx);

    // Use slot as pseudo-random seed for loot determination
    let slot_bytes = clock.slot.to_le_bytes();

    // Propagate explosion in 4 directions
    let directions: [(i16, i16); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
    for (dx, dy) in directions {
        for dist in 1..=range {
            let nx = bx as i16 + dx * dist as i16;
            let ny = by as i16 + dy * dist as i16;

            if nx < 0 || nx >= game.grid_width as i16 || ny < 0 || ny >= game.grid_height as i16 {
                break;
            }

            let idx = ny as usize * width + nx as usize;
            match game.cells[idx] {
                CELL_WALL => {
                    // Indestructible wall — stop this direction
                    break;
                }
                CELL_BLOCK => {
                    // Destructible block — destroy and determine loot drop
                    let seed_val = slot_bytes[dist % 8].wrapping_add(idx as u8);
                    let roll = seed_val % 100;

                    if roll < 40 {
                        // 40% chance: SOL loot
                        game.cells[idx] = CELL_LOOT;
                    } else if roll < 55 {
                        // 15% chance: powerup
                        game.cells[idx] = CELL_POWERUP;
                        game.powerup_types[idx] = (seed_val % 3) + 1;
                    } else {
                        // 45% chance: empty
                        game.cells[idx] = CELL_EMPTY;
                    }
                    // Explosion stops at first block in this direction
                    break;
                }
                CELL_BOMB => {
                    // Another bomb — mark as explosion for chain reaction
                    game.cells[idx] = CELL_EXPLOSION;
                    explosion_cells.push(idx);
                    break;
                }
                _ => {
                    // Empty, loot, powerup, or existing explosion — mark as explosion
                    game.cells[idx] = CELL_EXPLOSION;
                    explosion_cells.push(idx);
                }
            }
        }
    }

    // Check all player accounts passed via remaining_accounts for kills
    let program_id = crate::ID;
    for acc_info in ctx.remaining_accounts.iter() {
        // Verify the account is owned by our program
        if acc_info.owner != &program_id {
            continue;
        }

        // Try to deserialize as Player
        let mut data = acc_info.try_borrow_mut_data()?;
        if data.len() < Player::SIZE {
            continue;
        }

        // Check discriminator (first 8 bytes)
        let disc = &data[..8];
        let player_disc = Player::DISCRIMINATOR;
        if disc != player_disc {
            continue;
        }

        // Parse key fields manually for efficiency:
        // After 8-byte discriminator:
        // game: Pubkey (32 bytes) at offset 8
        // authority: Pubkey (32 bytes) at offset 40
        // player_index: u8 at offset 72
        // x: u8 at offset 73
        // y: u8 at offset 74
        // alive: bool at offset 75

        let player_game = Pubkey::try_from(&data[8..40]).unwrap();
        if player_game != game.key() {
            continue;
        }

        let player_authority = Pubkey::try_from(&data[40..72]).unwrap();
        let player_x = data[73];
        let player_y = data[74];
        let alive = data[75] != 0;

        // Decrement active_bombs for bomb owner
        if player_authority == bomb_owner {
            // active_bombs is at offset: 8 + 32 + 32 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 1 = 94
            let active_bombs = data[94];
            data[94] = active_bombs.saturating_sub(1);
        }

        // Check if this alive player is standing on an explosion cell
        if alive {
            let player_idx = (player_y as usize) * width + (player_x as usize);
            if explosion_cells.contains(&player_idx) {
                // Kill the player
                data[75] = 0; // alive = false

                // Increment bomb owner's kills (if not self)
                // We'll handle kill counting via a second pass or skip for simplicity
            }
        }
    }

    Ok(())
}
