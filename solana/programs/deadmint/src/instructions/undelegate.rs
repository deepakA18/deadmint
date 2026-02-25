use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

/// Commits state and undelegates a single PDA from the Ephemeral Rollup.
/// Called by the backend when a game ends to return account ownership to the program.

#[commit]
#[derive(Accounts)]
pub struct UndelegateInput<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PDA to undelegate (Game or Player account)
    #[account(mut)]
    pub pda: AccountInfo<'info>,
}

pub fn handler(ctx: Context<UndelegateInput>) -> Result<()> {
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.pda],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
