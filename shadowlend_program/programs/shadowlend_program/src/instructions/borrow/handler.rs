use super::accounts::Borrow;
use super::callback::BorrowCallback;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

/// Processes a borrow request by queuing a confidential MPC health check.
///
/// Constructs circuit arguments with encrypted collateral and debt balances, then queues
/// an Arcium computation to verify the health factor. If the check passes, the callback
/// will update encrypted debt.
///
/// # Arguments
/// * `ctx` - Anchor context with borrow accounts
/// * `computation_offset` - Unique identifier for this Arcium computation
/// * `amount` - Token amount to borrow (Encrypted 32 bytes)
/// * `user_pubkey` - User's X25519 public key (Context)
/// * `user_nonce` - Nonce for encryption freshness (Context)
pub fn borrow_handler(
    ctx: Context<Borrow>,
    computation_offset: u64,
    amount: [u8; 32],
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    msg!("Borrow Request Start. Amount: [Encrypted]");

    let user_obligation_key = ctx.accounts.user_obligation.key();
    let user_obligation = &ctx.accounts.user_obligation;
    let pool = &ctx.accounts.pool;

    let is_initialized = user_obligation.is_initialized;

    // --- Circuit Arguments Construction ---
    // The borrow circuit requires:
    // 1. User Context (Pubkey + Nonce)
    // 2. User State (Account Data: Encrypted Deposit, Debt, InternalBalance)
    // 3. Encrypted Borrow Amount (Input)
    // 4. Risk Params (LTV) + Init Flag

    let args = ArgBuilder::new()
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce)
        .account(user_obligation_key, 72u32, 96u32)
        .x25519_pubkey(user_pubkey)
        .plaintext_u128(user_nonce)
        .encrypted_u128(amount)
        .plaintext_u64(pool.ltv_bps as u64)
        .plaintext_u8(if is_initialized { 1 } else { 0 })
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // --- Schedule Arcium Computation ---
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![BorrowCallback::callback_ix(
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

    msg!("Confidential Borrow Request Queued. Amount: [Encrypted]");
    Ok(())
}
