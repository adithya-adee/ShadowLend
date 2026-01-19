use anchor_lang::prelude::*;
use anchor_spl::token::{self}; // Added token module for transfer
use arcium_anchor::prelude::*;

use super::accounts::Deposit;
use super::callback::ComputeConfidentialDepositCallback;
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

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
/// * `user_pubkey` - User's x25519 public key for encrypting output
/// * `user_nonce` - Unique nonce for user state encryption (Enc<Shared, UserState>)
/// * `mxe_nonce` - Unique nonce for pool state encryption (Enc<Mxe, PoolState>)
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    amount: u64,           // Plaintext amount for Atomic Deposit
    user_pubkey: [u8; 32], // User's x25519 public key
    user_nonce: u128,      // Encryption nonce for user state
    mxe_nonce: u128,       // Encryption nonce for pool state (MXE)
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidDepositAmount);

    // Initialize user obligation on first deposit
    let user_obligation = &mut ctx.accounts.user_obligation;
    if user_obligation.user == Pubkey::default() {
        user_obligation.user = ctx.accounts.payer.key();
        user_obligation.pool = ctx.accounts.pool.key();
        user_obligation.state_nonce = 0;
        user_obligation.user_state_initialized = false;
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
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        ),
        amount,
    )?;

    let pool = &ctx.accounts.pool;

    // Build computation arguments
    // Start with plaintext amount
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // Enc<Shared, UserState> - needs user pubkey for output encryption
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce);

    // If user state exists, pass encrypted ciphertexts; otherwise pass plaintext zeros
    // If user state exists, pass by reference using account(key, offset, length)
    args = if user_obligation.user_state_initialized {
        args.account(
            user_obligation.key(),
            UserObligation::ENCRYPTED_STATE_OFFSET as u32,
            UserObligation::ENCRYPTED_STATE_SIZE as u32,
        )
    } else {
        // First deposit: pass encrypted zero placeholders (32 bytes each)
        args.encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
    };

    // Enc<Mxe, PoolState> - MXE-only encryption with mxe_nonce
    args = args.plaintext_u128(mxe_nonce);

    // If pool state exists, pass by reference; otherwise pass encrypted zero placeholders
    args = if pool.pool_state_initialized {
        args.account(
            pool.key(),
            Pool::ENCRYPTED_STATE_OFFSET as u32,
            Pool::ENCRYPTED_STATE_SIZE as u32,
        )
    } else {
        // First deposit to pool: pass encrypted zero placeholders (32 bytes each)
        args.encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
    };

    let args = args.build();

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
