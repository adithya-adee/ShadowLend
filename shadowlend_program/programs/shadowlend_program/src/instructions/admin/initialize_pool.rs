use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Initialize lending pool
#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 2 + 2 + 8 + 8 + 1,
        seeds = [Pool::SEED_PREFIX],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub collateral_mint: Account<'info, Mint>,
    pub borrow_mint: Account<'info, Mint>,

    /// Collateral vault token account
    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = collateral_vault,
        seeds = [b"collateral_vault", pool.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Borrow vault token account
    #[account(
        init,
        payer = authority,
        token::mint = borrow_mint,
        token::authority = borrow_vault,
        seeds = [b"borrow_vault", pool.key().as_ref()],
        bump
    )]
    pub borrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_pool_handler(
    ctx: Context<InitializePool>,
    ltv_bps: u16,
    liquidation_threshold: u16,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    pool.authority = ctx.accounts.authority.key();
    pool.collateral_mint = ctx.accounts.collateral_mint.key();
    pool.borrow_mint = ctx.accounts.borrow_mint.key();
    pool.ltv_bps = ltv_bps;
    pool.liquidation_threshold = liquidation_threshold;
    pool.bump = ctx.bumps.pool;

    msg!(
        "Pool initialized with LTV: {}bps, Liquidation: {}bps",
        ltv_bps,
        liquidation_threshold
    );
    msg!("Collateral vault: {}", ctx.accounts.collateral_vault.key());
    msg!("Borrow vault: {}", ctx.accounts.borrow_vault.key());

    Ok(())
}
