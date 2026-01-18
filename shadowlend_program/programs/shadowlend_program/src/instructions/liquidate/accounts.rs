use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use arcium_anchor::prelude::*;

use crate::state::{Pool, UserObligation};
use crate::ArciumSignerAccount;
use crate::{ID, ID_CONST};


use crate::error::ErrorCode;



/// Accounts for liquidate instruction (queues computation only)
/// Token transfers happen in callback after MXE verification
#[queue_computation_accounts("compute_confidential_liquidate", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Liquidate<'info> {
    // === Liquidator Account ===
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The user being liquidated (their obligation)
    /// Note: No constraint on user == payer since liquidator != borrower
    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, user_obligation.user.as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump,
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    // === Arcium MXE Accounts ===
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],
        bump,
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_LIQUIDATE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    // === Token Accounts for Optimistic Repayment ===
    pub borrow_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault", pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = liquidator_borrow_account.owner == payer.key() @ ErrorCode::Unauthorized,
        constraint = liquidator_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    pub liquidator_borrow_account: Box<Account<'info, TokenAccount>>,

    // === Pyth Oracle Accounts ===
    /// CHECK: Pyth SOL/USD price update account - validated in handler
    pub sol_price_update: UncheckedAccount<'info>,

    /// CHECK: Pyth USDC/USD price update account - validated in handler
    pub usdc_price_update: UncheckedAccount<'info>,

    // === Programs ===
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub arcium_program: Program<'info, Arcium>,
}
