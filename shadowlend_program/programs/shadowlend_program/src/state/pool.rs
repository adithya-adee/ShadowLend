use anchor_lang::prelude::*;

/// Pool account - stores lending pool configuration and aggregates
/// Seeds: ["pool", collateral_mint.key()]
///
/// CONFIDENTIAL DESIGN:
/// - Pool aggregates are now encrypted with Enc<Mxe, PoolState>
/// - Only MXE can decrypt totals - prevents TVL tracking attacks
/// - Risk parameters remain public for transparency
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Protocol admin who can update pool parameters
    pub authority: Pubkey,
    /// Collateral token mint (e.g., Wrapped SOL)
    pub collateral_mint: Pubkey,
    /// Borrow token mint (e.g., USDC)
    pub borrow_mint: Pubkey,

    // === Encrypted Aggregates (only MXE can decrypt) ===
    /// Encrypted pool state containing totals (Enc<Mxe, PoolState>)
    /// Structure: { total_deposits, total_borrows, accumulated_interest, available_liquidity }
    /// Max size: 128 bytes for encrypted pool state
    #[max_len(128)]
    pub encrypted_pool_state: Vec<u8>,
    
    /// SHA-256 commitment hash for encrypted pool state verification
    pub pool_state_commitment: [u8; 32],

    // === Risk Parameters (remain public for transparency) ===
    /// Loan-to-Value ratio (80% = 8000)
    pub ltv: u16,
    /// Liquidation threshold (85% = 8500)
    pub liquidation_threshold: u16,
    /// Liquidation bonus for liquidators (5% = 500)
    pub liquidation_bonus: u16,
    /// Fixed borrow rate in basis points (5% APY = 500)
    pub fixed_borrow_rate: u64,

    // === Vault Tracking ===
    /// Nonce for tracking vault deposits (u128 for future protection)
    pub vault_nonce: u128,

    // === Metadata ===
    /// Last time pool was updated
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
