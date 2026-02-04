use crate::instructions::spend::{accounts::Spend, callback::SpendCallback};
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a spend request by queuing a confidential MPC balance check.
///
/// Queues Arcium computation to verify internal balance and approve spend. Callback
/// transfers tokens from borrow vault to destination if balance is sufficient.
///
/// # Arguments
/// * `ctx` - Anchor context with spend accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to spend
/// * `user_pubkey` - User's X25519 public key for encryption
/// * `user_nonce` - Nonce for encryption freshness
pub fn spend_handler(
    ctx: Context<Spend>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    let user_obligation_key = ctx.accounts.user_obligation.key();
    let is_initialized = ctx.accounts.user_obligation.is_initialized;

    let args = ArgBuilder::new()
        .plaintext_u64(amount)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce)
        .account(user_obligation_key, 72u32, 96u32)
        .plaintext_u8(if is_initialized { 1 } else { 0 })
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SpendCallback::callback_ix(
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
                    pubkey: ctx.accounts.destination_token_account.key(),
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

    msg!("Queued spend computation for {} tokens", amount);
    Ok(())
}
