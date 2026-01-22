use super::accounts::Borrow;
use super::callback::BorrowCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a borrow request by queuing a confidential health check computation.
///
/// This handler performs the following operations:
/// 1. Validates the borrow amount
/// 2. Retrieves the pool's LTV (Loan-to-Value) configuration
/// 3. Constructs arguments for the Arcium MPC circuit with encrypted collateral and debt
/// 4. Queues the confidential computation to verify health factor
///
/// The actual token transfer occurs in the callback after MPC verification.
/// The MPC circuit checks if: collateral_value * ltv_bps >= current_debt + borrow_amount
///
/// # Arguments
/// * `ctx` - The Anchor context containing all required accounts
/// * `computation_offset` - Unique offset for this computation in the Arcium cluster
/// * `amount` - The amount of tokens to borrow (must be > 0)
///
/// # Returns
/// * `Result<()>` - Success or error
///
/// # Errors
/// * `ErrorCode::InvalidAmount` - If amount is zero
pub fn borrow_handler(ctx: Context<Borrow>, computation_offset: u64, amount: u64) -> Result<()> {
    // Validate borrow amount is non-zero
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    // Retrieve LTV (Loan-to-Value) ratio from pool configuration
    // LTV is in basis points (e.g., 7500 = 75%)
    let ltv_bps = pool.ltv_bps as u64;

    // Construct circuit arguments: borrow(amount, collateral, current_debt, ltv_bps)
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // Add encrypted collateral balance (user_obligation.encrypted_deposit)
    // Reference on-chain data if exists, otherwise use zero ciphertext
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        // Offset 72 = 8 (discriminator) + 32 (user) + 32 (pool)
        args.account(user_obligation.key(), 72u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Add encrypted debt balance (user_obligation.encrypted_borrow)
    // Offset 104 = 72 (to encrypted_deposit) + 32 (encrypted_deposit size)
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Add LTV threshold for health check
    args = args.plaintext_u64(ltv_bps);

    // Queue the confidential computation to Arcium MXE
    // The MPC circuit will verify health factor and return approval status
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
                    is_writable: true, // Will update encrypted debt if approved
                },
                CallbackAccount {
                    pubkey: pool.key(),
                    is_writable: false, // Read-only access to pool config
                },
                CallbackAccount {
                    pubkey: ctx.accounts.user_token_account.key(),
                    is_writable: true, // Will receive borrowed tokens if approved
                },
                CallbackAccount {
                    pubkey: ctx.accounts.borrow_vault.key(),
                    is_writable: true, // Source of borrowed tokens
                },
                CallbackAccount {
                    pubkey: ctx.accounts.token_program.key(),
                    is_writable: false, // Token program for transfer
                },
            ],
        )?],
        1, // Single callback transaction
        0, // No priority fee
    )?;

    msg!("Queued borrow computation for amount: {}", amount);

    Ok(())
}
