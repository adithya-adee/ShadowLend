use anchor_lang::prelude::*;

/// User Obligation account - stores user's encrypted position state
/// Seeds: ["obligation", user.key(), pool.key()]
///
/// This account contains the encrypted blob that only Arcium MXE can decrypt.
/// Individual balances are hidden - only pool aggregates are public.
///
/// CONFIDENTIAL DESIGN:
/// - User can decrypt their own state with their private key (Enc<Shared, UserState>)
/// - Funding tracker enables two-phase deposit (fund visible, credit hidden)
/// - Pending withdrawal flag for claim-based withdrawal flow
#[account]
#[derive(InitSpace)]
pub struct UserObligation {
    /// The user who owns this obligation
    pub user: Pubkey,
    /// The pool this obligation belongs to
    pub pool: Pubkey,

    // === Encrypted State (user can decrypt with private key) ===
    /// Encrypted user state blob containing deposit/borrow amounts
    /// Max size: 128 bytes for Enc<Shared, UserState>
    #[max_len(128)]
    pub encrypted_state_blob: Vec<u8>,
    /// SHA-256 commitment of the encrypted blob for verification
    pub state_commitment: [u8; 32],

    // === Funding Tracker (Two-Phase Deposit Model) ===
    /// Total tokens user has deposited to vault (cumulative, public)
    /// This is visible - used to verify user has funded before crediting
    pub total_funded: u64,
    
    /// Total tokens user has claimed from vault (cumulative, public)
    /// Used to track withdrawals that have been fulfilled
    pub total_claimed: u64,

    // === Pending Withdrawal State ===
    /// Whether user has a pending withdrawal request
    pub has_pending_withdrawal: bool,
    /// Timestamp when withdrawal was requested (for timelock if needed)
    pub withdrawal_request_ts: i64,

    // === Replay Protection ===
    /// Nonce that increments on every state update (u128 for future protection)
    pub state_nonce: u128,
    /// Last time this obligation was updated
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
