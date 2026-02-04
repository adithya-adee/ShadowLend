use super::accounts::Liquidate;
use super::callback::LiquidateCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a liquidation request by escrowing repayment and queuing an MPC check.
///
/// Transfers repayment tokens from liquidator to borrow vault (escrowed), then queues MPC
/// computation to check if user health factor < 1.0. Callback seizes collateral if
/// liquidatable, or refunds repayment if healthy.
///
/// # Arguments
/// * `ctx` - Anchor context with liquidate accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Amount of debt to repay (must be > 0)
/// * `user_pubkey` - User's X25519 public key for encryption
/// * `user_nonce` - Nonce for encryption freshness
pub fn liquidate_handler(
    ctx: Context<Liquidate>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation_key = ctx.accounts.user_obligation.key();
    let is_initialized = ctx.accounts.user_obligation.is_initialized;

    let transfer_cpi = Transfer {
        from: ctx.accounts.liquidator_borrow_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
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
        .plaintext_u64(ctx.accounts.pool.liquidation_threshold as u64)
        .plaintext_u8(if is_initialized { 1 } else { 0 })
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![LiquidateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: user_obligation_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.pool.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.liquidator_borrow_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.liquidator_collateral_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.borrow_vault.key(),
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

    msg!("Queued liquidation check for {} tokens", amount);
    Ok(())
}
