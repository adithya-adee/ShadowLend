use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Deposit;
use super::callback::ComputeDepositCallback;
use crate::error::ErrorCode;

/// Deposit instruction - queues deposit computation to Arcium MXE
///
/// Flow:
/// 1. User encrypts deposit amount with shared x25519 key
/// 2. Solana program creates/fetches UserObligation PDA
/// 3. Queues computation to Arcium MXE
/// 4. MXE decrypts, updates balance, returns new encrypted state
/// 5. Callback handles token transfer and state update
///
/// Args:
/// - computation_offset: Random u64 for unique computation ID
/// - encrypted_amount: Enc<Shared, u128> - encrypted deposit amount
/// - encrypted_state: Enc<Mxe, UserState> - current encrypted state from on-chain
/// - pub_key: User's x25519 public key for shared secret
/// - nonce: Encryption nonce
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    encrypted_amount: [u8; 32], // Enc<Shared, u128> - deposit amount
    encrypted_state: [u8; 32],  // Enc<Mxe, UserState> - current state ciphertext
    pub_key: [u8; 32],          // User's x25519 public key
    nonce: u128,                // Encryption nonce
) -> Result<()> {
    // Validate deposit amount is provided
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidDepositAmount
    );

    // Store bump for PDA signing
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Build arguments using ArgBuilder (per Arcium docs)
    // Order must match circuit parameters:
    // 1. x25519 pubkey for Enc<Shared> decryption
    // 2. nonce for encryption
    // 3. encrypted_amount (Enc<Shared, u128>)
    // 4. encrypted_state (Enc<Mxe, UserState>)
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state) // UserState fits in u128 for now
        .build();

    // Queue computation with callback
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server (output fits in tx)
        vec![ComputeDepositCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[], // No custom accounts
        )?],
        1, // Number of callback transactions
        0, // Priority fee (cu_price_micro)
    )?;

    Ok(())
}
