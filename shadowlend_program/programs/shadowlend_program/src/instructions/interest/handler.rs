use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::UpdateInterest;
use super::callback::ComputeConfidentialInterestCallback;
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

/// Handles interest accrual by queuing MXE computation.
///
/// Anyone can trigger interest update for any user (permissionless).
/// Interest is calculated based on time elapsed and the pool's fixed borrow rate.
///
/// # Flow
/// 1. Verify user has existing borrow position
/// 2. Queue confidential computation with current timestamp and rate
/// 3. MXE calculates accrued interest privately
/// 4. Callback updates encrypted user state and pool aggregates
///
/// # Arguments
/// * `computation_offset` - Unique offset for this MXE computation
/// * `user_pubkey` - Target user's x25519 public key for encrypting output
/// * `user_nonce` - Encryption nonce for user state (Enc<Shared, UserState>)
/// * `mxe_nonce` - Encryption nonce for pool state (Enc<Mxe, PoolState>)
pub fn update_interest_handler(
    ctx: Context<UpdateInterest>,
    computation_offset: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
    mxe_nonce: u128,
) -> Result<()> {
    // User must have existing state
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        user_obligation.user_state_initialized,
        ErrorCode::InvalidBorrowAmount
    );

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let pool = &ctx.accounts.pool;

    // Get current timestamp and borrow rate
    let current_ts = Clock::get()?.unix_timestamp;
    let borrow_rate_bps = pool.fixed_borrow_rate;

    // Build arguments for Arcium MXE computation
    let mut args = ArgBuilder::new()
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce);

    // User state - always initialized for interest update (checked above)
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
        .plaintext_u128(current_ts as u128)
        .plaintext_u64(borrow_rate_bps)
        .build();

    // Queue computation with callback instruction
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![ComputeConfidentialInterestCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    msg!("Queued interest computation to Arcium MXE");
    msg!("Target user: {}", user_obligation.user);

    emit!(InterestUpdateQueued {
        target_user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        computation_offset,
    });

    Ok(())
}

#[event]
pub struct InterestUpdateQueued {
    pub target_user: Pubkey,
    pub pool: Pubkey,
    pub computation_offset: u64,
}
