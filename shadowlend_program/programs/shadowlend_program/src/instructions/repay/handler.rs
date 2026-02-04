use super::accounts::Repay;
use super::callback::RepayCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a debt repayment by transferring tokens and queuing an MPC computation.
///
/// Transfers tokens from user to borrow vault, then queues confidential computation to
/// update encrypted debt balance.
///
/// # Arguments
/// * `ctx` - Anchor context with repay accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to repay (must be > 0)
/// * `user_pubkey` - User's X25519 public key for encryption
/// * `user_nonce` - Nonce for encryption freshness
pub fn repay_handler(
    ctx: Context<Repay>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation_key = ctx.accounts.user_obligation.key();
    let is_initialized = ctx.accounts.user_obligation.is_initialized;

    let transfer_cpi = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };

    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    let args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce)
        .account(user_obligation_key, 72u32, 96u32)
        .plaintext_u8(if is_initialized { 1 } else { 0 })
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![RepayCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: user_obligation_key,
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    msg!("Repayed {} tokens", amount);
    Ok(())
}
