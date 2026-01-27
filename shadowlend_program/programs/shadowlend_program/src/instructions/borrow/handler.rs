use super::accounts::Borrow;
use super::callback::BorrowCallback;
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
    amount: [u8; 32],
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;
    let ltv_bps = pool.ltv_bps as u64;

    // Args:
    // 0. Encrypted Deposit (Account or Zero)
    // 1. Encrypted Borrow (Account or Zero)
    // 2. Encrypted Internal Balance (Account or Zero)
    // 3. Encrypted Borrow Amount (Input)
    // 4. LTV (Plaintext)
    // 5. Flags (is_deposit_init, is_borrow_init)

    let mut args = ArgBuilder::new();

    // Configure the encryption context for account loading
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce);

    // Build circuit arguments matching the Arcis 'borrow' function signature
    args = if user_obligation.encrypted_deposit != [0u8; 32] {
        args.account(user_obligation.key(), 72u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    args = if user_obligation.encrypted_borrow != [0u8; 32] {
        args.account(user_obligation.key(), 104u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    args = if user_obligation.encrypted_internal_balance != [0u8; 32] {
        args.account(user_obligation.key(), 136u32, 32u32)
    } else {
        args.encrypted_u128([0u8; 32])
    };

    // Pass the requested borrow amount and pool LTV
    args = args.encrypted_u128(amount);
    args = args.plaintext_u64(ltv_bps);

    // Initialization flags for circuit logic
    args = args.plaintext_u8(if user_obligation.encrypted_deposit != [0u8; 32] { 1 } else { 0 });
    args = args.plaintext_u8(if user_obligation.encrypted_borrow != [0u8; 32] { 1 } else { 0 });

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Queue the asynchronous Arcium computation with configured callbacks
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
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
    )?;

    msg!("Queued borrow computation for {:?} tokens", amount);
    Ok(())
}
