use super::accounts::Borrow;
use super::callback::BorrowCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a borrow request by queuing a confidential MPC health check.
///
/// Constructs circuit arguments with encrypted collateral and debt balances, then queues
/// an Arcium computation to verify the health factor. If the check passes, the callback
/// will update encrypted debt and transfer tokens from the borrow vault to the user.
///
/// # Arguments
/// * `ctx` - Anchor context with borrow accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to borrow (must be > 0)
pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;
    let ltv_bps = pool.ltv_bps as u64;

    let mut args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce);

    // Offset 72 = 8 (discriminator) + 32 (user) + 32 (pool)
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        args.account(user_obligation.key(), 72u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Offset 104 = 72 + 32 (encrypted_deposit)
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce);
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    args = args.plaintext_u64(ltv_bps);

    // Add is_collateral_initialized flag
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        args.plaintext_u8(1)
    } else {
        args.plaintext_u8(0)
    };

    // Add is_debt_initialized flag
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.plaintext_u8(1)
    } else {
        args.plaintext_u8(0)
    };

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![BorrowCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
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
                    pubkey: ctx.accounts.borrow_vault.key(),
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

    msg!("Queued borrow computation for {} tokens", amount);
    Ok(())
}
