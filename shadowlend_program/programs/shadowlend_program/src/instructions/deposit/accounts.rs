use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use arcium_anchor::prelude::*;
use crate::state::{Pool, UserObligation};

use crate::error::ErrorCode;
use crate::{ArciumSignerAccount, COMP_DEF_OFFSET_DEPOSIT, ID, ID_CONST};

/// Queue deposit computation to Arcium MXE
#[queue_computation_accounts("deposit", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, amount: u64, user_pubkey: [u8; 32], user_nonce: u128)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEPOSIT)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    
    #[account(
        seeds = [Pool::SEED_PREFIX],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 32 + 16 + 1,
        seeds = [UserObligation::SEED_PREFIX, payer.key().as_ref(), pool.key().as_ref()],
        bump
    )]
    pub user_obligation: Account<'info, UserObligation>,
    
    /// User's token account (source of deposit)
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// Pool's collateral vault
    #[account(
        mut,
        seeds = [b"collateral_vault", pool.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
