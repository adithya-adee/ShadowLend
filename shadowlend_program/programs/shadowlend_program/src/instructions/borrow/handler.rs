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
    // 0. Encrypted UserState (Account or Zero Struct)
    // 1. Encrypted Borrow Amount (Input)
    // 2. LTV (Plaintext)
    // 3. Flags (is_initialized)

    let mut args = ArgBuilder::new();

    // Configure the encryption context for account loading
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce);
    
    // Build circuit arguments matching the Arcis 'borrow' function signature
    args = if user_obligation.is_initialized {
        args.account(user_obligation.key(), 72u32, 96u32)
    } else {
        args.encrypted_u128([0u8; 32]) // deposit
            .encrypted_u128([0u8; 32]) // debt
            .encrypted_u128([0u8; 32]) // internal_balance
    };

    // Pass the requested borrow amount (Encrypted, so requires context)
    // Context is already set for encrypted_u128 if previous call was args.account (which preserves context? No wait.)
    // ArgBuilder resets context? Usually. But wait, `ArgBuilder` context applies to the *next* encrypted arg.
    // If I used `account()`, that consumed the context.
    // If I used `encrypted_u128` chain, that might preserve it or need refresh.
    // The previous code had repeated `x25519_pubkey` calls.
    // Let's re-add context for `amount`.
    args = args.x25519_pubkey(user_pubkey).plaintext_u128(user_nonce); 
    args = args.encrypted_u128(amount);

    args = args.plaintext_u64(ltv_bps);

    // Initialization flags for circuit logic
    args = args.plaintext_u8(if user_obligation.is_initialized { 1 } else { 0 });

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
