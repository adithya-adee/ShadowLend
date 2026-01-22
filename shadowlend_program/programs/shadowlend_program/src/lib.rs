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

declare_id!("BzVVANvwPQgyQ7F4zxkaJ9gjrwKQEoponS7sMbHLCHU");

#[arcium_program]
pub mod shadowlend_program {
    use super::*;
    use crate::error::ErrorCode;
    use crate::instructions::{
        Borrow, BorrowCallback, Deposit, DepositCallback, InitializePool, Repay, RepayCallback,
        Withdraw, WithdrawCallback,
    };

    /// Initializes the lending pool with configuration parameters.
    ///
    /// This is a one-time setup instruction that creates the pool account
    /// and sets the risk parameters for the lending protocol.
    ///
    /// # Arguments
    /// * `ltv_bps` - Loan-to-Value ratio in basis points (e.g., 7500 = 75%)
    /// * `liquidation_threshold` - Liquidation threshold in basis points
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
    /// * `computation_offset` - Unique offset for this computation
    /// * `amount` - Amount of tokens to deposit
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

    /// Callback handler invoked by Arcium MXE after deposit computation completes.
    ///
    /// This function is automatically called by the Arcium network after the MPC
    /// computation finishes. It verifies the computation output and updates the
    /// user's encrypted deposit balance on-chain.
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs from the MPC cluster
    ///
    /// # Errors
    /// * `ErrorCode::AbortedComputation` - If output verification fails
    #[arcium_callback(encrypted_ix = "deposit")]
    pub fn deposit_callback(
        ctx: Context<DepositCallback>,
        output: SignedComputationOutputs<DepositOutput>,
    ) -> Result<()> {
        // Verify the computation output signature against the cluster's public key
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(DepositOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Deposit computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Update the user's encrypted deposit balance with the verified result
        let user_obligation = &mut ctx.accounts.user_obligation;
        user_obligation.encrypted_deposit = result.ciphertexts[0];
        user_obligation.state_nonce += 1;

        msg!("Deposit callback completed, encrypted balance updated");

        Ok(())
    }

    /// Initiates a borrow request with confidential health check.
    ///
    /// Queues an MPC computation to verify that the user's health factor
    /// remains above the liquidation threshold after borrowing. The actual
    /// token transfer occurs in the callback if the health check passes.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique offset for this computation
    /// * `amount` - Amount of tokens to borrow
    pub fn borrow(ctx: Context<Borrow>, computation_offset: u64, amount: u64) -> Result<()> {
        crate::instructions::borrow_handler(ctx, computation_offset, amount)
    }

    /// Callback handler invoked by Arcium MXE after borrow health check completes.
    ///
    /// This function verifies the MPC computation output and, if the borrow is approved,
    /// updates the user's encrypted debt and transfers tokens from the borrow vault.
    ///
    /// The MPC circuit returns:
    /// - field_0: Updated encrypted debt balance
    /// - field_1: Approval status (1 = approved, 0 = rejected)
    /// - field_2: Borrow amount (for transfer)
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs from the MPC cluster
    ///
    /// # Errors
    /// * `ErrorCode::AbortedComputation` - If output verification fails
    #[arcium_callback(encrypted_ix = "borrow")]
    pub fn borrow_callback(
        ctx: Context<BorrowCallback>,
        output: SignedComputationOutputs<BorrowOutput>,
    ) -> Result<()> {
        // Verify the computation output signature
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("Borrow computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Extract computation results
        let inner = result.field_0;
        let approved = inner.field_1; // 1 = approved, 0 = rejected
        let amount = inner.field_2; // Amount to transfer
        msg!("Borrow approved status: {}", approved);

        if approved == 1 {
            // Update the user's encrypted debt balance
            let user_obligation = &mut ctx.accounts.user_obligation;
            user_obligation.encrypted_borrow = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

            // Prepare PDA signer seeds for vault authority
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"borrow_vault",
                pool_key.as_ref(),
                &[ctx.bumps.borrow_vault],
            ];
            let signer = &[&seeds[..]];

            // Transfer borrowed tokens from vault to user
            let transfer_cpi = Transfer {
                from: ctx.accounts.borrow_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.borrow_vault.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_cpi,
                    signer,
                ),
                amount,
            )?;

            msg!("Transferred {} tokens to user", amount);
        } else {
            msg!("Borrow request rejected by MPC health check");
        }

        Ok(())
    }

    /// Initiates a withdrawal request with confidential health check.
    ///
    /// Queues an MPC computation to verify that the user's health factor
    /// remains above the liquidation threshold after withdrawing collateral.
    /// The actual token transfer occurs in the callback if the health check passes.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique offset for this computation
    /// * `amount` - Amount of collateral tokens to withdraw
    pub fn withdraw(ctx: Context<Withdraw>, computation_offset: u64, amount: u64) -> Result<()> {
        crate::instructions::withdraw_handler(ctx, computation_offset, amount)
    }

    /// Callback handler invoked by Arcium MXE after withdrawal health check completes.
    ///
    /// This function verifies the MPC computation output and, if the withdrawal is approved,
    /// updates the user's encrypted collateral and transfers tokens from the collateral vault.
    ///
    /// The MPC circuit returns:
    /// - field_0: Updated encrypted collateral balance
    /// - field_1: Approval status (1 = approved, 0 = rejected)
    /// - field_2: Withdrawal amount (for transfer)
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs from the MPC cluster
    ///
    /// # Errors
    /// * `ErrorCode::AbortedComputation` - If output verification fails
    #[arcium_callback(encrypted_ix = "withdraw")]
    pub fn withdraw_callback(
        ctx: Context<WithdrawCallback>,
        output: SignedComputationOutputs<WithdrawOutput>,
    ) -> Result<()> {
        // Verify the computation output signature
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("Withdraw computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Extract computation results
        let inner = result.field_0;
        let approved = inner.field_1; // 1 = approved, 0 = rejected
        let amount = inner.field_2; // Amount to transfer
        msg!("Withdraw approved status: {}", approved);

        if approved == 1 {
            // Update the user's encrypted collateral balance
            let user_obligation = &mut ctx.accounts.user_obligation;
            user_obligation.encrypted_deposit = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

            // Prepare PDA signer seeds for vault authority
            let pool_key = ctx.accounts.pool.key();
            let seeds: &[&[u8]] = &[
                b"collateral_vault",
                pool_key.as_ref(),
                &[ctx.bumps.collateral_vault],
            ];
            let signer = &[&seeds[..]];

            // Transfer withdrawn tokens from vault to user
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

            msg!("Transferred {} tokens to user", amount);
        } else {
            msg!("Withdraw request rejected by MPC health check");
        }

        Ok(())
    }

    /// Repays borrowed tokens and queues confidential debt update.
    ///
    /// Transfers repayment tokens to the borrow vault and initiates an MPC
    /// computation to update the user's encrypted debt balance.
    ///
    /// # Arguments
    /// * `computation_offset` - Unique offset for this computation
    /// * `amount` - Amount of tokens to repay
    pub fn repay(ctx: Context<Repay>, computation_offset: u64, amount: u64) -> Result<()> {
        crate::instructions::repay_handler(ctx, computation_offset, amount)
    }

    /// Callback handler invoked by Arcium MXE after repayment computation completes.
    ///
    /// This function verifies the MPC computation output and updates the user's
    /// encrypted debt balance with the new value after repayment.
    ///
    /// # Arguments
    /// * `output` - Signed computation outputs from the MPC cluster
    ///
    /// # Errors
    /// * `ErrorCode::AbortedComputation` - If output verification fails
    #[arcium_callback(encrypted_ix = "repay")]
    pub fn repay_callback(
        ctx: Context<RepayCallback>,
        output: SignedComputationOutputs<RepayOutput>,
    ) -> Result<()> {
        // Verify the computation output signature
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(RepayOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("Repay computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Update the user's encrypted debt balance with the new value
        let user_obligation = &mut ctx.accounts.user_obligation;
        user_obligation.encrypted_borrow = result.ciphertexts[0];
        user_obligation.state_nonce += 1;

        msg!("Repay callback completed, encrypted debt updated");

        Ok(())
    }
}
