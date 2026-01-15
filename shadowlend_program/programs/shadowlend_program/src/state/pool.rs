//! Pool Account
//!
//! Stores lending pool configuration and encrypted aggregate state.
//! Each unique (collateral_mint, borrow_mint) pair has its own pool.

use anchor_lang::prelude::*;

/// Lending pool account storing configuration and encrypted aggregates.
///
/// # PDA Seeds
/// `["pool", collateral_mint, borrow_mint]`
///
/// # Privacy Model
/// - Pool aggregates (`total_deposits`, `total_borrows`) are encrypted with `Enc<Mxe, PoolState>`
/// - Only MXE can decrypt totals, preventing TVL tracking attacks
/// - Risk parameters (LTV, liquidation threshold) remain public for transparency
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Protocol admin who can update pool parameters
    pub authority: Pubkey,
    /// Collateral token mint (e.g., Wrapped SOL)
    pub collateral_mint: Pubkey,
    /// Borrow token mint (e.g., USDC)
    pub borrow_mint: Pubkey,

    // --- Encrypted Aggregates ---
    /// Encrypted pool state containing totals (max 128 bytes)
    #[max_len(128)]
    pub encrypted_pool_state: Vec<u8>,
    /// Keccak256 commitment for encrypted state verification
    pub pool_state_commitment: [u8; 32],

    // --- Risk Parameters (Public) ---
    /// Loan-to-Value ratio in basis points (80% = 8000)
    pub ltv: u16,
    /// Liquidation threshold in basis points (85% = 8500)
    pub liquidation_threshold: u16,
    /// Liquidation bonus for liquidators in basis points (5% = 500)
    pub liquidation_bonus: u16,
    /// Fixed borrow rate in basis points per year (5% APY = 500)
    pub fixed_borrow_rate: u64,

    // --- Vault Tracking ---
    /// Nonce for tracking vault operations
    pub vault_nonce: u128,

    // --- Metadata ---
    /// Unix timestamp of last pool update
    pub last_update_ts: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl Pool {
    pub const SEED_PREFIX: &'static [u8] = b"pool";
}

/// Plaintext structure that gets encrypted inside encrypted_pool_state
/// This is what Arcium MXE operates on internally
#[derive(Clone, Copy, Debug, Default)]
pub struct PoolState {
    /// Total collateral deposited across all users (hidden)
    pub total_deposits: u128,
    /// Total amount borrowed across all users (hidden)
    pub total_borrows: u128,
    /// Aggregate interest accumulated (hidden)
    pub accumulated_interest: u128,
    /// Available liquidity in borrow vault (hidden)
    pub available_borrow_liquidity: u128,
}
