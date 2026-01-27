use anchor_lang::prelude::*;

/// Per-user position with encrypted balances (Arcium ciphertexts)
#[account]
pub struct UserObligation {
    /// Owner of this position
    pub user: Pubkey,

    /// Associated lending pool
    pub pool: Pubkey,

    /// Encrypted state containing [deposit (32), borrow (32), internal_balance (32)]
    /// Total: 96 bytes of Arcium ciphertexts
    pub encrypted_state: [u8; 96],

    /// Initialization flag to avoid separate boolean checks
    pub is_initialized: bool,

    /// Replay protection nonce (incremented each state update)
    pub state_nonce: u128,

    /// PDA bump seed
    pub bump: u8,
}

impl UserObligation {
    /// Seed prefix for UserObligation PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"obligation";

    pub const SPACE: usize = 8 + 32 + 32 + 96 + 1 + 16 + 1;
}
