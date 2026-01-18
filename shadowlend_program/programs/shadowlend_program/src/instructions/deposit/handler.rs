use anchor_lang::prelude::*;
use anchor_spl::token::{self}; // Added token module for transfer
use arcium_anchor::prelude::*;

use super::accounts::Deposit;
use super::callback::ComputeConfidentialDepositCallback;
use crate::error::ErrorCode;

/// Handles deposit instruction by performing SPL transfer and queuing MXE computation.
///
/// # Flow
/// 1. Validate amount > 0
/// 2. Initialize user obligation if first deposit
/// 3. Transfer tokens from user to collateral vault
/// 4. Queue confidential computation to update encrypted balances
///
/// # Arguments
/// * `computation_offset` - Unique offset for this computation
/// * `amount` - Plaintext deposit amount (visible in SPL transfer)
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    amount: u64,                // Plaintext amount for Atomic Deposit
) -> Result<()> {
    require!(
        amount > 0,
        ErrorCode::InvalidDepositAmount
    );

    // Initialize user obligation on first deposit
    let user_obligation = &mut ctx.accounts.user_obligation;
    if user_obligation.user == Pubkey::default() {
        user_obligation.user = ctx.accounts.payer.key();
        user_obligation.pool = ctx.accounts.pool.key();
        user_obligation.state_nonce = 0;
        user_obligation.last_update_ts = Clock::get()?.unix_timestamp;
        user_obligation.bump = ctx.bumps.user_obligation;
        msg!("Initialized new user obligation");
    }

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Transfer tokens from user to collateral vault (public SPL transfer)
    let transfer_accounts = token::Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
        amount,
    )?;

    // Load encrypted user state (zero if first deposit)
    let encrypted_user_state: [u8; 64] = if user_obligation.encrypted_state_blob.is_empty() {
        [0u8; 64]
    } else {
        let mut state_arr = [0u8; 64];
        let len = user_obligation.encrypted_state_blob.len().min(64);
        state_arr[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);
        state_arr
    };

    // Load encrypted pool state
    let pool = &ctx.accounts.pool;
    let encrypted_pool_state: [u8; 64] = if pool.encrypted_pool_state.is_empty() {
         [0u8; 64]
    } else {
         let mut state_arr = [0u8; 64];
        let len = pool.encrypted_pool_state.len().min(64);
        state_arr[..len].copy_from_slice(&pool.encrypted_pool_state[..len]);
        state_arr
    };

    // Build computation arguments
    let args = ArgBuilder::new()
        .plaintext_u64(amount) 
        .encrypted_u128(encrypted_user_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_user_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[32..64].try_into().unwrap())
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![ComputeConfidentialDepositCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    msg!("Queued deposit computation to Arcium MXE");

    emit!(DepositQueued {
        user: ctx.accounts.payer.key(),
        pool: ctx.accounts.pool.key(),
        computation_offset,
    });

    Ok(())
}

#[event]
pub struct DepositQueued {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub computation_offset: u64,
}
