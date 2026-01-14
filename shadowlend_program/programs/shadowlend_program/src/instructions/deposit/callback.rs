use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_confidential_deposit");

/// Callback accounts for confidential deposit MXE computation
#[callback_accounts("compute_confidential_deposit")]
#[derive(Accounts)]
pub struct ComputeConfidentialDepositCallback<'info> {
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

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key() @ ErrorCode::Unauthorized,
        constraint = user_token_account.mint == collateral_mint.key() @ ErrorCode::InvalidMint,
        constraint = collateral_mint.key() == pool.collateral_mint @ ErrorCode::InvalidMint,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault", collateral_mint.key().as_ref(), b"collateral"],
        bump,
        token::mint = collateral_mint,
        token::authority = pool,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Verified via user_obligation.user constraint
    #[account(constraint = user.key() == user_obligation.user)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE deposit result - transfers tokens from user to vault
pub fn deposit_callback_handler(
    ctx: Context<ComputeConfidentialDepositCallback>,
    output: SignedComputationOutputs<ComputeConfidentialDepositOutput>,
) -> Result<()> {
    // Verify and extract output - tuple (Enc<Shared, Output>, Enc<Mxe, PoolState>) wrapped in field_0
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeConfidentialDepositOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE deposit computation verified");

    // Access user output (field_0 of the tuple struct)
    let user_output = &result.field_0;
    
    require!(
        !user_output.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // Check success flag
    let success = user_output.ciphertexts[0][0] != 0;
    require!(success, ErrorCode::InvalidDepositAmount);

    // Extract deposit amount for transfer (revealed delta is last ciphertext)
    let deposit_delta_idx = user_output.ciphertexts.len() - 1;
    let deposit_amount = u64::from_le_bytes(
        user_output.ciphertexts[deposit_delta_idx][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(deposit_amount > 0, ErrorCode::InvalidDepositAmount);

    // Transfer tokens from user to vault
    let transfer_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
        deposit_amount,
    )?;

    // Update user obligation state
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store encrypted state
    let state_ciphertexts: Vec<u8> = user_output.ciphertexts[..4]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    // Update state commitment
    let mut commitment = [0u8; 32];
    for (i, byte) in user_obligation.encrypted_state_blob.iter().enumerate() {
        commitment[i % 32] ^= byte;
    }
    user_obligation.state_commitment = commitment;
    user_obligation.total_funded = user_obligation
        .total_funded
        .checked_add(deposit_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    emit!(DepositCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Deposit completion event (no amount for confidentiality)
#[event]
pub struct DepositCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub state_nonce: u128,
    pub timestamp: i64,
}
