use super::accounts::Withdraw;
use super::callback::WithdrawCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    computation_offset: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;
    let ltv_bps = pool.ltv_bps as u64;

    // Circuit: withdraw(amount, current_encrypted, current_borrow, ltv_bps)
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // current_encrypted (collateral)
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        args.account(user_obligation.key(), 72u32, 32u32)
    } else {
        // If 0 collateral, withdrawing > 0 will fail in logic, but we pass 0 encrypted.
        args.encrypted_u128([0u8; 32])
    };

    // current_borrow
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        if user_obligation.encrypted_deposit != [0u8; 32] {
            args.account(user_obligation.key(), 104u32, 32u32)
        } else {
            args.account(user_obligation.key(), 104u32, 32u32)
        }
    } else {
        args.encrypted_u128([0u8; 32])
    };

    args = args.plaintext_u64(ltv_bps);

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![WithdrawCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            // amount removed
            &[
                CallbackAccount {
                    pubkey: user_obligation.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: pool.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.user_token_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.collateral_vault.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.token_program.key(),
                    is_writable: false,
                },
            ],
        )?],
        1,
        0,
    )?;

    msg!("Queued withdraw computation for amount: {}", amount);

    Ok(())
}
