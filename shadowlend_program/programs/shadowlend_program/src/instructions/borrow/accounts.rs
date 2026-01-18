use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::state::{Pool, UserObligation};
use crate::ArciumSignerAccount;
use crate::{ID, ID_CONST};

use crate::error::ErrorCode;

/// Accounts for borrow instruction (queues computation only)
/// Token transfer happens in callback after MXE verification
#[queue_computation_accounts("compute_confidential_borrow", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Borrow<'info> {
    // === User Accounts ===
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, payer.key().as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump,
        // User must have an existing obligation (deposited first)
        constraint = user_obligation.user == payer.key() @ ErrorCode::Unauthorized,
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

    #[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_BORROW))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    // === Pyth Oracle Accounts ===
    /// CHECK: Pyth SOL/USD price update account - validated in handler
    pub sol_price_update: UncheckedAccount<'info>,

    /// CHECK: Pyth USDC/USD price update account - validated in handler
    pub usdc_price_update: UncheckedAccount<'info>,

    // === Programs ===
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
