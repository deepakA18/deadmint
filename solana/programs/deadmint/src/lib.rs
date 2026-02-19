#![allow(unexpected_cfgs)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2cWsikqyKvpRT47qu48ysLAn8YEjyYsp4xzeEGQMowNs");

#[program]
pub mod deadmint {
    use super::*;

    pub fn initialize_protocol_config(
        ctx: Context<InitializeProtocolConfig>,
        treasury: Pubkey,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts.handle(treasury, protocol_fee_bps, &ctx.bumps)
    }

    pub fn create_boss(
        ctx: Context<CreateBoss>,
        id: u64,
        name: String,
        max_hp: u64,
        defense: u8,
        base_price: u64,
        slope: u64,
        attack_fee_bps: u16,
        sell_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts.handle(
            id, name, max_hp, defense,
            base_price, slope,
            attack_fee_bps, sell_fee_bps,
            &ctx.bumps,
        )
    }

    pub fn commit_attack(
        ctx: Context<CommitAttack>,
        sol_amount: u64,
    ) -> Result<()> {
        ctx.accounts.handle(sol_amount, &ctx.bumps)
    }

    /// VRF callback — called by MagicBlock VRF program, NOT by client
    pub fn callback_resolve_attack(
        ctx: Context<CallbackResolveAttack>,
        randomness: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.handle(randomness)
    }

    pub fn sell(
        ctx: Context<Sell>,
        token_amount: u64,
    ) -> Result<()> {
        let vault_bump = ctx.bumps.boss_vault;
        ctx.accounts.handle(token_amount, vault_bump)
    }

    pub fn claim_loot(ctx: Context<ClaimLoot>) -> Result<()> {
        let vault_bump = ctx.bumps.boss_vault;
        ctx.accounts.handle(vault_bump)
    }
}
