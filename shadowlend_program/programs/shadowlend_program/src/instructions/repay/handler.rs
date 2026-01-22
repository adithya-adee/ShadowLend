use super::accounts::Repay;
use super::callback::RepayCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

pub fn repay_handler(ctx: Context<Repay>, computation_offset: u64, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Transfer tokens from user to borrow vault
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

    // Build arguments for Arcium repay circuit
    // Circuit: repay(amount: u64, current_debt: Enc<Shared, u128>)
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // current_debt (user_obligation.encrypted_borrow)
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32) // offset to encrypted_borrow
    } else {
        args.encrypted_u128([0u8; 32])
    };

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

    msg!("Repayed {} tokens, queued Arcium computation", amount);

    Ok(())
}
