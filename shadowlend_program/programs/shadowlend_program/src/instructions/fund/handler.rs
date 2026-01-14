use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use super::accounts::FundAccount;
use crate::error::ErrorCode;

/// Minimum funding amount to prevent dust attacks (1000 lamports = 0.000001 SOL)
pub const MIN_FUND_AMOUNT: u64 = 1000;

/// Fund user's account by transferring tokens to vault
/// 
/// TWO-PHASE DEPOSIT MODEL:
/// - Phase 1 (this): User transfers tokens to vault (amount IS visible but decoupled)
/// - Phase 2: User calls confidential_credit to update encrypted balance (amount HIDDEN)
/// 
/// PRIVACY TRADE-OFF:
/// - The funding amount IS visible on-chain (SPL transfer)
/// - But the credit amount (how much actually gets added to balance) is HIDDEN
/// - Users can fund more than they credit, or fund in batches
pub fn fund_account_handler(
    ctx: Context<FundAccount>,
    amount: u64,
) -> Result<()> {
    require!(amount >= MIN_FUND_AMOUNT, ErrorCode::InvalidDepositAmount);

    // Transfer tokens from user to vault
    let transfer_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    token::transfer(transfer_ctx, amount)?;

    msg!("Tokens transferred to vault");

    // Update user's funded total
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.total_funded = user_obligation
        .total_funded
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    // Get pool key before mutable borrow
    let pool_key = ctx.accounts.pool.key();

    // Increment pool vault nonce
    let pool = &mut ctx.accounts.pool;
    pool.vault_nonce = pool
        .vault_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    pool.last_update_ts = Clock::get()?.unix_timestamp;

    // Emit event - amount IS public (this is the visible funding step)
    emit!(AccountFunded {
        user: ctx.accounts.user.key(),
        pool: pool_key,
        amount,
        total_funded: user_obligation.total_funded,
        vault_nonce: pool.vault_nonce,
        timestamp: pool.last_update_ts,
    });

    Ok(())
}

/// Account funded event
/// Note: Amount IS public - this is the visible part of two-phase deposit
/// The confidential part comes when user calls credit to update encrypted balance
#[event]
pub struct AccountFunded {
    pub user: Pubkey,
    pub pool: Pubkey,
    /// Amount funded (visible)
    pub amount: u64,
    /// User's cumulative funded total
    pub total_funded: u64,
    /// Pool vault nonce for ordering
    pub vault_nonce: u128,
    pub timestamp: i64,
}
