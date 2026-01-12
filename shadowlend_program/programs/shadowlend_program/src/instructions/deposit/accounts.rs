use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Import ID and SignerAccount from crate root
use crate::{SignerAccount, ID};
// Import ID_CONST from arcium_client for PDA derivation macros
use arcium_client::idl::arcium::ID_CONST;

use crate::error::ErrorCode;

/// Computation definition offset for deposit circuit
const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_deposit");

/// Accounts for the deposit instruction
///
/// This struct defines all accounts needed to queue a deposit computation.
/// Uses Arcium's queue_computation_accounts macro for MXE integration.
#[queue_computation_accounts("compute_deposit", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Deposit<'info> {
    // === User Accounts ===
    /// The user depositing collateral (pays for computation)
    #[account(mut)]
    pub payer: Signer<'info>,

    // === Arcium MXE Accounts ===
    /// Signer PDA for Arcium callbacks
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,

    /// MXE account for this program
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Arcium mempool for pending computations
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub mempool_account: UncheckedAccount<'info>,

    /// Arcium execution pool
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub executing_pool: UncheckedAccount<'info>,

    /// Computation account for this specific computation
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub computation_account: UncheckedAccount<'info>,

    /// Computation definition for deposit circuit
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    /// Arcium cluster account
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    /// Arcium fee pool
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    /// Arcium clock account
    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    // === Programs ===
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
