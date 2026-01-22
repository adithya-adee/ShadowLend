use super::accounts::Deposit;
use super::callback::DepositCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a user deposit by transferring collateral tokens and queuing confidential computation.
///
/// This handler performs the following operations:
/// 1. Validates the deposit amount
/// 2. Initializes the user obligation account if this is their first deposit
/// 3. Transfers tokens from the user to the pool's collateral vault
/// 4. Constructs arguments for the Arcium MPC circuit
/// 5. Queues the confidential computation to update encrypted balances
///
/// # Arguments
/// * `ctx` - The Anchor context containing all required accounts
/// * `computation_offset` - Unique offset for this computation in the Arcium cluster
/// * `amount` - The amount of tokens to deposit (must be > 0)
/// * `user_pubkey` - User's X25519 public key for encrypting the output state
/// * `user_nonce` - Nonce for encryption to ensure freshness
///
/// # Returns
/// * `Result<()>` - Success or error
///
/// # Errors
/// * `ErrorCode::InvalidAmount` - If amount is zero
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    // Validate deposit amount is non-zero
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Cache the user obligation key to avoid borrow conflicts later
    // This is necessary because we need both mutable and immutable borrows
    let user_obligation_key = ctx.accounts.user_obligation.key();

    // Build Arcium circuit arguments within a scoped block
    // The block ensures the mutable borrow is dropped before we need an immutable borrow
    let args = {
        let user_obligation = &mut ctx.accounts.user_obligation;

        // Initialize user obligation on first deposit
        // Check if account is uninitialized by testing for default pubkey
        if user_obligation.user == Pubkey::default() {
            user_obligation.user = ctx.accounts.payer.key();
            user_obligation.pool = ctx.accounts.pool.key();
            user_obligation.encrypted_deposit = [0u8; 32]; // Zero ciphertext initially
            user_obligation.encrypted_borrow = [0u8; 32]; // Zero ciphertext initially
            user_obligation.state_nonce = 0;
            user_obligation.bump = ctx.bumps.user_obligation;
        }

        // Construct circuit arguments: deposit(amount, user_pubkey, user_nonce, current_deposit)
        let mut args = ArgBuilder::new()
            .plaintext_u64(amount) // Deposit amount in plaintext
            .x25519_pubkey(user_pubkey) // For encrypting output back to user
            .plaintext_u128(user_nonce); // Nonce for encryption freshness

        // Add current encrypted deposit balance
        // If existing balance exists, reference on-chain data; otherwise use zero ciphertext
        args = if user_obligation.encrypted_deposit != [0u8; 32] {
            // Offset 72 = 8 (discriminator) + 32 (user) + 32 (pool)
            args.account(user_obligation_key, 72u32, 32u32)
        } else {
            args.encrypted_u128([0u8; 32])
        };

        args.build()
    }; // Mutable borrow of user_obligation is dropped here

    // Transfer tokens from user to the pool's collateral vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };

    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    // Queue the confidential computation to Arcium MXE
    // The MPC nodes will execute the deposit circuit and call back with encrypted results
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server needed for this operation
        vec![DepositCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: user_obligation_key,
                is_writable: true, // Callback will update encrypted balance
            }],
        )?],
        1, // Single callback transaction
        0, // No priority fee
    )?;

    msg!("Deposited {} tokens, queued Arcium computation", amount);

    Ok(())
}
