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
pub const COMP_DEF_OFFSET_BORROW: u32 = comp_def_offset("borrow");
pub const COMP_DEF_OFFSET_REPAY: u32 = comp_def_offset("repay");
pub const COMP_DEF_OFFSET_LIQUIDATE: u32 = comp_def_offset("liquidate");

declare_id!("FpHChpheLnvPS9Qd7DyXwSrvSc3KCELkx4BC5MTE8T7k");

#[arcium_program]
pub mod shadowlend_program {
    use super::*;
    use crate::error::ErrorCode;
    use crate::instructions::{
        Borrow, BorrowCallback, ClosePool, Deposit, DepositCallback, InitializePool, Repay,
        RepayCallback, Withdraw, WithdrawCallback,
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
        msg!("Deposit callback START");
        msg!("Callback context loaded. Verifying output...");

        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(DepositOutput { field_0 }) => {
                msg!("Output verified successfully.");
                field_0
            }
            Err(e) => {
                msg!("Deposit verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let user_obligation = &mut ctx.accounts.user_obligation;
        msg!(
            "Updating user obligation. Old nonce: {}",
            user_obligation.state_nonce
        );

        user_obligation.encrypted_deposit = result.ciphertexts[0];
        user_obligation.state_nonce += 1;

        msg!(
            "Deposit callback completed. New nonce: {}",
            user_obligation.state_nonce
        );
        Ok(())
    }

    /// Initiates a borrow request with confidential health check.
    ///
    /// Queues an MPC computation to verify the health factor remains above
    /// the liquidation threshold. Token transfer occurs in callback if approved.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique identifier for this Arcium computation
    /// * `amount` - Token amount to borrow
    pub fn borrow(
        ctx: Context<Borrow>,
        computation_offset: u64,
        amount: u64,
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
    /// transfers tokens from the borrow vault to the user using PDA signer.
    ///
    /// # Arguments
    /// * `output` - Contains: encrypted_debt, approval_status (1/0), amount
    #[arcium_callback(encrypted_ix = "borrow")]
    pub fn borrow_callback(
        ctx: Context<BorrowCallback>,
        output: SignedComputationOutputs<BorrowOutput>,
    ) -> Result<()> {
        msg!("Borrow callback START");
        msg!("Callback context loaded. Verifying output...");

        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => {
                msg!("Output verified successfully.");
                o
            }
            Err(e) => {
                msg!("Borrow verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let inner = result.field_0;
        let approved = inner.field_1;
        let amount = inner.field_2; // Revealed amount from circuit

        msg!(
            "Circuit result - Approved: {}, Amount: {}",
            approved,
            amount
        );

        if approved == 1 {
            let user_obligation = &mut ctx.accounts.user_obligation;
            msg!(
                "Updating user obligation. Old nonce: {}",
                user_obligation.state_nonce
            );

            user_obligation.encrypted_borrow = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

            // Vault PDA signs the transfer
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"borrow_vault",
                pool_key.as_ref(),
                &[ctx.bumps.borrow_vault],
            ];
            let signer = &[&seeds[..]];

            let transfer_cpi = Transfer {
                from: ctx.accounts.borrow_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.borrow_vault.to_account_info(),
            };

            msg!("Transferring {} tokens to user...", amount);

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                amount,
            )?;

            msg!(
                "Borrow approved, transferred {} tokens. New nonce: {}",
                amount,
                user_obligation.state_nonce
            );

            // Update global borrows
            let pool = &mut ctx.accounts.pool;
            pool.total_borrows = pool.total_borrows.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
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
    /// * `output` - Contains: encrypted_collateral, approval_status (1/0), amount
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
        let approved = inner.field_1;
        let amount = inner.field_2;

        if approved == 1 {
            let user_obligation = &mut ctx.accounts.user_obligation;
            user_obligation.encrypted_deposit = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

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
    /// * `output` - Signed computation outputs containing new encrypted debt
    #[arcium_callback(encrypted_ix = "repay")]
    pub fn repay_callback(
        ctx: Context<RepayCallback>,
        output: SignedComputationOutputs<RepayOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(RepayOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Repay verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let user_obligation = &mut ctx.accounts.user_obligation;
        user_obligation.encrypted_borrow = result.ciphertexts[0];
        user_obligation.state_nonce += 1;

        msg!("Repay callback completed");
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
        msg!("Liquidate callback START");
        
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
        
        // Encrypted outputs are wrapped in structs with 'ciphertexts' field
        let enc_deposit = inner.field_0.ciphertexts[0];
        let enc_borrow = inner.field_1.ciphertexts[0];

        let is_liquidatable = inner.field_2; // 1 or 0
        let seized_collateral = inner.field_3;
        let repaid_amount = inner.field_4; // Echoed back amount

        let user_obligation = &mut ctx.accounts.user_obligation;
        
        // Always update state (nonce, encrypted balances)
        // If query failed (healthy), circuit should output OLD balances (or unchanged).
        // If succeeded, NEW balances.
        user_obligation.encrypted_deposit = enc_deposit;
        user_obligation.encrypted_borrow = enc_borrow;
        user_obligation.state_nonce += 1;

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
            // Debt decreased by repaid_amount
            pool.total_borrows = pool.total_borrows.checked_sub(repaid_amount).unwrap_or(0);
            // Collateral decreased by seized_collateral (removed from vault)
            pool.total_deposits = pool.total_deposits.checked_sub(seized_collateral).unwrap_or(0);

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

    /// Closes the lending pool (admin only)
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        crate::instructions::close_pool_handler(ctx)
    }
}
