use super::accounts::Repay;
use super::callback::RepayCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a debt repayment by transferring tokens and queuing confidential computation.
///
/// This handler performs the following operations:
/// 1. Validates the repayment amount
/// 2. Transfers tokens from the user to the pool's borrow vault
/// 3. Constructs arguments for the Arcium MPC circuit with encrypted debt
/// 4. Queues the confidential computation to update encrypted debt balance
///
/// The MPC circuit calculates: new_debt = max(0, current_debt - repay_amount)
///
/// # Arguments
/// * `ctx` - The Anchor context containing all required accounts
/// * `computation_offset` - Unique offset for this computation in the Arcium cluster
/// * `amount` - The amount of tokens to repay (must be > 0)
///
/// # Returns
/// * `Result<()>` - Success or error
///
/// # Errors
/// * `ErrorCode::InvalidAmount` - If amount is zero
pub fn repay_handler(ctx: Context<Repay>, computation_offset: u64, amount: u64) -> Result<()> {
    // Validate repayment amount is non-zero
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Transfer repayment tokens from user to the pool's borrow vault
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

    // Construct circuit arguments: repay(amount, current_debt)
    let mut args = ArgBuilder::new().plaintext_u64(amount);

    // Add encrypted debt balance (user_obligation.encrypted_borrow)
    // Offset 104 = 8 (discriminator) + 32 (user) + 32 (pool) + 32 (encrypted_deposit)
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Queue the confidential computation to Arcium MXE
    // The MPC circuit will calculate the new debt balance after repayment
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
                is_writable: true, // Callback will update encrypted debt
            }],
        )?],
        1, // Single callback transaction
        0, // No priority fee
    )?;

    msg!("Repayed {} tokens, queued Arcium computation", amount);

    Ok(())
}
