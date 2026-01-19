use anchor_lang::prelude::*;
use anchor_spl::token::{self};
use arcium_anchor::prelude::*;

use super::accounts::Repay;
use super::callback::ComputeConfidentialRepayCallback;
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

/// Handles repayment by transferring tokens and queuing MXE state update.
///
/// Repayment priority: interest is paid first, then principal.
/// The amount is visible (SPL transfer) but the resulting balances remain encrypted.
///
/// # Flow
/// 1. Validate repay amount > 0
/// 2. Transfer tokens from user to borrow vault
/// 3. Queue confidential computation to update encrypted balances
/// 4. MXE applies payment to interest first, then principal
///
/// # Arguments
/// * `computation_offset` - Unique offset for this MXE computation
/// * `amount` - Plaintext repayment amount (visible in SPL transfer)
/// * `user_pubkey` - User's x25519 public key for encrypting output
/// * `user_nonce` - Encryption nonce for user state (Enc<Shared, UserState>)
/// * `mxe_nonce` - Encryption nonce for pool state (Enc<Mxe, PoolState>)
pub fn repay_handler(
    ctx: Context<Repay>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
    mxe_nonce: u128,
) -> Result<()> {
    // Validate repay amount
    require!(amount > 0, ErrorCode::InvalidBorrowAmount);

    // User must have existing state with borrow
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        user_obligation.user_state_initialized,
        ErrorCode::InvalidBorrowAmount
    );

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // 1. Perform Public SPL Transfer (Atomic Repay)
    let transfer_accounts = token::Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        ),
        amount,
    )?;

    let pool = &ctx.accounts.pool;

    // Build arguments for Arcium MXE computation
    let mut args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce);

    // User state - always initialized for repay (checked above)
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

    let args = args.build();

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
