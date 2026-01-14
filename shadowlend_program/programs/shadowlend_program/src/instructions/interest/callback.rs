use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET_COMPUTE_INTEREST: u32 = comp_def_offset("compute_interest");

/// Callback after MXE interest computation completes
/// No token transfer - just state update
#[callback_accounts("compute_interest")]
#[derive(Accounts)]
pub struct ComputeInterestCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_INTEREST))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: Instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,

    // === ShadowLend State Accounts ===
    #[account(
        mut,
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, user_obligation.user.as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,
}

/// Process MXE interest result and update state
/// CONFIDENTIAL: Interest amount NOT revealed in events
pub fn update_interest_callback_handler(
    ctx: Context<ComputeInterestCallback>,
    output: SignedComputationOutputs<ComputeInterestOutput>,
) -> Result<()> {
    // Verify MXE output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeInterestOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE interest computation verified");

    require!(
        !result.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // NOTE: Interest amount NOT extracted for confidentiality
    // Pool accumulated_interest is now tracked inside encrypted_pool_state

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;

    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    let state_ciphertexts: Vec<u8> = result.ciphertexts[..4]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    let mut commitment = [0u8; 32];
    for (i, byte) in user_obligation.encrypted_state_blob.iter().enumerate() {
        commitment[i % 32] ^= byte;
    }
    user_obligation.state_commitment = commitment;
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("User obligation state updated");

    // Update pool timestamp only (interest now tracked in encrypted pool state)
    let pool = &mut ctx.accounts.pool;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool timestamp updated");

    // Emit CONFIDENTIAL event - NO interest amount
    emit!(InterestUpdated {
        target_user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        // NO interest_accrued field for confidentiality
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Interest update event
/// CONFIDENTIAL: No interest amount field
#[event]
pub struct InterestUpdated {
    pub target_user: Pubkey,
    pub pool: Pubkey,
    // NO interest_accrued field for confidentiality
    pub state_nonce: u128,
    pub timestamp: i64,
}
