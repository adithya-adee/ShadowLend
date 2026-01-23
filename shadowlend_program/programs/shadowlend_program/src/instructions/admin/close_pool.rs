use crate::state::Pool;
use anchor_lang::prelude::*;

/// Close pool account (admin only)
#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [Pool::SEED_PREFIX],
        bump = pool.bump,
        has_one = authority
    )]
    pub pool: Account<'info, Pool>,

    pub system_program: Program<'info, System>,
}

pub fn close_pool_handler(ctx: Context<ClosePool>) -> Result<()> {
    msg!("Pool closed by authority: {}", ctx.accounts.authority.key());
    Ok(())
}
