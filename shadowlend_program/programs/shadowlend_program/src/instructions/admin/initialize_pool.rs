use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::Pool;

/// Accounts for initializing the lending pool
///
/// This is an admin-only instruction that creates:
/// - Pool PDA with initial configuration
/// - Collateral vault (receives user deposits)
/// - Borrow vault (holds lending liquidity)
#[derive(Accounts)]
#[instruction(ltv: u16, liquidation_threshold: u16, liquidation_bonus: u16, fixed_borrow_rate: u64)]
pub struct InitializePool<'info> {
    /// Protocol authority (admin)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The lending pool to create
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [Pool::SEED_PREFIX, collateral_mint.key().as_ref(), borrow_mint.key().as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Collateral token mint (e.g., Wrapped SOL)
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Borrow token mint (e.g., USDC)
    pub borrow_mint: Box<Account<'info, Mint>>,

    /// Pool's collateral vault (PDA-owned token account)
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", collateral_mint.key().as_ref(), borrow_mint.key().as_ref(), b"collateral"],
        bump,
        token::mint = collateral_mint,
        token::authority = pool,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// Pool's borrow vault (PDA-owned token account)
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", collateral_mint.key().as_ref(), borrow_mint.key().as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Initialize pool handler
///
/// Creates a new lending pool with the specified risk parameters.
/// Only called once per collateral/borrow token pair.
pub fn initialize_pool_handler(
    ctx: Context<InitializePool>,
    ltv: u16,                   // 80% = 8000
    liquidation_threshold: u16, // 85% = 8500
    liquidation_bonus: u16,     // 5% = 500
    fixed_borrow_rate: u64,     // 5% APY = 500
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    pool.authority = ctx.accounts.authority.key();
    pool.collateral_mint = ctx.accounts.collateral_mint.key();
    pool.borrow_mint = ctx.accounts.borrow_mint.key();

    // Initialize encrypted pool state to empty (will be populated by first MXE computation)
    pool.encrypted_pool_state = vec![];
    pool.pool_state_commitment = [0u8; 32];

    // Set risk parameters (remain public for transparency)
    pool.ltv = ltv;
    pool.liquidation_threshold = liquidation_threshold;
    pool.liquidation_bonus = liquidation_bonus;
    pool.fixed_borrow_rate = fixed_borrow_rate;

    // Initialize vault tracking
    pool.vault_nonce = 0;

    // Set metadata
    pool.last_update_ts = Clock::get()?.unix_timestamp;
    pool.bump = ctx.bumps.pool;

    emit!(PoolInitialized {
        pool: pool.key(),
        collateral_mint: pool.collateral_mint,
        borrow_mint: pool.borrow_mint,
        ltv,
        liquidation_threshold,
    });

    Ok(())
}

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub collateral_mint: Pubkey,
    pub borrow_mint: Pubkey,
    pub ltv: u16,
    pub liquidation_threshold: u16,
}
