use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Liquidate;
use super::callback::ComputeConfidentialLiquidateCallback;
use crate::constants::{SOL_PRICE_CENTS, USDC_PRICE_CENTS};
use crate::error::ErrorCode;

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
pub fn liquidate_handler(
    ctx: Context<Liquidate>,
    computation_offset: u64,
    repay_amount: u64,
) -> Result<()> {
    // Validate repay amount
    require!(repay_amount > 0, ErrorCode::InvalidBorrowAmount);

    // User being liquidated must have existing state
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidBorrowAmount
    );

    // Set signer PDA bump for Arcium computation
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Get pool parameters for liquidation calculation
    let pool = &ctx.accounts.pool;
    let liquidation_threshold = pool.liquidation_threshold;
    let liquidation_bonus = pool.liquidation_bonus;

    // Read pool state (MXE only)
    let encrypted_pool_state: [u8; 64] = if pool.encrypted_pool_state.is_empty() {
         [0u8; 64]
    } else {
         let mut state_arr = [0u8; 64];
        let len = pool.encrypted_pool_state.len().min(64);
        state_arr[..len].copy_from_slice(&pool.encrypted_pool_state[..len]);
        state_arr
    };

    // Build arguments for Arcium MXE computation
    // Order: repay_amount, state, prices, liquidation params
    let args = ArgBuilder::new()
        .plaintext_u64(repay_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[32..64].try_into().unwrap())
        .plaintext_u64(SOL_PRICE_CENTS)
        .plaintext_u64(USDC_PRICE_CENTS)
        .plaintext_u16(liquidation_threshold)
        .plaintext_u16(liquidation_bonus)
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
