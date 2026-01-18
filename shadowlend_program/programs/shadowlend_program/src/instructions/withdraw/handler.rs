use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Withdraw;
use super::callback::ComputeConfidentialWithdrawCallback;
use crate::constants::{get_price_from_pyth_account, SOL_USD_FEED_ID, USDC_USD_FEED_ID};
use crate::error::ErrorCode;

/// Handles withdrawal by queuing MXE computation for health factor verification.
///
/// The user's encrypted withdrawal amount is verified privately by MXE to ensure
/// the position remains healthy after withdrawal.
///
/// # Flow
/// 1. Validate encrypted amount is non-zero
/// 2. Verify user has existing collateral
/// 3. Queue confidential computation with encrypted amount
/// 4. MXE verifies HF remains safe and returns revealed amount
///
/// # Arguments
/// * `computation_offset` - Unique offset for this MXE computation
/// * `encrypted_amount` - User-encrypted withdrawal amount (Enc<Shared, u64>)
/// * `pub_key` - User's x25519 public key for decryption
/// * `nonce` - Encryption nonce for the encrypted amount
pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    computation_offset: u64,
    encrypted_amount: [u8; 32],
    pub_key: [u8; 32],
    nonce: u128,
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

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation (prevent state injection attack)
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Get pool LTV for health factor calculation
    let ltv_bps = ctx.accounts.pool.ltv;

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

    // Read real-time prices from Pyth oracles
    let clock = Clock::get()?;
    let sol_price_cents = get_price_from_pyth_account(
        &ctx.accounts.sol_price_update.to_account_info(),
        &SOL_USD_FEED_ID,
        &clock,
    )?;
    let usdc_price_cents = get_price_from_pyth_account(
        &ctx.accounts.usdc_price_update.to_account_info(),
        &USDC_USD_FEED_ID,
        &clock,
    )?;

    // Build arguments for Arcium MXE computation
    // Order: pub_key, nonce, amount, state[0..32], state[32..64], pool_state[0..32], pool_state[32..64], prices, ltv
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[32..64].try_into().unwrap())
        .plaintext_u64(sol_price_cents)
        .plaintext_u64(usdc_price_cents)
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
