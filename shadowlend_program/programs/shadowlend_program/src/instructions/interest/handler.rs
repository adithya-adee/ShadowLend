use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::UpdateInterest;
use super::callback::ComputeConfidentialInterestCallback;
use crate::error::ErrorCode;

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
/// * `nonce` - Encryption nonce
pub fn update_interest_handler(
    ctx: Context<UpdateInterest>,
    computation_offset: u64,
    user_pubkey: [u8; 32],
    nonce: u128,
) -> Result<()> {
    // User must have existing state
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidBorrowAmount
    );

    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation
    // UserState has 4 u128 fields = 4 * 32 = 128 bytes
    let mut encrypted_state = [0u8; 128];
    let len = user_obligation.encrypted_state_blob.len().min(128);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Read pool state (MXE only)
    // PoolState has 4 u128 fields = 4 * 32 = 128 bytes
    let pool = &ctx.accounts.pool;
    let encrypted_pool_state: [u8; 128] = if pool.encrypted_pool_state.is_empty() {
        [0u8; 128]
    } else {
        let mut state_arr = [0u8; 128];
        let len = pool.encrypted_pool_state.len().min(128);
        state_arr[..len].copy_from_slice(&pool.encrypted_pool_state[..len]);
        state_arr
    };

    // Get current timestamp and borrow rate
    let current_ts = Clock::get()?.unix_timestamp;
    let borrow_rate_bps = ctx.accounts.pool.fixed_borrow_rate;

    // Build arguments for Arcium MXE computation
    let args = ArgBuilder::new()
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(nonce)
        // 4 encrypted u128 for UserState
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_state[64..96].try_into().unwrap())
        .encrypted_u128(encrypted_state[96..128].try_into().unwrap())
        // 4 encrypted u128 for PoolState
        .encrypted_u128(encrypted_pool_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[32..64].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[64..96].try_into().unwrap())
        .encrypted_u128(encrypted_pool_state[96..128].try_into().unwrap())
        .plaintext_i64(current_ts)
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
