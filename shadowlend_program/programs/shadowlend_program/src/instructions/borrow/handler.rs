use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::Borrow;
use super::callback::ComputeConfidentialBorrowCallback;
use crate::constants::{SOL_PRICE_CENTS, USDC_PRICE_CENTS};
use crate::error::ErrorCode;

/// Queue borrow computation to Arcium MXE
/// Token transfer happens in callback after verification
pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    encrypted_amount: [u8; 32], // Enc<Shared, u128>
    pub_key: [u8; 32],          // User's x25519 public key
    nonce: u128,                // Encryption nonce
) -> Result<()> {
    require!(
        encrypted_amount != [0u8; 32],
        ErrorCode::InvalidBorrowAmount
    );

    // User must have existing state (deposited collateral)
    let user_obligation = &ctx.accounts.user_obligation;
    require!(
        !user_obligation.encrypted_state_blob.is_empty(),
        ErrorCode::InvalidBorrowAmount
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Read encrypted state from on-chain UserObligation
    let mut encrypted_state = [0u8; 64];
    let len = user_obligation.encrypted_state_blob.len().min(64);
    encrypted_state[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);

    // Get pool LTV for health factor calculation
    let ltv_bps = ctx.accounts.pool.ltv;

    // Build arguments for Arcium computation
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .plaintext_u64(SOL_PRICE_CENTS)
        .plaintext_u64(USDC_PRICE_CENTS)
        .plaintext_u16(ltv_bps)
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
