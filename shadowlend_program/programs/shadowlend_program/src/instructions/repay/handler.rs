use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Repay;
use super::callback::ComputeConfidentialRepayCallback;
use crate::error::ErrorCode;

/// Queue repay computation to Arcium MXE
/// Token transfer happens in callback after verification
///
/// Flow:
/// 1. User encrypts repay amount client-side
/// 2. Handler queues computation
/// 3. MXE computes new borrow balance privately
/// 4. Callback transfers tokens from user to vault
pub fn repay_handler(
    ctx: Context<Repay>,
    computation_offset: u64,
    encrypted_amount: [u8; 32], // Enc<Shared, u128>
    pub_key: [u8; 32],          // User's x25519 public key
    nonce: u128,                // Encryption nonce
) -> Result<()> {
    // Validate encrypted amount is not zero bytes
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidBorrowAmount
    );

    // User must have existing state with borrow
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidBorrowAmount
    );

    // Set signer PDA bump for Arcium computation
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation (prevent state injection attack)
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Build arguments for Arcium MXE computation
    // Order: pub_key, nonce, amount, state[0..32], state[32..64]
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .build();

    // Queue computation with callback instruction
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server
        vec![ComputeConfidentialRepayCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1, // Number of callback transactions
        0, // Priority fee
    )?;

    msg!("Queued repay computation to Arcium MXE");

    // Emit event for indexer tracking
    emit!(RepayQueued {
        user: ctx.accounts.payer.key(),
        pool: ctx.accounts.pool.key(),
        computation_offset,
    });

    Ok(())
}

/// Event emitted when repay computation is queued
#[event]
pub struct RepayQueued {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub computation_offset: u64,
}
