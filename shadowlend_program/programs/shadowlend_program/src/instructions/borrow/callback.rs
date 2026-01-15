use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;
use solana_keccak_hasher::hashv;

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_confidential_borrow");

/// Callback accounts for confidential borrow MXE computation
#[callback_accounts("compute_confidential_borrow")]
#[derive(Accounts)]
pub struct ComputeConfidentialBorrowCallback<'info> {
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

    pub borrow_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    /// CHECK: Validated above
    pub borrow_mint_check: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault", pool.collateral_mint.as_ref(), pool.borrow_mint.as_ref(), b"borrow"],
        bump,
        token::mint = borrow_mint,
        token::authority = pool,
    )]
    pub borrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_borrow_account.owner == user.key() @ ErrorCode::Unauthorized,
        constraint = user_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
    )]
    pub user_borrow_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Verified via user_obligation.user constraint
    #[account(constraint = user.key() == user_obligation.user)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE borrow result - transfers tokens from vault to user
pub fn borrow_callback_handler(
    ctx: Context<ComputeConfidentialBorrowCallback>,
    output: SignedComputationOutputs<ComputeConfidentialBorrowOutput>,
) -> Result<()> {
    // Verify MXE output signature - output is a tuple struct wrapped in field_0
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeConfidentialBorrowOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE borrow computation verified");

    // Access user output (field_0 of the tuple struct)
    // field_0: ConfidentialBorrowOutput (Shared), field_1: PoolState (MXE)
    let user_output = &result.field_0;
    
    // Validating output length (UserState [4] + Approved [1] + Amount [1] = 6)
    require!(
        user_output.ciphertexts.len() >= 6,
        ErrorCode::InvalidComputationOutput
    );

    // Index 4: Approval flag (bool)
    // Note: Arcium booleans are often returned as a byte/field element. 
    // Checking first byte != 0 is standard.
    let approved = user_output.ciphertexts[4][0] != 0;
    require!(approved, ErrorCode::BorrowRejected);

    // Index 5: Revealed Borrow Amount (u64)
    let borrow_amount = u64::from_le_bytes(
        user_output.ciphertexts[5][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(borrow_amount > 0, ErrorCode::InvalidBorrowAmount);
    require!(
        ctx.accounts.borrow_vault.amount >= borrow_amount,
        ErrorCode::InsufficientLiquidity
    );

    // Transfer tokens from vault to user
    let collateral_mint = ctx.accounts.pool.collateral_mint;
    let borrow_mint = ctx.accounts.pool.borrow_mint;
    let seeds = &[
        Pool::SEED_PREFIX,
        collateral_mint.as_ref(),
        borrow_mint.as_ref(),
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

    // Update user obligation state
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store encrypted state (user state occupies first few ciphertexts)
    let state_ciphertexts: Vec<u8> = user_output.ciphertexts[..4]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    // Compute keccak256 commitment of encrypted state (cryptographically secure)
    let commitment = hashv(&[&user_obligation.encrypted_state_blob]);
    user_obligation.state_commitment = commitment.to_bytes();
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    emit!(BorrowCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        approved: true,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Borrow completion event (no amount for confidentiality)
#[event]
pub struct BorrowCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub approved: bool,
    pub state_nonce: u128,
    pub timestamp: i64,
}
