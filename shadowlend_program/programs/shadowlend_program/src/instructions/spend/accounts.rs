use crate::state::{Pool, UserObligation};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::{ArciumSignerAccount, COMP_DEF_OFFSET_SPEND, ID, ID_CONST};

#[queue_computation_accounts("spend", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, amount: u64, user_pubkey: [u8; 32], user_nonce: u128)]
pub struct Spend<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA that owns the borrow vault, initialized to manage computation results
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],
        bump,
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    /// Mandatory Arcium system accounts for MPC execution
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Validated by Arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Validated by Arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Validated by Arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SPEND))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    #[account(
        mut,
        seeds = [Pool::SEED_PREFIX],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, payer.key.as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    /// Destination account for the public token transfer
    #[account(
        mut,
        constraint = destination_token_account.mint == pool.borrow_mint @ ErrorCode::InvalidMint
    )]
    pub destination_token_account: Box<Account<'info, TokenAccount>>,

    /// Source vault containing the funds for public withdrawal
    #[account(
        mut,
        seeds = [b"borrow_vault", pool.key().as_ref()],
        bump
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
