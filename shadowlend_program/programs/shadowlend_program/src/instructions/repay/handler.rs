use super::accounts::Repay;
use super::callback::RepayCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a debt repayment by transferring tokens and queuing an MPC computation.
///
/// Transfers repayment tokens from the user to the borrow vault, then queues a confidential
/// computation to update the encrypted debt balance. The MPC circuit calculates:
/// new_debt = max(0, current_debt - repay_amount)
///
/// # Arguments
/// * `ctx` - Anchor context with repay accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to repay (must be > 0)
pub fn repay_handler(
    ctx: Context<Repay>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let transfer_cpi = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };

    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    let user_obligation = &ctx.accounts.user_obligation;

    let mut args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce);

    // Offset 104 = 8 (discriminator) + 32 (user) + 32 (pool) + 32 (encrypted_deposit)
    // Offset 104 = 8 (discriminator) + 32 (user) + 32 (pool) + 32 (encrypted_deposit)
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32)
            .plaintext_u8(1)
    } else {
        args.encrypted_u128([0u8; 32]).plaintext_u8(0)
    };

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![RepayCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: user_obligation.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    msg!("Repayed {} tokens", amount);
    Ok(())
}
