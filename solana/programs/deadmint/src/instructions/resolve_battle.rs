use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;
use crate::error::ErrorCode;
use crate::state::{Battle, BattleStatus, Fighter};

// =============================================================
//  TX 1 — COMMIT: close betting + record Switchboard randomness
// =============================================================
//  Client bundles: [ Switchboard commitIx, commit_battle IX ]

#[derive(Accounts)]
pub struct CommitBattle<'info> {
    #[account(
        mut,
        constraint = battle.status == BattleStatus::BettingOpen @ ErrorCode::BettingClosed,
    )]
    pub battle: Account<'info, Battle>,

    /// CHECK: Switchboard On-Demand randomness account.
    /// Validated manually via RandomnessAccountData::parse.
    pub randomness_account_data: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

impl<'info> CommitBattle<'info> {
    pub fn handle(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // --- parse & validate Switchboard randomness ---
        let randomness_data = RandomnessAccountData::parse(
            self.randomness_account_data.data.borrow()
        ).map_err(|_| ErrorCode::InvalidRandomnessAccount)?;

        // Must be committed in the immediately previous slot (fresh)
        require!(
            randomness_data.seed_slot == clock.slot - 1,
            ErrorCode::RandomnessExpired
        );

        // Must NOT be revealed yet
        require!(
            randomness_data.get_value(clock.slot).is_err(),
            ErrorCode::RandomnessAlreadyRevealed
        );

        // --- close betting & record commit ---
        self.battle.status = BattleStatus::Committed;
        self.battle.randomness_account = self.randomness_account_data.key();
        self.battle.commit_slot = randomness_data.seed_slot;

        msg!(
            "Battle committed: Round {} Match {} | Bets closed, awaiting reveal",
            self.battle.round,
            self.battle.match_index,
        );

        Ok(())
    }
}

// =============================================================
//  TX 2 — RESOLVE: reveal randomness + run combat simulation
// =============================================================
//  Client bundles: [ Switchboard revealIx, resolve_battle IX ]

#[derive(Accounts)]
pub struct ResolveBattle<'info> {
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

    /// CHECK: Switchboard On-Demand randomness account — must match battle.randomness_account
    pub randomness_account_data: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

impl<'info> ResolveBattle<'info> {
    pub fn handle(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // --- validate randomness account matches commit ---
        require!(
            self.randomness_account_data.key() == self.battle.randomness_account,
            ErrorCode::RandomnessMismatch
        );

        // --- parse & reveal Switchboard randomness ---
        let randomness_data = RandomnessAccountData::parse(
            self.randomness_account_data.data.borrow()
        ).map_err(|_| ErrorCode::InvalidRandomnessAccount)?;

        require!(
            randomness_data.seed_slot == self.battle.commit_slot,
            ErrorCode::RandomnessExpired
        );

        let revealed_value = randomness_data
            .get_value(clock.slot)
            .map_err(|_| ErrorCode::RandomnessNotResolved)?;

        // --- combat simulation ---
        let winner_key = self.simulate_combat(&revealed_value)?;

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
    /// Uses the 32 random bytes from Switchboard VRF.
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
            // tiebreaker: higher luck wins
            if a.luck >= b.luck {
                self.battle.fighter_a
            } else {
                self.battle.fighter_b
            }
        };

        Ok(winner)
    }
}
