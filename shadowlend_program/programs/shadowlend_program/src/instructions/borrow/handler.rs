use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Borrow;
use super::callback::ComputeConfidentialBorrowCallback;
use crate::constants::{get_price_from_pyth_account, SOL_USD_FEED_ID, USDC_USD_FEED_ID};
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

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
/// * `user_nonce` - Encryption nonce for user state (Enc<Shared, UserState>)
/// * `mxe_nonce` - Encryption nonce for pool state (Enc<Mxe, PoolState>)
pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    encrypted_amount: [u8; 32],
    pub_key: [u8; 32],
    user_nonce: u128,
    mxe_nonce: u128,
) -> Result<()> {
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidBorrowAmount
    );

    // User must have existing state (deposited collateral)
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        user_obligation.user_state_initialized,
        ErrorCode::InvalidBorrowAmount
    );

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Get pool parameters
    let pool = &ctx.accounts.pool;
    let ltv_bps = pool.ltv;

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

    // Build arguments for Arcium computation
    let mut args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(user_nonce)
        .encrypted_u128(encrypted_amount);

    // User state - always initialized for borrow (checked above)
    // Pass by reference using account(key, offset, length)
    args = args.account(
        user_obligation.key(),
        UserObligation::ENCRYPTED_STATE_OFFSET as u32,
        UserObligation::ENCRYPTED_STATE_SIZE as u32,
    );

    // Enc<Mxe, PoolState> - MXE-only encryption with mxe_nonce
    args = args.plaintext_u128(mxe_nonce);

    // Pool state - check if initialized
    args = if pool.pool_state_initialized {
        args.account(
            pool.key(),
            Pool::ENCRYPTED_STATE_OFFSET as u32,
            Pool::ENCRYPTED_STATE_SIZE as u32,
        )
    } else {
        args.encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
    };

    let args = args
        .plaintext_u64(sol_price_cents)
        .plaintext_u64(usdc_price_cents)
        .plaintext_u64(ltv_bps as u64)
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
