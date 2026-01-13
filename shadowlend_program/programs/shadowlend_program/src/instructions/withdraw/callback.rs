use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET_COMPUTE_WITHDRAW: u32 = comp_def_offset("compute_withdraw");

/// Callback after MXE withdraw computation completes
/// Performs token transfer (vault -> user) AFTER verification
#[callback_accounts("compute_withdraw")]
#[derive(Accounts)]
pub struct ComputeWithdrawCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_WITHDRAW))]
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

    // === Token Accounts ===
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

/// Process MXE withdraw result and transfer tokens from vault to user
/// Uses modern Arcium SDK with auto-deserialized output
///
/// WithdrawOutput layout:
/// - approved: bool (revealed) - Whether withdrawal is safe
/// - new_state: UserState (4 fields encrypted)
/// - withdraw_delta: u64 (revealed) - Amount to withdraw
pub fn withdraw_callback_handler(
    ctx: Context<ComputeWithdrawCallback>,
    output: SignedComputationOutputs<ComputeWithdrawOutput>,
) -> Result<()> {
    // Verify MXE output signature - SDK auto-deserializes
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeWithdrawOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE withdraw computation verified");

    // Validate result structure
    // WithdrawOutput: [approved(1), new_state(4), withdraw_delta(1)] = 6 ciphertexts
    require!(
        result.ciphertexts.len() >= 6,
        ErrorCode::InvalidComputationOutput
    );

    // Extract approved (first field, revealed bool)
    let approved = result.ciphertexts[0][0] != 0;
    require!(approved, ErrorCode::WithdrawRejected);

    // Extract withdraw_delta (last field, revealed u64)
    let withdraw_delta_idx = result.ciphertexts.len() - 1;
    let withdraw_amount = u64::from_le_bytes(
        result.ciphertexts[withdraw_delta_idx][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(withdraw_amount > 0, ErrorCode::InvalidWithdrawAmount);

    msg!("Withdraw approved, amount: {} (revealed)", withdraw_amount);

    // Check vault has sufficient balance
    require!(
        ctx.accounts.collateral_vault.amount >= withdraw_amount,
        ErrorCode::InsufficientLiquidity
    );

    // Transfer tokens from vault to user (pool PDA signs)
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

    msg!("Token transfer completed");

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;

    // Increment nonce BEFORE state update for replay protection
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store the encrypted state (ciphertexts 1-4, which is new_state)
    let state_ciphertexts: Vec<u8> = result.ciphertexts[1..5]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    // Update state commitment
    let commitment_bytes = if user_obligation.encrypted_state_blob.len() >= 32 {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&user_obligation.encrypted_state_blob[..32]);
        arr
    } else {
        [0u8; 32]
    };
    user_obligation.state_commitment = commitment_bytes;

    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("User obligation state updated");

    // Update pool aggregates (decrease total deposits)
    let pool = &mut ctx.accounts.pool;
    pool.total_deposits = pool
        .total_deposits
        .checked_sub(withdraw_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool state updated");

    // Emit event - withdraw_amount is public (revealed for token transfer)
    emit!(WithdrawCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        amount: withdraw_amount,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Withdraw completion event
/// Note: amount is public because it's revealed for token transfer
#[event]
pub struct WithdrawCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub state_nonce: u64,
    pub timestamp: i64,
}
