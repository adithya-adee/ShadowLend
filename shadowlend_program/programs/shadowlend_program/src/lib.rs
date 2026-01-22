use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

pub use state::*;
pub use instructions::*;

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
        InitializePool, 
        Deposit, DepositCallback,  
        Borrow, BorrowCallback,  
        Withdraw, WithdrawCallback, 
        Repay, RepayCallback,
    };

    /// Initialize lending pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ltv_bps: u16,
        liquidation_threshold: u16,
    ) -> Result<()> {
        crate::instructions::initialize_pool_handler(ctx, ltv_bps, liquidation_threshold)
    }

    /// Deposit collateral (queues Arcium MPC computation)
    pub fn deposit(
        ctx: Context<Deposit>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
    ) -> Result<()> {
        crate::instructions::deposit_handler(ctx, computation_offset, amount, user_pubkey, user_nonce)
    }

    /// Deposit callback (called by Arcium after MPC computation)
    #[arcium_callback(encrypted_ix = "deposit")]
    pub fn deposit_callback(
        ctx: Context<DepositCallback>,
        output: SignedComputationOutputs<DepositOutput>,
    ) -> Result<()> {
        // Verify and extract output
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
        
        // Update encrypted deposit with verified result
        let user_obligation = &mut ctx.accounts.user_obligation;
        user_obligation.encrypted_deposit = result.ciphertexts[0];
        user_obligation.state_nonce += 1;
        
        msg!("Deposit callback completed, encrypted balance updated");
        
        Ok(())
    }

    /// Borrow assets (checking health in MPC)
    pub fn borrow(
        ctx: Context<Borrow>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        pool_ltv: u64,
    ) -> Result<()> {
        crate::instructions::borrow_handler(ctx, computation_offset, amount, user_pubkey, pool_ltv)
    }

    /// Borrow callback
    #[arcium_callback(encrypted_ix = "borrow")]
    pub fn borrow_callback(
        ctx: Context<BorrowCallback>,
        output: SignedComputationOutputs<BorrowOutput>,
    ) -> Result<()> {
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

        let inner = result.field_0;
        let approved = inner.field_1;
        let amount = inner.field_2;
        msg!("Borrow approved status: {}", approved);

        if approved == 1 {
            // Update debt
            let user_obligation = &mut ctx.accounts.user_obligation;
            user_obligation.encrypted_borrow = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

            // Transfer tokens
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

    /// Withdraw collateral (checking health in MPC)
    pub fn withdraw(
        ctx: Context<Withdraw>,
        computation_offset: u64,
        amount: u64,
    ) -> Result<()> {
        crate::instructions::withdraw_handler(ctx, computation_offset, amount)
    }

    /// Withdraw callback
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
                msg!("Withdraw computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        let inner = result.field_0;
        let approved = inner.field_1;
        let amount = inner.field_2;
        msg!("Withdraw approved status: {}", approved);

        if approved == 1 {
            // Update collateral
            let user_obligation = &mut ctx.accounts.user_obligation;
            user_obligation.encrypted_deposit = inner.field_0.ciphertexts[0];
            user_obligation.state_nonce += 1;

            // Transfer tokens from collateral vault to user
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
            
            msg!("Transferred {} tokens to user", amount);
        } else {
            msg!("Withdraw request rejected by MPC health check");
        }

        Ok(())
    }

    /// Repay debt
    pub fn repay(
        ctx: Context<Repay>,
        computation_offset: u64,
        amount: u64,
    ) -> Result<()> {
        crate::instructions::repay_handler(ctx, computation_offset, amount)
    }

    /// Repay callback
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
                msg!("Repay computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        };
        
        let user_obligation = &mut ctx.accounts.user_obligation;
        user_obligation.encrypted_borrow = result.ciphertexts[0];
        user_obligation.state_nonce += 1;
        
        msg!("Repay callback completed, encrypted debt updated");
        
        Ok(())
    }
}
