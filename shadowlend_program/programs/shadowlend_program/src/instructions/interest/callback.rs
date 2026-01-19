use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;
use solana_keccak_hasher::hashv;

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_confidential_interest");

/// Callback accounts for confidential interest MXE computation
#[callback_accounts("compute_confidential_interest")]
#[derive(Accounts)]
pub struct ComputeConfidentialInterestCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
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

    #[account(
        mut,
        seeds = [Pool::SEED_PREFIX, pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref()],
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

/// Process MXE interest result - updates encrypted state only
pub fn update_interest_callback_handler(
    ctx: Context<ComputeConfidentialInterestCallback>,
    output: SignedComputationOutputs<ComputeConfidentialInterestOutput>,
) -> Result<()> {
    // Verify MXE output signature - output is a tuple struct wrapped in field_0
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeConfidentialInterestOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE interest computation verified");

    // Access user output (field_0 of the tuple struct) and pool output (field_1)
    let user_output = &result.field_0;
    let pool_output = &result.field_1;

    require!(
        user_output.ciphertexts.len() >= 5,
        ErrorCode::InvalidComputationOutput
    );

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store encrypted user state as fixed-size array
    user_obligation.encrypted_state_blob = [
        user_output.ciphertexts[0],
        user_output.ciphertexts[1],
        user_output.ciphertexts[2],
        user_output.ciphertexts[3],
    ];

    // Compute keccak256 commitment of encrypted user state (flatten array for hashing)
    let state_bytes: Vec<u8> = user_obligation
        .encrypted_state_blob
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    let commitment = hashv(&[&state_bytes]);
    user_obligation.state_commitment = commitment.to_bytes();
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    // Update pool state
    let pool = &mut ctx.accounts.pool;
    require!(
        !pool_output.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // Store encrypted pool state as fixed-size array
    pool.encrypted_pool_state = [
        pool_output.ciphertexts[0],
        pool_output.ciphertexts[1],
        pool_output.ciphertexts[2],
        pool_output.ciphertexts[3],
    ];
    pool.pool_state_initialized = true;

    // Compute keccak256 commitment of encrypted pool state
    let pool_state_bytes: Vec<u8> = pool
        .encrypted_pool_state
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    let pool_commitment = hashv(&[&pool_state_bytes]);
    pool.pool_state_commitment = pool_commitment.to_bytes();
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    emit!(InterestUpdated {
        target_user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Interest update event (no amount for confidentiality)
#[event]
pub struct InterestUpdated {
    pub target_user: Pubkey,
    pub pool: Pubkey,
    pub state_nonce: u128,
    pub timestamp: i64,
}
