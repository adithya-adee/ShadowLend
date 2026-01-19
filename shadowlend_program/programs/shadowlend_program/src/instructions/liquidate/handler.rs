use anchor_lang::prelude::*;
use anchor_spl::token::{self};
use arcium_anchor::prelude::*;

use super::accounts::Liquidate;
use super::callback::ComputeConfidentialLiquidateCallback;
use crate::constants::{get_price_from_pyth_account, SOL_USD_FEED_ID, USDC_USD_FEED_ID};
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

/// Handles liquidation by queuing MXE computation to verify undercollateralization.
///
/// MXE privately verifies the target position has HF < 1.0 before allowing liquidation.
/// On success, liquidator repays debt and receives collateral + bonus.
///
/// # Flow
/// 1. Validate repay amount > 0
/// 2. Verify target user has existing position
/// 3. Queue confidential computation with liquidation parameters
/// 4. MXE verifies HF < 1.0 and calculates seized collateral
///
/// # Arguments
/// * `computation_offset` - Unique offset for this MXE computation
/// * `repay_amount` - Amount of borrow token to repay (plaintext)
/// * `target_user_pubkey` - Target user's x25519 public key for encrypting output
/// * `user_nonce` - Encryption nonce for user state (Enc<Shared, UserState>)
/// * `mxe_nonce` - Encryption nonce for pool state (Enc<Mxe, PoolState>)
pub fn liquidate_handler(
    ctx: Context<Liquidate>,
    computation_offset: u64,
    repay_amount: u64,
    target_user_pubkey: [u8; 32],
    user_nonce: u128,
    mxe_nonce: u128,
) -> Result<()> {
    // Validate repay amount
    require!(repay_amount > 0, ErrorCode::InvalidBorrowAmount);

    // User being liquidated must have existing state
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        user_obligation.user_state_initialized,
        ErrorCode::InvalidBorrowAmount
    );

    // Optimistic Repayment: Transfer from liquidator to borrow vault
    // If liquidation fails, this will be refunded in the callback
    msg!("Transferring repayment amount to borrow vault (optimistic)...");
    let transfer_accounts = token::Transfer {
        from: ctx.accounts.liquidator_borrow_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        ),
        repay_amount,
    )?;

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Get pool parameters for liquidation calculation
    let pool = &ctx.accounts.pool;
    let liquidation_threshold = pool.liquidation_threshold;
    let liquidation_bonus = pool.liquidation_bonus;

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
    let mut args = ArgBuilder::new()
        .plaintext_u64(repay_amount)
        .x25519_pubkey(target_user_pubkey)
        .plaintext_u128(user_nonce);

    // User state - always initialized for liquidate (checked above)
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
        .plaintext_u64(liquidation_threshold as u64)
        .plaintext_u64(liquidation_bonus as u64)
        .build();

    // Queue computation with callback instruction
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server
        vec![ComputeConfidentialLiquidateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1, // Number of callback transactions
        0, // Priority fee
    )?;

    msg!("Queued liquidation computation to Arcium MXE");
    msg!("Target user: {}", user_obligation.user);
    msg!("Repay amount: {}", repay_amount);

    // Emit event for indexer tracking
    emit!(LiquidationQueued {
        liquidator: ctx.accounts.payer.key(),
        target_user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        repay_amount,
        computation_offset,
    });

    Ok(())
}

/// Event emitted when liquidation computation is queued
#[event]
pub struct LiquidationQueued {
    pub liquidator: Pubkey,
    pub target_user: Pubkey,
    pub pool: Pubkey,
    pub repay_amount: u64,
    pub computation_offset: u64,
}
