use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_confidential_withdraw");

/// Callback accounts for confidential withdraw MXE computation
#[callback_accounts("compute_confidential_withdraw")]
#[derive(Accounts)]
pub struct ComputeConfidentialWithdrawCallback<'info> {
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

/// Process MXE withdraw result - transfers tokens from vault to user
pub fn withdraw_callback_handler(
    ctx: Context<ComputeConfidentialWithdrawCallback>,
    output: SignedComputationOutputs<ComputeConfidentialWithdrawOutput>,
) -> Result<()> {
    // Verify MXE output signature - output is a tuple struct wrapped in field_0
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeConfidentialWithdrawOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE withdraw computation verified");

    // Access user output (field_0 of the tuple struct)
    // field_0: ConfidentialWithdrawOutput (Shared), field_1: PoolState (MXE)
    let user_output = &result.field_0;

    require!(
        !user_output.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // Extract approval and amount
    let approved = user_output.ciphertexts[0][0] != 0;
    require!(approved, ErrorCode::WithdrawRejected);

    let withdraw_delta_idx = user_output.ciphertexts.len() - 1;
    let withdraw_amount = u64::from_le_bytes(
        user_output.ciphertexts[withdraw_delta_idx][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(withdraw_amount > 0, ErrorCode::InvalidWithdrawAmount);
    require!(
        ctx.accounts.collateral_vault.amount >= withdraw_amount,
        ErrorCode::InsufficientLiquidity
    );

    // Transfer tokens from vault to user
    let collateral_mint = ctx.accounts.pool.collateral_mint;
    let seeds = &[
        Pool::SEED_PREFIX,
        collateral_mint.as_ref(),
        &[ctx.accounts.pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_accounts = Transfer {
        from: ctx.accounts.collateral_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );
    token::transfer(transfer_ctx, withdraw_amount)?;

    // Update user obligation
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    let state_ciphertexts: Vec<u8> = user_output.ciphertexts[..4]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    let mut commitment = [0u8; 32];
    for (i, byte) in user_obligation.encrypted_state_blob.iter().enumerate() {
        commitment[i % 32] ^= byte;
    }
    user_obligation.state_commitment = commitment;
    user_obligation.total_claimed = user_obligation
        .total_claimed
        .checked_add(withdraw_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    emit!(WithdrawCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        approved: true,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Withdraw completion event (no amount for confidentiality)
#[event]
pub struct WithdrawCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub approved: bool,
    pub state_nonce: u128,
    pub timestamp: i64,
}
