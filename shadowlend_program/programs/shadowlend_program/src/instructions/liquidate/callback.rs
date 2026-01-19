use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};
use crate::ID;
use arcium_client::idl::arcium::ID_CONST;
use solana_keccak_hasher::hashv;

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_confidential_liquidate");

/// Callback accounts for confidential liquidation MXE computation
/// NOTE: Liquidation amounts ARE revealed (protocol safety requirement)
#[callback_accounts("compute_confidential_liquidate")]
#[derive(Accounts)]
pub struct ComputeConfidentialLiquidateCallback<'info> {
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

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault", collateral_mint.key().as_ref(), pool.borrow_mint.as_ref(), b"collateral"],
        bump,
        token::mint = collateral_mint,
        token::authority = pool,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = liquidator_collateral_account.owner == liquidator.key() @ ErrorCode::Unauthorized,
        constraint = liquidator_collateral_account.mint == collateral_mint.key() @ ErrorCode::InvalidMint,
    )]
    pub liquidator_collateral_account: Box<Account<'info, TokenAccount>>,

    pub borrow_mint: Box<Account<'info, Mint>>,

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
        constraint = liquidator_borrow_account.owner == liquidator.key() @ ErrorCode::Unauthorized,
        constraint = liquidator_borrow_account.mint == borrow_mint.key() @ ErrorCode::InvalidMint,
        constraint = borrow_mint.key() == pool.borrow_mint @ ErrorCode::InvalidMint,
    )]
    pub liquidator_borrow_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Verified via constraint
    #[account(mut)]
    pub liquidator: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

/// Process MXE liquidation result - performs atomic debt repayment and collateral seizure
pub fn liquidate_callback_handler(
    ctx: Context<ComputeConfidentialLiquidateCallback>,
    output: SignedComputationOutputs<ComputeConfidentialLiquidateOutput>,
) -> Result<()> {
    // Verify MXE output signature - output is a tuple struct wrapped in field_0
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeConfidentialLiquidateOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    msg!("MXE liquidation computation verified");

    // Access user output (field_0 of the tuple struct) and pool output (field_1)
    let user_output = &result.field_0;
    let pool_output = &result.field_1;

    require!(
        user_output.ciphertexts.len() >= 7,
        ErrorCode::InvalidComputationOutput
    );

    // Index 4: Liquidated flag (bool)
    // Index 4: Liquidated flag (bool)
    let is_liquidatable = user_output.ciphertexts[4][0] != 0;

    // Index 5: Revealed Repay Amount (u64)
    let repay_amount = u64::from_le_bytes(
        user_output.ciphertexts[5][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?,
    );

    // Index 6: Revealed Seized Collateral (u64)
    let collateral_seized = u64::from_le_bytes(
        user_output.ciphertexts[6][0..8]
            .try_into()
            .map_err(|_| ErrorCode::InvalidComputationOutput)?,
    );

    // Prepare signer seeds for vault transfers
    let collateral_mint = ctx.accounts.pool.collateral_mint;
    let borrow_mint = ctx.accounts.pool.borrow_mint;
    let seeds = &[
        Pool::SEED_PREFIX,
        collateral_mint.as_ref(),
        borrow_mint.as_ref(),
        &[ctx.accounts.pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    if is_liquidatable {
        require!(repay_amount > 0, ErrorCode::InvalidBorrowAmount);
        require!(collateral_seized > 0, ErrorCode::InvalidWithdrawAmount);
        require!(
            ctx.accounts.collateral_vault.amount >= collateral_seized,
            ErrorCode::InsufficientLiquidity
        );

        // Seize Collateral: Transfer from Collateral Vault to Liquidator
        let seize_accounts = Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.liquidator_collateral_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                seize_accounts,
                signer_seeds,
            ),
            collateral_seized,
        )?;

        // Update user obligation state
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

        emit!(LiquidationCompleted {
            liquidator: ctx.accounts.liquidator.key(),
            target_user: user_obligation.user,
            pool: ctx.accounts.pool.key(),
            repay_amount,
            collateral_seized,
            state_nonce: user_obligation.state_nonce,
            timestamp: user_obligation.last_update_ts,
            success: true,
        });
    } else {
        // Refund Repayment: Transfer from Borrow Vault back to Liquidator
        if repay_amount > 0 {
            let refund_accounts = Transfer {
                from: ctx.accounts.borrow_vault.to_account_info(),
                to: ctx.accounts.liquidator_borrow_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    refund_accounts,
                    signer_seeds,
                ),
                repay_amount,
            )?;
        }

        msg!("Liquidation invalid: Refunded {}", repay_amount);

        // Emit failure event (no state change)
        emit!(LiquidationCompleted {
            liquidator: ctx.accounts.liquidator.key(),
            target_user: ctx.accounts.user_obligation.user,
            pool: ctx.accounts.pool.key(),
            repay_amount,
            collateral_seized: 0,
            state_nonce: ctx.accounts.user_obligation.state_nonce,
            timestamp: Clock::get()?.unix_timestamp,
            success: false,
        });
    }

    Ok(())
}

/// Liquidation event (amounts included for transparency)
#[event]
pub struct LiquidationCompleted {
    pub liquidator: Pubkey,
    pub target_user: Pubkey,
    pub pool: Pubkey,
    pub repay_amount: u64,
    pub collateral_seized: u64,
    pub state_nonce: u128,
    pub timestamp: i64,
    pub success: bool,
}
