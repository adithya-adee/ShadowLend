use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;

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

/// Process MXE result and transfer tokens
/// Uses modern Arcium SDK with auto-deserialized output
pub fn deposit_callback_handler(
    ctx: Context<ComputeDepositCallback>,
    output: SignedComputationOutputs<ComputeDepositOutput>,
) -> Result<()> {
    // Verify MXE output signature - SDK auto-deserializes
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

    // Modern Arcium SDK: result is SharedEncryptedStruct<N>
    // DepositOutput has:
    // - new_state: UserState (4 fields = 4 ciphertexts)
    // - deposit_delta: u64 (revealed = plaintext, but still in ciphertext array)
    //
    // With .reveal(), the deposit_delta becomes a plaintext scalar
    // It's stored in the ciphertexts array but is actually plaintext
    require!(
        !result.ciphertexts.is_empty(),
        ErrorCode::InvalidComputationOutput
    );

    // deposit_delta is the last field, revealed as plaintext u64
    // Position: after UserState (4 fields) = index 4
    let deposit_delta_idx = result.ciphertexts.len() - 1;
    let deposit_amount = u64::from_le_bytes(
        result.ciphertexts[deposit_delta_idx][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?
    );

    require!(deposit_amount > 0, ErrorCode::InvalidDepositAmount);

    msg!("Deposit amount: {} (revealed)", deposit_amount);

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

    msg!("Token transfer completed");

    // Update user obligation with new encrypted state
    let user_obligation = &mut ctx.accounts.user_obligation;

    // Increment nonce BEFORE state update for replay protection
    user_obligation.state_nonce = user_obligation
        .state_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    // Store the encrypted state (all ciphertexts except the revealed delta)
    // UserState occupies first 4 ciphertexts
    let state_ciphertexts: Vec<u8> = result.ciphertexts[..4]
        .iter()
        .flat_map(|c| c.to_vec())
        .collect();
    user_obligation.encrypted_state_blob = state_ciphertexts;

    // Update state commitment using deterministic XOR-fold for integrity protection
    // This creates a 32-byte commitment from the encrypted state
    let mut commitment = [0u8; 32];
    for (i, byte) in user_obligation.encrypted_state_blob.iter().enumerate() {
        commitment[i % 32] ^= byte;
    }
    user_obligation.state_commitment = commitment;

    user_obligation.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("User obligation state updated");

    // Update pool aggregates
    let pool = &mut ctx.accounts.pool;
    pool.total_deposits = pool
        .total_deposits
        .checked_add(deposit_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.last_update_ts = Clock::get()?.unix_timestamp;

    msg!("Pool state updated");

    // Emit event - deposit_amount is public (revealed)
    emit!(DepositCompleted {
        user: user_obligation.user,
        pool: ctx.accounts.pool.key(),
        amount: deposit_amount,
        state_nonce: user_obligation.state_nonce,
        timestamp: user_obligation.last_update_ts,
    });

    Ok(())
}

/// Deposit completion event
/// Note: amount is public because it's revealed for token transfer
#[event]
pub struct DepositCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub state_nonce: u64,
    pub timestamp: i64,
}
