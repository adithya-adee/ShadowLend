use anchor_lang::prelude::*;

/// Per-user position with encrypted balances (Arcium ciphertexts)
#[account]
pub struct UserObligation {
    /// Owner of this position
    pub user: Pubkey,

    /// Associated lending pool
    pub pool: Pubkey,

    /// Encrypted collateral amount - Enc<Shared, u128>
    /// This is a 32-byte ciphertext from Arcium MPC
    pub encrypted_deposit: [u8; 32],

    /// Encrypted debt amount - Enc<Shared, u128>
    /// This is a 32-byte ciphertext from Arcium MPC
    pub encrypted_borrow: [u8; 32],

    /// Replay protection nonce (incremented each state update)
    pub state_nonce: u128,

    /// PDA bump seed
    pub bump: u8,
}

impl UserObligation {
    /// Seed prefix for UserObligation PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"obligation";
}
