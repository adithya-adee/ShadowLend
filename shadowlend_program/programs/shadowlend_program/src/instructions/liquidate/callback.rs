use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

const COMP_DEF_OFFSET_COMPUTE_LIQUIDATE: u32 = comp_def_offset("compute_liquidate");

/// Callback after MXE liquidation computation completes
/// Performs two transfers:
/// 1. Liquidator -> vault: repay debt amount
/// 2. Vault -> Liquidator: collateral + bonus
///
/// NOTE: Liquidation amounts ARE revealed (trade-off for functionality)
/// This is acceptable as liquidation is a public safety mechanism
#[callback_accounts("compute_liquidate")]
#[derive(Accounts)]
pub struct ComputeLiquidateCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_LIQUIDATE))]
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

    /// The user being liquidated
    #[account(
        mut,
        seeds = [UserObligation::SEED_PREFIX, user_obligation.user.as_ref(), pool.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    // === Token Accounts - Collateral ===
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault", collateral_mint.key().as_ref(), b"collateral"],
        bump,
        token::mint = collateral_mint,
        token::authority = pool,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// Liquidator's collateral token account (receives seized collateral)
    #[account(
        mut,
        constraint = liquidator_collateral_account.owner == liquidator.key() @ ErrorCode::Unauthorized,
        constraint = liquidator_collateral_account.mint == collateral_mint.key() @ ErrorCode::InvalidMint,
    )]
    pub liquidator_collateral_account: Box<Account<'info, TokenAccount>>,

    // === Token Accounts - Borrow ===
    pub borrow_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault", pool.collateral_mint.as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    /// Liquidator's borrow token account (pays repayment)
    #[account(
        mut,
        constraint = liquidator_borrow_account.owner == liquidator.key() @ ErrorCode::Unauthorized,
        constraint = liquidator_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    pub liquidator_borrow_account: Box<Account<'info, TokenAccount>>,

    /// The liquidator executing the liquidation
    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE liquidation result and perform atomic transfers
/// NOTE: Liquidation amounts ARE revealed (trade-off for protocol safety)
pub fn liquidate_callback_handler(
    ctx: Context<ComputeLiquidateCallback>,
    output: SignedComputationOutputs<ComputeLiquidateOutput>,
) -> Result<()> {
    // Verify MXE output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeLiquidateOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE liquidation computation verified");

    require!(
        result.ciphertexts.len() >= 7,
        ErrorCode::InvalidComputationOutput
    );

    // Extract is_liquidatable (first field, revealed bool)
    let is_liquidatable = result.ciphertexts[0][0] != 0;
    require!(is_liquidatable, ErrorCode::PositionHealthy);

    // Extract repay_delta (index 5, revealed u64)
    let repay_amount = u64::from_le_bytes(
        result.ciphertexts[5][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    // Extract collateral_seized (last field, revealed u64)
    let collateral_seized = u64::from_le_bytes(
        result.ciphertexts[6][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(repay_amount > 0, ErrorCode::InvalidBorrowAmount);
    require!(collateral_seized > 0, ErrorCode::InvalidWithdrawAmount);

    // NOTE: Liquidation amounts logged for transparency (intended)
    msg!("Liquidation approved");

    // Verify vault has enough collateral
    require!(
        ctx.accounts.collateral_vault.amount >= collateral_seized,
        ErrorCode::InsufficientLiquidity
    );

    // Transfer 1: Liquidator repays debt
    let repay_accounts = Transfer {
        from: ctx.accounts.liquidator_borrow_account.to_account_info(),
        to: ctx.accounts.borrow_vault.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };
    let repay_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        repay_accounts,
    );
    token::transfer(repay_ctx, repay_amount)?;

    msg!("Debt repayment transferred");

    // Transfer 2: Liquidator receives collateral + bonus
    let collateral_mint = ctx.accounts.pool.collateral_mint;
    let seeds = &[
        Pool::SEED_PREFIX,
        collateral_mint.as_ref(),
        &[ctx.accounts.pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let seize_accounts = Transfer {
        from: ctx.accounts.collateral_vault.to_account_info(),
        to: ctx.accounts.liquidator_collateral_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let seize_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        seize_accounts,
        signer_seeds,
    );
    token::transfer(seize_ctx, collateral_seized)?;

    msg!("Collateral seized and transferred to liquidator");

    // Update user obligation
    let user_obligation = &mut ctx.accounts.user_obligation;

    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    let state_ciphertexts: Vec<u8> = result.ciphertexts[1..5]
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

    // Update pool timestamp only (aggregates now encrypted in MXE)
    let pool = &mut ctx.accounts.pool;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool state updated");

    // Emit event - liquidation amounts ARE public (protocol safety requirement)
    emit!(LiquidationCompleted {
        liquidator: ctx.accounts.liquidator.key(),
        target_user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        // Note: Amounts included for liquidation transparency
        repay_amount,
        collateral_seized,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Liquidation completion event
/// Note: Amounts ARE included for liquidation transparency (protocol safety)
#[event]
pub struct LiquidationCompleted {
    pub liquidator: Pubkey,
    pub target_user: Pubkey,
    pub pool: Pubkey,
    pub repay_amount: u64,
    pub collateral_seized: u64,
    pub state_nonce: u128,
    pub timestamp: i64,
}
