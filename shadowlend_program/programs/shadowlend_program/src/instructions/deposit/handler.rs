use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Deposit;
use super::callback::ComputeConfidentialDepositCallback;
use crate::error::ErrorCode;

/// Queue deposit computation to Arcium MXE
/// Token transfer happens in callback after verification
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    encrypted_amount: [u8; 32], // Enc<Shared, u128>
    pub_key: [u8; 32],          // User's x25519 public key
    nonce: u128,                // Encryption nonce
) -> Result<()> {
    require!(
        encrypted_amount != [0u8; 32],
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

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from UserObligation (prevent state injection)
    let encrypted_state: [u8; 64] = if user_obligation.encrypted_state_blob.is_empty() {
        [0u8; 64]
    } else {
        let mut state_arr = [0u8; 64];
        let len = user_obligation.encrypted_state_blob.len().min(64);
        state_arr[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);
        state_arr
    };

    // Build args for MXE computation
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
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
