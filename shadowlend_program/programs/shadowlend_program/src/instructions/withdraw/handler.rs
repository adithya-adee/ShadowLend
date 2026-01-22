use super::accounts::Withdraw;
use super::callback::WithdrawCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a withdrawal request by queuing a confidential health check computation.
///
/// This handler performs the following operations:
/// 1. Validates the withdrawal amount
/// 2. Retrieves the pool's LTV (Loan-to-Value) configuration
/// 3. Constructs arguments for the Arcium MPC circuit with encrypted balances
/// 4. Queues the confidential computation to verify health factor after withdrawal
///
/// The actual token transfer occurs in the callback after MPC verification.
/// The MPC circuit checks if: (collateral - withdraw_amount) * ltv_bps >= current_debt
///
/// # Arguments
/// * `ctx` - The Anchor context containing all required accounts
/// * `computation_offset` - Unique offset for this computation in the Arcium cluster
/// * `amount` - The amount of tokens to withdraw (must be > 0)
///
/// # Returns
/// * `Result<()>` - Success or error
///
/// # Errors
/// * `ErrorCode::InvalidAmount` - If amount is zero
pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    computation_offset: u64,
    amount: u64,
) -> Result<()> {
    // Validate withdrawal amount is non-zero
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    // Retrieve LTV (Loan-to-Value) ratio from pool configuration
    // LTV is in basis points (e.g., 7500 = 75%)
    let ltv_bps = pool.ltv_bps as u64;

    // Construct circuit arguments: withdraw(amount, current_collateral, current_borrow, ltv_bps)
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // Add encrypted collateral balance (user_obligation.encrypted_deposit)
    // Reference on-chain data if exists, otherwise use zero ciphertext
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        // Offset 72 = 8 (discriminator) + 32 (user) + 32 (pool)
        args.account(user_obligation.key(), 72u32, 32u32)
    } else {
        // If collateral is zero, withdrawing > 0 will fail in circuit logic
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
        vec![WithdrawCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: user_obligation.key(),
                    is_writable: true, // Will update encrypted collateral if approved
                },
                CallbackAccount {
                    pubkey: pool.key(),
                    is_writable: false, // Read-only access to pool config
                },
                CallbackAccount {
                    pubkey: ctx.accounts.user_token_account.key(),
                    is_writable: true, // Will receive withdrawn tokens if approved
                },
                CallbackAccount {
                    pubkey: ctx.accounts.collateral_vault.key(),
                    is_writable: true, // Source of withdrawn tokens
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

    msg!("Queued withdraw computation for amount: {}", amount);

    Ok(())
}
