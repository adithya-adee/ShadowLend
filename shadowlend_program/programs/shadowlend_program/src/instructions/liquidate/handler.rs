use super::accounts::Liquidate;
use super::callback::LiquidateCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a liquidation request by escrowing repayment and queuing an MPC check.
///
/// 1. Transfers repayment tokens from Liquidator to Borrow Vault (escrowed).
/// 2. Queues MPC computation to check if User HF < 1.0.
/// 3. If Liquidatable: Seize collateral to Liquidator.
/// 4. If Healthy: Refund repayment to Liquidator.
///
/// # Arguments
/// * `amount` - Amount of debt to repay
pub fn liquidate_handler(
    ctx: Context<Liquidate>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // 1. Transfer Repayment (Escrow)
    // Transfer from Liquidator -> Borrow Vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.liquidator_borrow_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };

    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    // 2. Queue Computation
    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    let mut args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce);

    // Inputs: Encrypted Deposit, Encrypted Borrow, Liquidation Threshold
    // Inputs: Encrypted UserState, Liquidation Threshold, Flags
    // Offset 72 starts at `encrypted_state`. Length is 96 bytes.
    args = if user_obligation.is_initialized {
        args.account(user_obligation.key(), 72u32, 96u32)
    } else {
        args.encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
            .encrypted_u128([0u8; 32])
    };

    // Threshold
    args = args.plaintext_u64(pool.liquidation_threshold as u64);

    // Flags (is_initialized)
    args = args.plaintext_u8(if user_obligation.is_initialized { 1 } else { 0 });

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![LiquidateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: user_obligation.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: pool.key(),
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
