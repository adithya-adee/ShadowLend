use crate::state::Pool;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(mut, address = pool.authority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Pool::SEED_PREFIX],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
}

pub fn update_pool_handler(
    ctx: Context<UpdatePool>,
    ltv_bps: u16,
    liquidation_threshold: u16,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.ltv_bps = ltv_bps;
    pool.liquidation_threshold = liquidation_threshold;
    
    msg!(
        "Pool updated. LTV: {}bps, Threshold: {}bps",
        ltv_bps,
        liquidation_threshold
    );
    Ok(())
}
