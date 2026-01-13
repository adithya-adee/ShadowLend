use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET_COMPUTE_REPAY: u32 = comp_def_offset("compute_repay");

/// Callback after MXE repay computation completes
/// Performs token transfer (user -> vault) AFTER verification
#[callback_accounts("compute_repay")]
#[derive(Accounts)]
pub struct ComputeRepayCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_REPAY))]
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
    pub borrow_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = user_borrow_account.owner == user.key() @ ErrorCode::Unauthorized,
        constraint = user_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    pub user_borrow_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault", pool.collateral_mint.as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Verified via user_obligation.user constraint
    #[account(constraint = user.key() == user_obligation.user)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE repay result and transfer tokens from user to vault
/// Uses modern Arcium SDK with auto-deserialized output
///
/// RepayOutput layout:
/// - new_state: UserState (4 fields encrypted)
/// - repay_delta: u64 (revealed) - Amount repaid
pub fn repay_callback_handler(
    ctx: Context<ComputeRepayCallback>,
    output: SignedComputationOutputs<ComputeRepayOutput>,
) -> Result<()> {
    // Verify MXE output signature - SDK auto-deserializes
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeRepayOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE repay computation verified");

    // Validate result structure
    // RepayOutput: [new_state(4), repay_delta(1)] = 5 ciphertexts
    require!(
        !result.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // Extract repay_delta (last field, revealed u64)
    let repay_delta_idx = result.ciphertexts.len() - 1;
    let repay_amount = u64::from_le_bytes(
        result.ciphertexts[repay_delta_idx][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(repay_amount > 0, ErrorCode::InvalidBorrowAmount);

    msg!("Repay amount: {} (revealed)", repay_amount);

    // Transfer tokens from user to vault
    let transfer_accounts = Transfer {
        from: ctx.accounts.user_borrow_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    token::transfer(transfer_ctx, repay_amount)?;

    msg!("Token transfer completed");

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;

    // Increment nonce BEFORE state update for replay protection
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store the encrypted state (first 4 ciphertexts = new_state)
    let state_ciphertexts: Vec<u8> = result.ciphertexts[..4]
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

    // Update pool aggregates (decrease total borrows)
    let pool = &mut ctx.accounts.pool;
    pool.total_borrows = pool
        .total_borrows
        .checked_sub(repay_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool state updated");

    // Emit event - repay_amount is public (revealed for token transfer)
    emit!(RepayCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        amount: repay_amount,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Repay completion event
/// Note: amount is public because it's revealed for token transfer
#[event]
pub struct RepayCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub state_nonce: u64,
    pub timestamp: i64,
}
