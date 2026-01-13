use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

const COMP_DEF_OFFSET_COMPUTE_BORROW: u32 = comp_def_offset("compute_borrow");

/// Callback after MXE borrow computation completes
/// Performs token transfer (vault -> user) AFTER verification
#[callback_accounts("compute_borrow")]
#[derive(Accounts)]
pub struct ComputeBorrowCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_BORROW))]
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
        // Validate borrow mint matches pool's borrow mint
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    /// CHECK: Validated above
    pub borrow_mint_check: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault", pool.collateral_mint.as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // Validate token account owner matches user
        constraint = user_borrow_account.owner == user.key() @ ErrorCode::Unauthorized,
        // Validate mint matches pool's borrow mint
        constraint = user_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
    )]
    pub user_borrow_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Verified via user_obligation.user constraint
    #[account(constraint = user.key() == user_obligation.user)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE borrow result and transfer tokens from vault to user
pub fn borrow_callback_handler(
    ctx: Context<ComputeBorrowCallback>,
    output: SignedComputationOutputs<ComputeBorrowOutput>,
) -> Result<()> {
    // Verify MXE output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeBorrowOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE borrow computation verified");

    // Safe ciphertext parsing with bounds checking
    require!(
        !result.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );
    require!(
        result.ciphertexts[0].len() >= 32,
        ErrorCode::InvalidComputationOutput
    );

    // Extract approval status from verified MXE output
    // Note: First byte indicates approval (bool serialized as u8)
    let approved = result.ciphertexts[0][0] != 0;

    // Check if borrow was approved by MXE (HF >= 1.0)
    require!(approved, ErrorCode::BorrowRejected);

    // Extract borrow amount from verified output
    let amount_bytes: [u8; 8] = result.ciphertexts[0][24..32]
        .try_into()
        .map_err(|_| ErrorCode::InvalidComputationOutput)?;
    let borrow_amount = u64::from_le_bytes(amount_bytes);

    // Validate amount is non-zero (economic minimum)
    require!(borrow_amount > 0, ErrorCode::InvalidBorrowAmount);

    msg!("Borrow approved, processing transfer");

    // Check vault has sufficient liquidity
    require!(
        ctx.accounts.borrow_vault.amount >= borrow_amount,
        ErrorCode::BorrowRejected
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
        from: ctx.accounts.borrow_vault.to_account_info(),
        to: ctx.accounts.user_borrow_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );
    token::transfer(transfer_ctx, borrow_amount)?;

    msg!("Token transfer completed");

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;

    // V7 FIX: Increment nonce BEFORE state update for replay protection
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    user_obligation.encrypted_state_blob = result.ciphertexts[0].to_vec();

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

    // Update pool aggregates with proper overflow handling
    let pool = &mut ctx.accounts.pool;
    pool.total_borrows = pool
        .total_borrows
        .checked_add(borrow_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool state updated");

    // PRIVACY: Emit event without plaintext amount
    // Users decrypt SignedComputationOutputs with their private key to see details
    emit!(BorrowCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        state_commitment: user_obligation.state_commitment,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Privacy-safe borrow completion event
/// Users must decrypt MXE output (Enc<Shared, BorrowOutput>) with their private key
/// to see transaction amounts. Only commitment and metadata are public.
#[event]
pub struct BorrowCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub state_commitment: [u8; 32], // Hash of encrypted state
    pub state_nonce: u64,
    pub timestamp: i64,
}
