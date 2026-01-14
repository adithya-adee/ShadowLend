use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Withdraw;
use super::callback::ComputeConfidentialWithdrawCallback;
use crate::constants::{SOL_PRICE_CENTS, USDC_PRICE_CENTS};
use crate::error::ErrorCode;

/// Queue withdraw computation to Arcium MXE
/// Token transfer happens in callback after verification
///
/// Flow:
/// 1. User encrypts withdrawal amount client-side
/// 2. Handler queues computation with prices and LTV
/// 3. MXE computes health factor privately to verify safety
/// 4. Callback checks approval and transfers tokens from vault to user
pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    computation_offset: u64,
    encrypted_amount: [u8; 32], // Enc<Shared, u128>
    pub_key: [u8; 32],          // User's x25519 public key
    nonce: u128,                // Encryption nonce
) -> Result<()> {
    // Validate encrypted amount is not zero bytes
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidWithdrawAmount
    );

    // User must have existing state (deposited collateral)
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidWithdrawAmount
    );

    // Set signer PDA bump for Arcium computation
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation (prevent state injection attack)
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Get pool LTV for health factor calculation
    let ltv_bps = ctx.accounts.pool.ltv;

    // Build arguments for Arcium MXE computation
    // Order: pub_key, nonce, amount, state[0..32], state[32..64], prices, ltv
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .plaintext_u64(SOL_PRICE_CENTS)
        .plaintext_u64(USDC_PRICE_CENTS)
        .plaintext_u16(ltv_bps)
        .build();

    // Queue computation with callback instruction
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server
        vec![ComputeConfidentialWithdrawCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1, // Number of callback transactions
        0, // Priority fee
    )?;

    msg!("Queued withdraw computation to Arcium MXE");

    // Emit event for indexer tracking
    emit!(WithdrawQueued {
        user: ctx.accounts.payer.key(),
        pool: ctx.accounts.pool.key(),
        computation_offset,
    });

    Ok(())
}

/// Event emitted when withdraw computation is queued
#[event]
pub struct WithdrawQueued {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub computation_offset: u64,
}
