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
    /// Encrypted user state (4 x [u8; 32] for 4 fields)
    /// Fields: [deposit_amount, borrow_amount, accrued_interest, last_interest_calc_ts]
    pub encrypted_state_blob: [[u8; 32]; 4],
    /// Keccak256 commitment for encrypted state verification
    pub state_commitment: [u8; 32],
    /// Whether the user state has been initialized (first deposit)
    pub user_state_initialized: bool,

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
    /// Offset of encrypted_state_blob in account data: 8 (disc) + 32 (user) + 32 (pool) = 72
    pub const ENCRYPTED_STATE_OFFSET: u64 = 72;
    /// Size of encrypted_state_blob: 4 * 32 = 128 bytes
    pub const ENCRYPTED_STATE_SIZE: u64 = 128;
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
    pub last_interest_calc_ts: u128,
}
