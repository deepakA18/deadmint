use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Boss, BossStatus, ProtocolConfig};

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateBoss<'info> {
    #[account(
        constraint = protocol_config.is_active @ ErrorCode::ProtocolPaused,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = creator,
        seeds = [b"boss", id.to_le_bytes().as_ref()],
        space = Boss::SIZE,
        bump,
    )]
    pub boss: Account<'info, Boss>,

    /// CHECK: PDA vault that holds SOL (reserve + loot)
    #[account(
        mut,
        seeds = [b"boss_vault", boss.key().as_ref()],
        bump,
    )]
    pub boss_vault: SystemAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateBoss<'info> {
    pub fn handle(
        &mut self,
        id: u64,
        name: String,
        max_hp: u64,
        defense: u8,
        base_price: u64,
        slope: u64,
        attack_fee_bps: u16,
        sell_fee_bps: u16,
        bumps: &CreateBossBumps,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= MAX_BOSS_NAME,
            ErrorCode::InvalidBossName
        );
        require!(defense <= MAX_DEFENSE, ErrorCode::DefenseTooHigh);
        require!(base_price > 0, ErrorCode::InvalidBasePrice);
        require!(slope > 0, ErrorCode::InvalidSlope);
        require!(sell_fee_bps <= MAX_SELL_FEE_BPS, ErrorCode::SellFeeTooHigh);

        let boss = &mut self.boss;
        boss.id = id;
        boss.creator = self.creator.key();
        boss.name = name;
        boss.max_hp = max_hp;
        boss.current_hp = max_hp;
        boss.defense = defense;
        boss.status = BossStatus::Alive;
        boss.base_price = base_price;
        boss.slope = slope;
        boss.total_supply = 0;
        boss.reserve_balance = 0;
        boss.loot_pool = 0;
        boss.total_damage = 0;
        boss.attack_fee_bps = attack_fee_bps;
        boss.sell_fee_bps = sell_fee_bps;
        boss.bump = bumps.boss;

        msg!(
            "Boss '{}' created | HP: {} | defense: {} | curve: {}+{}*supply",
            boss.name, boss.max_hp, boss.defense, boss.base_price, boss.slope,
        );

        Ok(())
    }
}
