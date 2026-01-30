use anchor_lang::prelude::*;

/// Global pool configuration
#[account]
pub struct Pool {
    /// Pool administrator
    pub authority: Pubkey,

    /// Collateral token mint
    pub collateral_mint: Pubkey,

    /// Borrow token mint  
    pub borrow_mint: Pubkey,

    /// Loan-to-value ratio in basis points (8000 = 80%)
    pub ltv_bps: u16,

    /// Liquidation threshold in basis points (8500 = 85%)
    pub liquidation_threshold: u16,

    /// Total deposits in the pool (tracked for utilization)
    pub total_deposits: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl Pool {
    /// Seed prefix for Pool PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"pool_v2";

    pub const SPACE: usize = 8 + 32 + 32 + 32 + 2 * 2 + 8 + 1;
}
