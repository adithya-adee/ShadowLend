//! User Obligation Account
//!
//! Stores a user's encrypted lending position for a specific pool.
//! Each user has one obligation per pool they interact with.

use anchor_lang::prelude::*;

/// User's encrypted lending position within a pool.
///
/// # PDA Seeds
/// `["obligation", user, pool]`
///
/// # Privacy Model
/// - User state is encrypted with `Enc<Shared, UserState>` - user can decrypt with private key
/// - Individual balances (deposits, borrows) remain hidden from observers
/// - Only `total_funded` and `total_claimed` are public for SPL transfer verification
#[account]
#[derive(InitSpace)]
pub struct UserObligation {
    /// Owner of this obligation
    pub user: Pubkey,
    /// Pool this obligation belongs to
    pub pool: Pubkey,

    // --- Encrypted State ---
    /// Encrypted user state blob (max 128 bytes)
    #[max_len(128)]
    pub encrypted_state_blob: Vec<u8>,
    /// Keccak256 commitment for encrypted state verification
    pub state_commitment: [u8; 32],

    // --- Public Funding Tracker ---
    /// Cumulative tokens deposited to vault (public, for SPL verification)
    pub total_funded: u64,
    /// Cumulative tokens withdrawn from vault (public, for SPL verification)
    pub total_claimed: u64,

    // --- Withdrawal State ---
    /// Whether user has a pending withdrawal request
    pub has_pending_withdrawal: bool,
    /// Timestamp when withdrawal was requested
    pub withdrawal_request_ts: i64,

    // --- Replay Protection ---
    /// Nonce incremented on every state update
    pub state_nonce: u128,
    /// Unix timestamp of last state update
    pub last_update_ts: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl UserObligation {
    pub const SEED_PREFIX: &'static [u8] = b"obligation";
}

/// Plaintext structure that gets encrypted inside the blob
/// This is what Arcium MXE operates on internally
#[derive(Clone, Copy, Debug, Default)]
pub struct UserState {
    /// User's collateral deposit amount (hidden)
    pub deposit_amount: u128,
    /// User's borrowed amount (hidden)
    pub borrow_amount: u128,
    /// Accrued interest on borrow (hidden)
    pub accrued_interest: u128,
    /// Timestamp of last interest calculation
    pub last_interest_calc_ts: i64,
}
