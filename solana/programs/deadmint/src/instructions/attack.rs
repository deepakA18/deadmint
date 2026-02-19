use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;
use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Boss, BossStatus, RaidTicket};

// =============================================================
//  Bonding curve helpers (linear: price = base_price + slope * supply)
// =============================================================

/// Integer square root via Newton's method (u128).
fn isqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Given sol_in lamports, compute how many tokens you get.
/// integral of (base_price + slope * s) ds from S to S+T = sol_in
/// => slope*T^2/2 + (base_price + slope*S)*T - sol_in = 0
/// => T = (-b + sqrt(b^2 + 2*slope*sol_in)) / slope
///    where b = base_price + slope * S
pub fn tokens_for_sol(base_price: u64, slope: u64, current_supply: u64, sol_in: u64) -> Result<u64> {
    let bp = base_price as u128;
    let sl = slope as u128;
    let s = current_supply as u128;
    let sol = sol_in as u128;

    let b = bp + sl * s;
    let discriminant = b * b + 2 * sl * sol;
    let sqrt_disc = isqrt(discriminant);

    let tokens = (sqrt_disc - b) * 1_000_000 / sl; // scale up then divide
    let tokens = tokens / 1_000_000; // scale back

    Ok(tokens as u64)
}

/// Given T tokens to sell starting from supply S, compute SOL out.
/// integral of (base_price + slope * s) ds from (S-T) to S
/// = T * base_price + slope * T * (2*S - T - 1) / 2
pub fn sol_for_tokens(base_price: u64, slope: u64, current_supply: u64, tokens: u64) -> Result<u64> {
    let bp = base_price as u128;
    let sl = slope as u128;
    let s = current_supply as u128;
    let t = tokens as u128;

    let sol = t * bp + sl * t * (2 * s - t - 1) / 2;
    Ok(sol as u64)
}

// =============================================================
//  COMMIT ATTACK — buy tokens on curve + request VRF
// =============================================================

#[vrf]
#[derive(Accounts)]
pub struct CommitAttack<'info> {
    #[account(
        mut,
        constraint = boss.status == BossStatus::Alive @ ErrorCode::BossNotAlive,
    )]
    pub boss: Account<'info, Boss>,

    #[account(
        init_if_needed,
        payer = player,
        seeds = [b"raid_ticket", boss.key().as_ref(), player.key().as_ref()],
        space = RaidTicket::SIZE,
        bump,
    )]
    pub raid_ticket: Account<'info, RaidTicket>,

    /// CHECK: PDA vault holding SOL
    #[account(
        mut,
        seeds = [b"boss_vault", boss.key().as_ref()],
        bump,
    )]
    pub boss_vault: SystemAccount<'info>,

    /// CHECK: MagicBlock oracle queue
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CommitAttack<'info> {
    pub fn handle(
        &mut self,
        sol_amount: u64,
        bumps: &CommitAttackBumps,
    ) -> Result<()> {
        require!(sol_amount > 0, ErrorCode::ZeroAttackAmount);
        require!(
            self.raid_ticket.pending_sol == 0,
            ErrorCode::AttackPending
        );

        // --- compute tokens from bonding curve ---
        let tokens = tokens_for_sol(
            self.boss.base_price,
            self.boss.slope,
            self.boss.total_supply,
            sol_amount,
        )?;

        // --- transfer SOL from player to vault ---
        anchor_lang::system_program::transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: self.player.to_account_info(),
                    to: self.boss_vault.to_account_info(),
                },
            ),
            sol_amount,
        )?;

        // --- update boss curve state ---
        self.boss.total_supply += tokens;
        self.boss.reserve_balance += sol_amount;

        // --- store pending attack on raid ticket ---
        let ticket = &mut self.raid_ticket;
        if ticket.boss == Pubkey::default() {
            // first-time init
            ticket.boss = self.boss.key();
            ticket.player = self.player.key();
            ticket.tokens_held = 0;
            ticket.total_damage = 0;
            ticket.claimed = false;
            ticket.bump = bumps.raid_ticket;
        }
        ticket.pending_sol = sol_amount;
        ticket.pending_tokens = tokens;

        // --- request VRF ---
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: self.player.key(),
            oracle_queue: self.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::CallbackResolveAttack::DISCRIMINATOR
                .to_vec(),
            caller_seed: self.raid_ticket.key().to_bytes(),
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: self.boss.key(),
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: self.raid_ticket.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            ..Default::default()
        });
        self.invoke_signed_vrf(&self.player.to_account_info(), &ix)?;

        msg!(
            "Attack committed: {} SOL → {} tokens | awaiting VRF",
            sol_amount, tokens,
        );

        Ok(())
    }
}

// =============================================================
//  CALLBACK — VRF delivers randomness, resolve attack
// =============================================================

#[derive(Accounts)]
pub struct CallbackResolveAttack<'info> {
    /// MagicBlock VRF program identity — proves legit callback
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(mut)]
    pub boss: Account<'info, Boss>,

    #[account(
        mut,
        constraint = raid_ticket.boss == boss.key(),
        constraint = raid_ticket.pending_sol > 0 @ ErrorCode::NoPendingAttack,
    )]
    pub raid_ticket: Account<'info, RaidTicket>,
}

impl<'info> CallbackResolveAttack<'info> {
    pub fn handle(&mut self, randomness: [u8; 32]) -> Result<()> {
        let roll = randomness[0] % 100;
        let tokens = self.raid_ticket.pending_tokens;

        // --- determine hit type and multiplier ---
        let (hit_type, multiplier) = if roll < HIT_MISS_UPPER {
            ("MISS", MULT_MISS)
        } else if roll < HIT_NORMAL_UPPER {
            ("NORMAL", MULT_NORMAL)
        } else if roll < HIT_STRONG_UPPER {
            ("STRONG", MULT_STRONG)
        } else if roll < HIT_CRIT_UPPER {
            ("CRITICAL", MULT_CRIT)
        } else if roll < HIT_MEGA_UPPER {
            ("MEGA CRIT", MULT_MEGA)
        } else {
            ("BOSS COUNTER", MULT_COUNTER)
        };

        let is_counter = roll >= HIT_MEGA_UPPER;

        // --- compute base damage = tokens purchased ---
        // damage = base_damage * multiplier/100 * (100 - defense) / 100
        let base_damage = tokens as u128;
        let damage = base_damage
            * multiplier as u128
            * (100 - self.boss.defense as u128)
            / 10_000; // div by 100*100
        let damage = damage as u64;

        // --- apply damage ---
        let actual_damage = damage.min(self.boss.current_hp);
        self.boss.current_hp = self.boss.current_hp.saturating_sub(damage);
        self.boss.total_damage += actual_damage;
        self.raid_ticket.total_damage += actual_damage;

        // --- credit tokens to player ---
        let mut tokens_credited = tokens;
        if is_counter {
            // Boss counter: player loses 10% of their tokens to loot pool
            let loss = tokens * COUNTER_TOKEN_LOSS_BPS / 10_000;
            tokens_credited = tokens.saturating_sub(loss);
            // The "lost" tokens are burned from supply, their SOL value goes to loot
            let lost_sol_value = sol_for_tokens(
                self.boss.base_price,
                self.boss.slope,
                self.boss.total_supply,
                loss,
            )?;
            self.boss.total_supply = self.boss.total_supply.saturating_sub(loss);
            self.boss.reserve_balance = self.boss.reserve_balance.saturating_sub(lost_sol_value);
            self.boss.loot_pool += lost_sol_value;
        }
        self.raid_ticket.tokens_held += tokens_credited;

        // --- clear pending ---
        self.raid_ticket.pending_sol = 0;
        self.raid_ticket.pending_tokens = 0;

        // --- check if boss is dead ---
        if self.boss.current_hp == 0 {
            self.boss.status = BossStatus::Defeated;
            // remaining reserve goes to loot pool
            self.boss.loot_pool += self.boss.reserve_balance;
            self.boss.reserve_balance = 0;
            msg!("BOSS DEFEATED! Loot pool: {} lamports", self.boss.loot_pool);
        }

        msg!(
            "Attack resolved: {} (roll={}) | damage: {} | HP: {}/{}",
            hit_type, roll, actual_damage, self.boss.current_hp, self.boss.max_hp,
        );

        Ok(())
    }
}
