use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::UpdateInterest;
use super::callback::ComputeConfidentialInterestCallback;
use crate::error::ErrorCode;

/// Queue interest accrual computation to Arcium MXE
/// No token transfer - just updates encrypted state with accrued interest
///
/// Flow:
/// 1. Anyone can trigger interest update for a user
/// 2. Handler queues computation with current timestamp and borrow rate
/// 3. MXE computes accrued interest privately
/// 4. Callback updates encrypted state and pool aggregates
pub fn update_interest_handler(
    ctx: Context<UpdateInterest>,
    computation_offset: u64,
) -> Result<()> {
    // User must have existing state
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

    // Get current timestamp and borrow rate
    let current_ts = Clock::get()?.unix_timestamp;
    let borrow_rate_bps = ctx.accounts.pool.fixed_borrow_rate;

    // Build arguments for Arcium MXE computation
    let args = ArgBuilder::new()
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
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
