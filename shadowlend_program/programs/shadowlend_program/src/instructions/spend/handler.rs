use crate::instructions::spend::{accounts::Spend, callback::SpendCallback};
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

pub fn spend_handler(
    ctx: Context<Spend>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    
    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    let mut args = ArgBuilder::new();

    // Map public spend amount to circuit arguments
    args = args.plaintext_u64(amount);

    // Provide encryption context for account loading
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce);

    // Encrypted internal balance retrieval from UserObligation
    args = if user_obligation.encrypted_internal_balance != [0u8; 32] {
        args.account(user_obligation.key(), 136u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Flag to indicate if internal balance state exists
    args = args.plaintext_u8(if user_obligation.encrypted_internal_balance != [0u8; 32] { 1 } else { 0 });
    
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Queue MPC computation to verify internal balance and approve spend
    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![SpendCallback::callback_ix(
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
