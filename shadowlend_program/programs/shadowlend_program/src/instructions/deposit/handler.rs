use super::accounts::Deposit;
use super::callback::DepositCallback;
use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a user deposit by transferring collateral tokens and queuing an MPC computation.
///
/// Initializes the user obligation account on first deposit. Transfers tokens from the user
/// to the pool's collateral vault, then queues a confidential computation to update the
/// encrypted deposit balance. The MPC callback will store the new encrypted balance on-chain.
///
/// # Arguments
/// * `ctx` - Anchor context with deposit accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to deposit (must be > 0)
/// * `user_pubkey` - User's X25519 public key for encrypting output state
/// * `user_nonce` - Nonce for encryption freshness
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation_key = ctx.accounts.user_obligation.key();

    let args = {
        let user_obligation = &mut ctx.accounts.user_obligation;

        if user_obligation.user == Pubkey::default() {
            user_obligation.user = ctx.accounts.payer.key();
            user_obligation.pool = ctx.accounts.pool.key();
            user_obligation.encrypted_deposit = [0u8; 32];
            user_obligation.encrypted_borrow = [0u8; 32];
            user_obligation.state_nonce = 0;
            user_obligation.bump = ctx.bumps.user_obligation;
        }

        let mut args = ArgBuilder::new()
            .plaintext_u64(amount)
            .x25519_pubkey(user_pubkey)
            .plaintext_u128(user_nonce);

        // Offset 72 = 8 (discriminator) + 32 (user) + 32 (pool)
        args = if user_obligation.encrypted_deposit != [0u8; 32] {
            args.account(user_obligation_key, 72u32, 32u32)
                .plaintext_u8(1)
        } else {
            args.encrypted_u128([0u8; 32]).plaintext_u8(0)
        };

        args.build()
    };

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let transfer_cpi = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };

    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![DepositCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: user_obligation_key,
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    msg!("Deposited {} tokens", amount);
    Ok(())
}
