use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_deposit");

/// Callback after MXE computation completes
/// Performs token transfer AFTER verification
#[callback_accounts("compute_deposit")]
#[derive(Accounts)]
pub struct ComputeDepositCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
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
        constraint = user_token_account.mint == collateral_mint.key(),
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

/// Process MXE result and transfer tokens
pub fn deposit_callback_handler(
    ctx: Context<ComputeDepositCallback>,
    output: SignedComputationOutputs<ComputeDepositOutput>,
) -> Result<()> {
    // Verify MXE output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeDepositOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE computation verified");

    // TODO: Properly deserialize DepositOutput struct from result
    // Currently extracting amount from ciphertext bytes (hacky)
    let deposit_amount = u64::from_le_bytes(
        result.ciphertexts[0][24..32].try_into().unwrap()
    );

    msg!("Verified deposit amount: {}", deposit_amount);

    // Transfer tokens from user to vault
    let transfer_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    token::transfer(transfer_ctx, deposit_amount)?;

    msg!("Transferred {} tokens to vault", deposit_amount);

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;
    user_obligation.encrypted_state_blob = result.ciphertexts[0].to_vec();
    
    // TODO: Use proper hash function (keccak256 or sha256) via syscall
    // Currently using first 32 bytes of encrypted blob as commitment
    let commitment_bytes = if user_obligation.encrypted_state_blob.len() >= 32 {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&user_obligation.encrypted_state_blob[..32]);
        arr
    } else {
        [0u8; 32]
    };
    user_obligation.state_commitment = commitment_bytes;

    user_obligation.state_nonce += 1;
    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Updated user obligation, nonce: {}", user_obligation.state_nonce);

    // Update pool aggregates
    let pool = &mut ctx.accounts.pool;
    pool.total_deposits = pool.total_deposits
        .checked_add(deposit_amount as u128)
        .ok_or(ErrorCode::InvalidDepositAmount)?;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool total_deposits: {}", pool.total_deposits);

    emit!(DepositCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        amount: deposit_amount,
        state_nonce: user_obligation.state_nonce,
    });

    Ok(())
}

#[event]
pub struct DepositCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub state_nonce: u64,
}
