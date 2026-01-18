use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::state::{Pool, UserObligation};
use crate::ArciumSignerAccount;
use crate::{ID, ID_CONST};

use crate::error::ErrorCode;

/// Accounts for interest accrual instruction (queues computation only)
/// No token transfer - just state update
#[queue_computation_accounts("compute_confidential_interest", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct UpdateInterest<'info> {
    // === Caller (can be anyone triggering interest update) ===
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// User obligation to update interest on
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

    #[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_INTEREST))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    // === Programs ===
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
