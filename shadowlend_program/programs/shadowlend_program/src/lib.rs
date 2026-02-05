use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Computation definition offsets for Arcium circuits
pub const COMP_DEF_OFFSET_DEPOSIT: u32 = comp_def_offset("deposit");
pub const COMP_DEF_OFFSET_WITHDRAW: u32 = comp_def_offset("withdraw");

#[event]
pub struct UserConfidentialState {
    pub user_obligation: Pubkey,
    pub encrypted_state: [u8; 96], 
    pub nonce: u128,
}

pub const COMP_DEF_OFFSET_BORROW: u32 = comp_def_offset("borrow");
pub const COMP_DEF_OFFSET_REPAY: u32 = comp_def_offset("repay");
pub const COMP_DEF_OFFSET_LIQUIDATE: u32 = comp_def_offset("liquidate");
pub const COMP_DEF_OFFSET_SPEND: u32 = comp_def_offset("spend");

declare_id!("CiCw5JPuC7oHRvEzhcmKYYBmYDVSUZxQG4hHMAarPUvE");

#[arcium_program]
pub mod shadowlend_program {
    use super::*;
    use crate::error::ErrorCode;
    use crate::instructions::{
        Borrow, BorrowCallback, ClosePool, Deposit, DepositCallback, InitializePool, Liquidate,
        LiquidateCallback, Repay, RepayCallback, Spend, SpendCallback, Withdraw, WithdrawCallback,
    };

    /// Initializes the lending pool with risk parameters.
    ///
    /// Creates the pool account and configures LTV and liquidation thresholds.
    /// This is a one-time setup instruction.
    ///
    /// # Arguments
    /// * `ltv_bps` - Loan-to-Value ratio in basis points (7500 = 75%)
    /// * `liquidation_threshold` - Threshold for liquidation in basis points
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ltv_bps: u16,
        liquidation_threshold: u16,
    ) -> Result<()> {
        crate::instructions::initialize_pool_handler(ctx, ltv_bps, liquidation_threshold)
    }

    /// Deposits collateral tokens and queues confidential balance update.
    ///
    /// Transfers tokens to the collateral vault and initiates an MPC computation
    /// to update the user's encrypted deposit balance.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique identifier for this Arcium computation
    /// * `amount` - Token amount to deposit
    /// * `user_pubkey` - User's X25519 public key for output encryption
    /// * `user_nonce` - Nonce for encryption freshness
    pub fn deposit(
        ctx: Context<Deposit>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::deposit_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
        )
    }

    /// Callback invoked by Arcium MXE after deposit computation completes.
    ///
    /// Verifies the MPC computation output signature and updates the user's
    /// encrypted deposit balance on-chain with the new encrypted value.
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs from the MPC cluster
    #[arcium_callback(encrypted_ix = "deposit")]
    pub fn deposit_callback(
        ctx: Context<DepositCallback>,
        output: SignedComputationOutputs<DepositOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => {
                o
            }
            Err(e) => {
                msg!("Deposit verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let user_obligation = &mut ctx.accounts.user_obligation;

        // Access UserState fields from result.field_0 which is SharedEncryptedStruct
        let state = result.field_0;

        // Unpack ciphertexts: [deposit, debt, internal]
        let c = &state.ciphertexts;
        if c.len() >= 3 {
            user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
            user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
            user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
        }

        user_obligation.is_initialized = true;
        user_obligation.state_nonce += 1;

        emit!(UserConfidentialState {
            user_obligation: user_obligation.key(),
            encrypted_state: user_obligation.encrypted_state,
            nonce: user_obligation.state_nonce,
        });

        Ok(())
    }

    /// Initiates a borrow request with confidential health check.
    ///
    /// Queues an MPC computation to verify the health factor remains above
    /// the liquidation threshold. If approved, internal credit is increased.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique identifier for this Arcium computation
    /// * `amount` - Encrypted token amount to borrow
    pub fn borrow(
        ctx: Context<Borrow>,
        computation_offset: u64,
        amount: [u8; 32],
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::borrow_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
        )
    }

    /// Callback invoked by Arcium MXE after borrow health check completes.
    ///
    /// Verifies the MPC output and, if approved, updates encrypted debt and
    /// encrypted internal balance. No token transfer occurs here (V3).
    ///
    /// # Arguments
    /// * `output` - Contains: new_state, approval_status
    #[arcium_callback(encrypted_ix = "borrow")]
    pub fn borrow_callback(
        ctx: Context<BorrowCallback>,
        output: SignedComputationOutputs<BorrowOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => {
                o
            }
            Err(e) => {
                msg!("Borrow verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let inner = result.field_0;
        let state = inner.field_0;
        let approved = inner.field_1;

        if approved == 1 {
            let user_obligation = &mut ctx.accounts.user_obligation;

            let c = &state.ciphertexts;
            if c.len() >= 3 {
                user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
                user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
                user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
            }

            user_obligation.state_nonce += 1;

            emit!(UserConfidentialState {
                user_obligation: user_obligation.key(),
                encrypted_state: user_obligation.encrypted_state,
                nonce: user_obligation.state_nonce,
            });
        } else {
            msg!("Borrow rejected by health check (approved=0)");
        }

        Ok(())
    }

    /// Initiates a withdrawal request with confidential health check.
    ///
    /// Queues an MPC computation to verify the health factor remains above
    /// the liquidation threshold after withdrawal. Token transfer occurs in callback.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique identifier for this Arcium computation
    /// * `amount` - Token amount to withdraw
    pub fn withdraw(
        ctx: Context<Withdraw>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::withdraw_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
        )
    }

    /// Callback invoked by Arcium MXE after withdraw health check completes.
    ///
    /// Verifies the MPC output and, if approved, updates encrypted collateral and
    /// transfers tokens from the collateral vault to user using PDA signer.
    ///
    /// # Arguments
    /// * `output` - Contains: new_state, approval_status (1/0), amount
    #[arcium_callback(encrypted_ix = "withdraw")]
    pub fn withdraw_callback(
        ctx: Context<WithdrawCallback>,
        output: SignedComputationOutputs<WithdrawOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("Withdraw verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let inner = result.field_0;
        let state = inner.field_0;
        let approved = inner.field_1;
        let amount = inner.field_2;

        if approved == 1 {
            let user_obligation = &mut ctx.accounts.user_obligation;

            let c = &state.ciphertexts;

            if c.len() >= 3 {
                user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
                user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
                user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
            }

            user_obligation.state_nonce += 1;

            emit!(UserConfidentialState {
                user_obligation: user_obligation.key(),
                encrypted_state: user_obligation.encrypted_state,
                nonce: user_obligation.state_nonce,
            });

            // Vault PDA signs the transfer
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"collateral_vault",
                pool_key.as_ref(),
                &[ctx.bumps.collateral_vault],
            ];
            let signer = &[&seeds[..]];

            let transfer_cpi = Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.collateral_vault.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                amount,
            )?;

            msg!("Withdraw approved, transferred {} tokens", amount);

            // Update global deposit counter
            let pool = &mut ctx.accounts.pool;
            pool.total_deposits = pool.total_deposits.checked_sub(amount).unwrap_or(0);
        } else {
            msg!("Withdraw rejected by health check");
        }

        Ok(())
    }

    /// Repays borrowed tokens and queues confidential debt update.
    ///
    /// Transfers repayment tokens to the borrow vault and initiates an MPC
    /// computation to update the user's encrypted debt balance.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique identifier for this Arcium computation
    /// * `amount` - Token amount to repay
    pub fn repay(
        ctx: Context<Repay>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::repay_handler(ctx, computation_offset, amount, user_pubkey, user_nonce)
    }

    /// Callback invoked by Arcium MXE after repayment computation completes.
    ///
    /// Verifies the MPC computation output and updates the user's encrypted
    /// debt balance with the new value after repayment.
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs containing new encrypted state
    #[arcium_callback(encrypted_ix = "repay")]
    pub fn repay_callback(
        ctx: Context<RepayCallback>,
        output: SignedComputationOutputs<RepayOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o, 
            Err(e) => {
                msg!("Repay verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let user_obligation = &mut ctx.accounts.user_obligation;
        let state = result.field_0;

        let c = &state.ciphertexts;
        if c.len() >= 3 {
            user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
            user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
            user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
        }

        user_obligation.is_initialized = true; // Ensure flag is set on first interaction if any
        user_obligation.state_nonce += 1;

        emit!(UserConfidentialState {
            user_obligation: user_obligation.key(),
            encrypted_state: user_obligation.encrypted_state,
            nonce: user_obligation.state_nonce,
        });

        Ok(())
    }

    /// Initiates a confidential liquidation.
    ///
    /// Liquidator transfers repayment tokens to escrow.
    /// MPC verifies if user is unhealthy. If so, seizes collateral.
    /// If healthy, refund.
    pub fn liquidate(
        ctx: Context<Liquidate>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::liquidate_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
        )
    }

    /// Callback for liquidation.
    #[arcium_callback(encrypted_ix = "liquidate")]
    pub fn liquidate_callback(
        ctx: Context<LiquidateCallback>,
        output: SignedComputationOutputs<LiquidateOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("Liquidate verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let inner = result.field_0;
        let state = inner.field_0;

        // Encrypted outputs are wrapped in structs with 'ciphertexts' field
        let is_liquidatable = inner.field_1; // 1 or 0
        let seized_collateral = inner.field_2;
        let repaid_amount = inner.field_3; // Echoed back amount

        let user_obligation = &mut ctx.accounts.user_obligation;

        // Always update state (nonce, encrypted balances)
        let c = &state.ciphertexts;
        if c.len() >= 3 {
            user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
            user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
            user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
        }

        user_obligation.state_nonce += 1;

        emit!(UserConfidentialState {
            user_obligation: user_obligation.key(),
            encrypted_state: user_obligation.encrypted_state,
            nonce: user_obligation.state_nonce,
        });

        if is_liquidatable == 1 {
            msg!("Liquidation SUCCESS. User was unhealthy.");
            msg!("Seizing {} collateral to liquidator.", seized_collateral);

            // Transfer Collateral -> Liquidator
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"collateral_vault",
                pool_key.as_ref(),
                &[ctx.bumps.collateral_vault],
            ];
            let signer = &[&seeds[..]];

            let transfer_cpi = Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.liquidator_collateral_account.to_account_info(),
                authority: ctx.accounts.collateral_vault.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                seized_collateral,
            )?;

            // Update Global Stats
            let pool = &mut ctx.accounts.pool;
            // Collateral decreased by seized_collateral (removed from vault)
            pool.total_deposits = pool
                .total_deposits
                .checked_sub(seized_collateral)
                .unwrap_or(0);
        } else {
            msg!("Liquidation FAILED. User is healthy.");
            msg!("Refunding {} tokens to liquidator.", repaid_amount);

            // Refund Repayment: Borrow Vault -> Liquidator
            // The liquidator sent tokens to BorrowVault in handler. Now we send them back.
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"borrow_vault",
                pool_key.as_ref(),
                &[ctx.bumps.borrow_vault],
            ];
            let signer = &[&seeds[..]];

            let transfer_cpi = Transfer {
                from: ctx.accounts.borrow_vault.to_account_info(),
                to: ctx.accounts.liquidator_borrow_account.to_account_info(),
                authority: ctx.accounts.borrow_vault.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                repaid_amount,
            )?;
        }

        Ok(())
    }

    /// Initializes deposit computation definition
    pub fn init_deposit_comp_def(ctx: Context<InitDepositCompDef>) -> Result<()> {
        crate::instructions::admin::init_deposit_comp_def_handler(ctx)
    }

    /// Initializes withdraw computation definition
    pub fn init_withdraw_comp_def(ctx: Context<InitWithdrawCompDef>) -> Result<()> {
        crate::instructions::admin::init_withdraw_comp_def_handler(ctx)
    }

    /// Initializes borrow computation definition
    pub fn init_borrow_comp_def(ctx: Context<InitBorrowCompDef>) -> Result<()> {
        crate::instructions::admin::init_borrow_comp_def_handler(ctx)
    }

    /// Initializes repay computation definition
    pub fn init_repay_comp_def(ctx: Context<InitRepayCompDef>) -> Result<()> {
        crate::instructions::admin::init_repay_comp_def_handler(ctx)
    }

    /// Initializes liquidate computation definition
    pub fn init_liquidate_comp_def(ctx: Context<InitLiquidateCompDef>) -> Result<()> {
        crate::instructions::admin::init_liquidate_comp_def_handler(ctx)
    }

    /// Initiates a confidential spend.
    ///
    /// Checks if internal balance is sufficient and updates it.
    /// Queues computation.
    pub fn spend(
        ctx: Context<Spend>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::spend_handler(ctx, computation_offset, amount, user_pubkey, user_nonce)
    }

    /// Callback for confidential spend.
    ///
    /// Updates internal balance and transfers tokens if approved.
    #[arcium_callback(encrypted_ix = "spend")]
    pub fn spend_callback(
        ctx: Context<SpendCallback>,
        output: SignedComputationOutputs<SpendOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("Spend verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Output: (NewInternal, Approved(u8), Amount(u64))
        // Parse circuit results: (Enc<Shared, u128>, u8, u64)

        let inner = result.field_0;
        let state = inner.field_0;
        let approved = inner.field_1;
        let amount = inner.field_2;

        if approved == 1 {
            let user_obligation = &mut ctx.accounts.user_obligation;

            // Update the confidential balance on the user obligation
            let c = &state.ciphertexts;
            if c.len() >= 3 {
                user_obligation.encrypted_state[0..32].copy_from_slice(&c[0]);
                user_obligation.encrypted_state[32..64].copy_from_slice(&c[1]);
                user_obligation.encrypted_state[64..96].copy_from_slice(&c[2]);
            }

            user_obligation.state_nonce += 1;

            emit!(UserConfidentialState {
                user_obligation: user_obligation.key(),
                encrypted_state: user_obligation.encrypted_state,
                nonce: user_obligation.state_nonce,
            });

            // Prepare PDA seeds for the borrow vault to sign the outgoing transfer
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"borrow_vault",
                pool_key.as_ref(),
                &[ctx.bumps.borrow_vault],
            ];
            let signer = &[&seeds[..]];

            let transfer_cpi = Transfer {
                from: ctx.accounts.borrow_vault.to_account_info(),
                to: ctx.accounts.destination_token_account.to_account_info(),
                authority: ctx.accounts.borrow_vault.to_account_info(),
            };

            msg!(
                "Spend approved. Executing public transfer of {} tokens.",
                amount
            );

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                amount,
            )?;

            // Total borrows tracking is removed as it cannot be accurate with confidential borrows
        } else {
            msg!("Spend rejected: Insufficient internal balance.");
        }

        Ok(())
    }

    /// Initializes spend computation definition
    pub fn init_spend_comp_def(ctx: Context<InitSpendCompDef>) -> Result<()> {
        crate::instructions::admin::init_spend_comp_def_handler(ctx)
    }

    /// Closes the lending pool (admin only)
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        crate::instructions::close_pool_handler(ctx)
    }
}
