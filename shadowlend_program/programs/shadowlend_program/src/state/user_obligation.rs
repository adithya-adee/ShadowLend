use anchor_lang::prelude::*;

/// User Obligation account - stores user's encrypted position state
/// Seeds: ["obligation", user.key(), pool.key()]
///
/// This account contains the encrypted blob that only Arcium MXE can decrypt.
/// Individual balances are hidden - only pool aggregates are public.
#[account]
#[derive(InitSpace)]
pub struct UserObligation {
    /// The user who owns this obligation
    pub user: Pubkey,
    /// The pool this obligation belongs to
    pub pool: Pubkey,

    // === Encrypted State (only MXE can decrypt) ===
    /// Encrypted user state blob containing deposit/borrow amounts
    /// Max size: 128 bytes for Enc<UserState>
    #[max_len(128)]
    pub encrypted_state_blob: Vec<u8>,
    /// SHA-256 commitment of the encrypted blob for verification
    pub state_commitment: [u8; 32],

    // === Replay Protection ===
    /// Nonce that increments on every state update (prevents replay attacks)
    pub state_nonce: u64,
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
