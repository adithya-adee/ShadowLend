use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Borrow;
use super::callback::ComputeConfidentialBorrowCallback;
use crate::constants::{SOL_PRICE_CENTS, USDC_PRICE_CENTS};
use crate::error::ErrorCode;

/// Handles borrow instruction by queuing MXE computation for health factor verification.
///
/// # Flow
/// 1. Validate encrypted amount is non-zero
/// 2. Verify user has existing collateral (encrypted state exists)
/// 3. Queue confidential computation with encrypted borrow amount
/// 4. MXE verifies HF >= 1.0 and returns approval + revealed amount
///
/// # Arguments
/// * `encrypted_amount` - User-encrypted borrow amount (Enc<Shared, u64>)
/// * `pub_key` - User's x25519 public key for decryption
/// * `nonce` - Encryption nonce for the encrypted amount
pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    encrypted_amount: [u8; 32],
    pub_key: [u8; 32],
    nonce: u128,
) -> Result<()> {
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidBorrowAmount
    );

    // User must have existing state (deposited collateral)
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidBorrowAmount
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Read pool state (MXE only)
    let pool = &ctx.accounts.pool;
    let encrypted_pool_state: [u8; 64] = if pool.encrypted_pool_state.is_empty() {
         [0u8; 64]
    } else {
         let mut state_arr = [0u8; 64];
        let len = pool.encrypted_pool_state.len().min(64);
        state_arr[..len].copy_from_slice(&pool.encrypted_pool_state[..len]);
        state_arr
    };

    // Get pool LTV for health factor calculation
    let ltv_bps = ctx.accounts.pool.ltv;

    // Build arguments for Arcium computation
    // TODO: Add oracle pricing (either confidential / on chain)
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[32..64].try_into().unwrap())
        .plaintext_u64(SOL_PRICE_CENTS)
        .plaintext_u64(USDC_PRICE_CENTS)
        .plaintext_u16(ltv_bps)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![ComputeConfidentialBorrowCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    msg!("Queued borrow computation to Arcium MXE");

    emit!(BorrowQueued {
        user: ctx.accounts.payer.key(),
        pool: ctx.accounts.pool.key(),
        computation_offset,
    });

    Ok(())
}

#[event]
pub struct BorrowQueued {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub computation_offset: u64,
}
