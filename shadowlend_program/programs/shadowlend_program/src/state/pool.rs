use anchor_lang::prelude::*;

/// Pool account - stores lending pool configuration and public aggregates
/// Seeds: ["pool", collateral_mint.key()]
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Protocol admin who can update pool parameters
    pub authority: Pubkey,
    /// Collateral token mint (e.g., Wrapped SOL)
    pub collateral_mint: Pubkey,
    /// Borrow token mint (e.g., USDC)
    pub borrow_mint: Pubkey,

    // === Public Aggregates (visible on-chain) ===
    /// Total collateral deposited across all users
    pub total_deposits: u128,
    /// Total amount borrowed across all users
    pub total_borrows: u128,
    /// Aggregate interest accumulated
    pub accumulated_interest: u128,

    // === Risk Parameters ===
    /// Loan-to-Value ratio (80% = 8000)
    pub ltv: u16,
    /// Liquidation threshold (85% = 8500)
    pub liquidation_threshold: u16,
    /// Liquidation bonus for liquidators (5% = 500)
    pub liquidation_bonus: u16,
    /// Fixed borrow rate in basis points (5% APY = 500)
    pub fixed_borrow_rate: u64,

    // === Metadata ===
    /// Last time pool was updated
    pub last_update_ts: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl Pool {
    pub const SEED_PREFIX: &'static [u8] = b"pool";
}
