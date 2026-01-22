use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use crate::error::ErrorCode;
use super::accounts::Borrow;
use super::callback::BorrowCallback;

pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32], // Not strictly needed for borrow logic but maybe for consistency? borrow circuit doesn't use it.
    pool_ltv: u64, // Passed from client? Or read from pool?
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    // Use LTV from pool if not passed or verify it? 
    // The circuit takes ltv_bps. We should take it from the pool account.
    let ltv_bps = pool.ltv_bps as u64;

    // Build arguments for Arcium borrow circuit
    // Circuit sig: borrow(amount: u64, collateral: Enc<Shared, u128>, current_debt: Enc<Shared, u128>, ltv_bps: u64)
    let mut args = ArgBuilder::new()
        .plaintext_u64(amount);

    // collateral: user_obligation.encrypted_deposit
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        args.account(user_obligation.key(), 72u32, 32u32) // offset to encrypted_deposit
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // current_debt: user_obligation.encrypted_borrow
    args = if user_obligation.encrypted_borrow != [0u8; 32] {
         if user_obligation.encrypted_deposit != [0u8; 32] {
            // Need to be careful about order of account additions? 
            // ArgBuilder adds accounts to a list. We can reference same account twice?
            // Actually, we refer to the same account. `account` method adds the account to the list sent to MXE.
            // But here we are specifying the input value location.
            // ArgBuilder `account` adds a parameter that points to on-chain data.
            args.account(user_obligation.key(), 104u32, 32u32) // offset to encrypted_borrow (72+32=104)
         } else {
            args.account(user_obligation.key(), 104u32, 32u32)
         }
    } else {
        args.encrypted_u128([0u8; 32])
    };

    args = args.plaintext_u64(ltv_bps);

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        None,
        vec![BorrowCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
             // amount removed based on updated plan (passing via circuit output)
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

    msg!("Queued borrow computation for amount: {}", amount);

    Ok(())
}
