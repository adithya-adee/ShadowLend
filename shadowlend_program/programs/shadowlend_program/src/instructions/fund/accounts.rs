use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Pool, UserObligation};

/// Accounts for fund_account instruction
/// 
/// This is the first phase of the two-phase deposit model:
/// 1. Fund: User transfers tokens to vault (amount IS visible)
/// 2. Credit: User's encrypted balance is updated (amount is HIDDEN)
/// 
/// By separating these, observers see deposits but not the credit amounts.
#[derive(Accounts)]
pub struct FundAccount<'info> {
    /// User funding their account
    #[account(mut)]
    pub user: Signer<'info>,

    /// The lending pool
    #[account(
        mut,
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// User's obligation account (tracks total_funded)
    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, user.key().as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump,
        constraint = user_obligation.user == user.key() @ crate::error::ErrorCode::Unauthorized,
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    /// The collateral token mint
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// User's token account to fund from
    #[account(
        mut,
        constraint = user_token_account.owner == user.key() @ crate::error::ErrorCode::Unauthorized,
        constraint = user_token_account.mint == collateral_mint.key() @ crate::error::ErrorCode::InvalidMint,
        constraint = collateral_mint.key() == pool.collateral_mint @ crate::error::ErrorCode::InvalidMint,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    /// Pool's collateral vault (receives tokens)
    #[account(
        mut,
        seeds = [b"vault", collateral_mint.key().as_ref(), b"collateral"],
        bump,
        token::mint = collateral_mint,
        token::authority = pool,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
