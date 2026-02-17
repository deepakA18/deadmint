use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;
use crate::error::ErrorCode;
use crate::state::{Battle, BattleStatus, Fighter};

// =============================================================
//  STEP 1 — COMMIT: close betting + request MagicBlock VRF
// =============================================================
//  Client calls: commit_battle
//  MagicBlock oracle resolves randomness (~1-3s)
//  MagicBlock VRF program calls back: callback_resolve_battle

#[vrf]
#[derive(Accounts)]
pub struct CommitBattle<'info> {
    #[account(
        mut,
        constraint = battle.status == BattleStatus::BettingOpen @ ErrorCode::BettingClosed,
    )]
    pub battle: Account<'info, Battle>,

    pub fighter_a: Account<'info, Fighter>,
    pub fighter_b: Account<'info, Fighter>,

    /// CHECK: MagicBlock oracle queue
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

impl<'info> CommitBattle<'info> {
    pub fn handle(&mut self) -> Result<()> {
        // --- close betting ---
        self.battle.status = BattleStatus::Committed;
        self.battle.commit_slot = Clock::get()?.slot;

        // --- request VRF from MagicBlock ---
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: self.payer.key(),
            oracle_queue: self.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::CallbackResolveBattle::DISCRIMINATOR
                .to_vec(),
            caller_seed: self.battle.key().to_bytes(),
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: self.battle.key(),
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: self.fighter_a.key(),
                    is_signer: false,
                    is_writable: false,
                },
                SerializableAccountMeta {
                    pubkey: self.fighter_b.key(),
                    is_signer: false,
                    is_writable: false,
                },
            ]),
            ..Default::default()
        });
        self.invoke_signed_vrf(&self.payer.to_account_info(), &ix)?;

        msg!(
            "Battle committed: Round {} Match {} | VRF requested, bets closed",
            self.battle.round,
            self.battle.match_index,
        );

        Ok(())
    }
}

// =============================================================
//  STEP 2 — CALLBACK: MagicBlock VRF delivers randomness
// =============================================================
//  Called automatically by MagicBlock VRF program, NOT by client

#[derive(Accounts)]
pub struct CallbackResolveBattle<'info> {
    /// MagicBlock VRF program identity — proves this is a legit callback
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(
        mut,
        constraint = battle.status == BattleStatus::Committed @ ErrorCode::BattleNotResolvable,
    )]
    pub battle: Account<'info, Battle>,

    #[account(
        constraint = fighter_a.key() == battle.fighter_a @ ErrorCode::FighterMismatch,
    )]
    pub fighter_a: Account<'info, Fighter>,

    #[account(
        constraint = fighter_b.key() == battle.fighter_b @ ErrorCode::FighterMismatch,
    )]
    pub fighter_b: Account<'info, Fighter>,
}

impl<'info> CallbackResolveBattle<'info> {
    pub fn handle(&mut self, randomness: [u8; 32]) -> Result<()> {
        // --- combat simulation ---
        let winner_key = self.simulate_combat(&randomness)?;

        // --- finalize ---
        self.battle.winner = Some(winner_key);
        self.battle.status = BattleStatus::Resolved;

        msg!(
            "Battle resolved: Round {} Match {} | Winner: {}",
            self.battle.round,
            self.battle.match_index,
            winner_key,
        );

        Ok(())
    }

    /// Stat-weighted combat: 10 exchanges, HP pool, crits from LUCK.
    /// Uses 32 VRF random bytes from MagicBlock.
    fn simulate_combat(&self, random_value: &[u8; 32]) -> Result<Pubkey> {
        let a = &self.fighter_a;
        let b = &self.fighter_b;

        let mut hp_a: i16 = a.hp as i16 * 10;
        let mut hp_b: i16 = b.hp as i16 * 10;

        for i in 0..10u8 {
            if hp_a <= 0 || hp_b <= 0 {
                break;
            }

            let r0 = random_value[(i as usize * 3) % 32] as u16;
            let r1 = random_value[(i as usize * 3 + 1) % 32] as u16;
            let crit = random_value[(i as usize * 3 + 2) % 32] as u16;

            // --- Fighter A attacks ---
            let mut dmg_a = (a.atk as u16 * r0) / 255;
            if crit % 100 < a.luck as u16 {
                dmg_a = dmg_a * 3 / 2; // 1.5x crit
            }
            let reduced_a = dmg_a.saturating_sub(b.def as u16 / 3);
            hp_b -= reduced_a as i16;

            // Speed advantage: if A is faster and B is dead, skip B's turn
            if a.spd > b.spd && hp_b <= 0 {
                break;
            }

            // --- Fighter B attacks ---
            let r_b = random_value[(i as usize * 3 + 16) % 32] as u16;
            let mut dmg_b = (b.atk as u16 * r1) / 255;
            if r_b % 100 < b.luck as u16 {
                dmg_b = dmg_b * 3 / 2;
            }
            let reduced_b = dmg_b.saturating_sub(a.def as u16 / 3);
            hp_a -= reduced_b as i16;
        }

        // --- determine winner ---
        let winner = if hp_a > hp_b {
            self.battle.fighter_a
        } else if hp_b > hp_a {
            self.battle.fighter_b
        } else {
            if a.luck >= b.luck {
                self.battle.fighter_a
            } else {
                self.battle.fighter_b
            }
        };

        Ok(winner)
    }
}
