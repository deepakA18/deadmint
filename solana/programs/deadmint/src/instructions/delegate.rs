use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

/// Delegates a single PDA to the Ephemeral Rollup validator.
/// Called by the backend for the Game PDA and each Player PDA when a game starts.

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    pub payer: Signer<'info>,
    /// CHECK: PDA to be delegated (Game or Player account)
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateInput>, seeds: Vec<Vec<u8>>) -> Result<()> {
    let seed_slices: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
    ctx.accounts.delegate_pda(
        &ctx.accounts.payer,
        &seed_slices,
        DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
            ..Default::default()
        },
    )?;
    Ok(())
}
