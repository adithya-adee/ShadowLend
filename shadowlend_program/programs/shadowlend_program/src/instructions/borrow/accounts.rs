use crate::state::{Pool, UserObligation};
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::{ArciumSignerAccount, COMP_DEF_OFFSET_BORROW, ID, ID_CONST};

#[queue_computation_accounts("borrow", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, amount: [u8; 32], user_pubkey: [u8; 32], user_nonce: u128)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],
        bump,
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
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
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_BORROW)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    #[account(
        seeds = [Pool::SEED_PREFIX],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, payer.key().as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
