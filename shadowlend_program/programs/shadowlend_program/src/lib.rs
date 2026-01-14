use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use constants::*;

pub use instructions::*;
pub use state::*;

declare_id!("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

// ============================================================
// Computation Definition Offsets for Arcium MXE
// ============================================================

/// Computation definition offset for deposit circuit
pub const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_confidential_deposit");

/// Computation definition offset for borrow circuit
pub const COMP_DEF_OFFSET_COMPUTE_BORROW: u32 = comp_def_offset("compute_confidential_borrow");

/// Computation definition offset for withdraw circuit
pub const COMP_DEF_OFFSET_COMPUTE_WITHDRAW: u32 = comp_def_offset("compute_confidential_withdraw");

/// Computation definition offset for repay circuit
pub const COMP_DEF_OFFSET_COMPUTE_REPAY: u32 = comp_def_offset("compute_confidential_repay");

/// Computation definition offset for liquidate circuit
pub const COMP_DEF_OFFSET_COMPUTE_LIQUIDATE: u32 = comp_def_offset("compute_confidential_liquidate");

/// Computation definition offset for interest circuit
pub const COMP_DEF_OFFSET_COMPUTE_INTEREST: u32 = comp_def_offset("compute_confidential_interest");

#[arcium_program]
pub mod shadowlend_program {
    use super::*;

    // ============================================================
    // Admin Instructions
    // ============================================================

    /// Initialize a new lending pool with collateral and borrow vaults
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ltv: u16,
        liquidation_threshold: u16,
        liquidation_bonus: u16,
        fixed_borrow_rate: u64,
    ) -> Result<()> {
        instructions::admin::initialize_pool_handler(
            ctx,
            ltv,
            liquidation_threshold,
            liquidation_bonus,
            fixed_borrow_rate,
        )
    }

    /// Register the deposit computation definition with Arcium MXE
    pub fn init_compute_deposit_comp_def(ctx: Context<InitComputeDepositCompDef>) -> Result<()> {
        instructions::admin::init_compute_deposit_comp_def_handler(ctx)
    }

    /// Register the borrow computation definition with Arcium MXE
    pub fn init_compute_borrow_comp_def(ctx: Context<InitComputeBorrowCompDef>) -> Result<()> {
        instructions::admin::init_compute_borrow_comp_def_handler(ctx)
    }

    /// Register the withdraw computation definition with Arcium MXE
    pub fn init_compute_withdraw_comp_def(ctx: Context<InitComputeWithdrawCompDef>) -> Result<()> {
        instructions::admin::init_compute_withdraw_comp_def_handler(ctx)
    }

    /// Register the repay computation definition with Arcium MXE
    pub fn init_compute_repay_comp_def(ctx: Context<InitComputeRepayCompDef>) -> Result<()> {
        instructions::admin::init_compute_repay_comp_def_handler(ctx)
    }

    /// Register the liquidate computation definition with Arcium MXE
    pub fn init_compute_liquidate_comp_def(ctx: Context<InitComputeLiquidateCompDef>) -> Result<()> {
        instructions::admin::init_compute_liquidate_comp_def_handler(ctx)
    }

    /// Register the interest computation definition with Arcium MXE
    pub fn init_compute_interest_comp_def(ctx: Context<InitComputeInterestCompDef>) -> Result<()> {
        instructions::admin::init_compute_interest_comp_def_handler(ctx)
    }

    // ============================================================
    // User Instructions - Fund Account (Two-Phase Deposit)
    // ============================================================

    /// Fund user's account by transferring tokens to vault
    /// 
    /// TWO-PHASE DEPOSIT MODEL:
    /// - Phase 1 (this): Token transfer (amount IS visible)
    /// - Phase 2 (deposit): Encrypted balance credit (amount HIDDEN)
    pub fn fund_account(ctx: Context<FundAccount>, amount: u64) -> Result<()> {
        instructions::fund::fund_account_handler(ctx, amount)
    }

    // ============================================================
    // User Instructions - Deposit
    // ============================================================

    /// Queue a deposit computation to Arcium MXE
    ///
    /// Flow:
    /// 1. User encrypts deposit amount client-side
    /// 2. Handler queues computation to MXE
    /// 3. MXE verifies and returns encrypted output
    /// 4. Callback extracts deposit_delta and performs transfer
    pub fn deposit(
        ctx: Context<Deposit>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::deposit::deposit_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            nonce,
        )
    }

    /// Callback from Arcium MXE after deposit computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_deposit")]
    pub fn compute_confidential_deposit_callback(
        ctx: Context<ComputeConfidentialDepositCallback>,
        output: SignedComputationOutputs<ComputeConfidentialDepositOutput>,
    ) -> Result<()> {
        instructions::deposit::deposit_callback_handler(ctx, output)
    }

    // ============================================================
    // User Instructions - Borrow
    // ============================================================

    /// Queue a borrow computation to Arcium MXE
    ///
    /// Flow:
    /// 1. User encrypts borrow amount client-side
    /// 2. Handler queues computation with prices and LTV
    /// 3. MXE computes health factor privately
    /// 4. Callback checks approval and performs transfer
    pub fn borrow(
        ctx: Context<Borrow>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::borrow::borrow_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            nonce,
        )
    }

    /// Callback from Arcium MXE after borrow computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_borrow")]
    pub fn compute_confidential_borrow_callback(
        ctx: Context<ComputeConfidentialBorrowCallback>,
        output: SignedComputationOutputs<ComputeConfidentialBorrowOutput>,
    ) -> Result<()> {
        instructions::borrow::borrow_callback_handler(ctx, output)
    }

    // ============================================================
    // User Instructions - Withdraw
    // ============================================================

    /// Queue a withdraw computation to Arcium MXE
    ///
    /// Flow:
    /// 1. User encrypts withdraw amount client-side
    /// 2. Handler queues computation with prices and LTV
    /// 3. MXE verifies health factor stays safe after withdrawal
    /// 4. Callback checks approval and transfers collateral to user
    pub fn withdraw(
        ctx: Context<Withdraw>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::withdraw::withdraw_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            nonce,
        )
    }

    /// Callback from Arcium MXE after withdraw computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_withdraw")]
    pub fn compute_confidential_withdraw_callback(
        ctx: Context<ComputeConfidentialWithdrawCallback>,
        output: SignedComputationOutputs<ComputeConfidentialWithdrawOutput>,
    ) -> Result<()> {
        instructions::withdraw::withdraw_callback_handler(ctx, output)
    }

    // ============================================================
    // User Instructions - Repay
    // ============================================================

    /// Queue a repay computation to Arcium MXE
    ///
    /// Flow:
    /// 1. User encrypts repay amount client-side
    /// 2. Handler queues computation
    /// 3. MXE computes new borrow balance privately
    /// 4. Callback transfers tokens from user to vault
    pub fn repay(
        ctx: Context<Repay>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::repay::repay_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            nonce,
        )
    }

    /// Callback from Arcium MXE after repay computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_repay")]
    pub fn compute_confidential_repay_callback(
        ctx: Context<ComputeConfidentialRepayCallback>,
        output: SignedComputationOutputs<ComputeConfidentialRepayOutput>,
    ) -> Result<()> {
        instructions::repay::repay_callback_handler(ctx, output)
    }

    // ============================================================
    // Liquidator Instructions
    // ============================================================

    /// Queue a liquidation computation to Arcium MXE
    ///
    /// Flow:
    /// 1. Liquidator specifies repay amount (plaintext)
    /// 2. Handler queues computation with prices and liquidation params
    /// 3. MXE verifies HF < 1.0 privately [CRITICAL]
    /// 4. Callback transfers debt repayment and seizes collateral + bonus
    pub fn liquidate(
        ctx: Context<Liquidate>,
        computation_offset: u64,
        repay_amount: u64,
    ) -> Result<()> {
        instructions::liquidate::liquidate_handler(ctx, computation_offset, repay_amount)
    }

    /// Callback from Arcium MXE after liquidation computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_liquidate")]
    pub fn compute_confidential_liquidate_callback(
        ctx: Context<ComputeConfidentialLiquidateCallback>,
        output: SignedComputationOutputs<ComputeConfidentialLiquidateOutput>,
    ) -> Result<()> {
        instructions::liquidate::liquidate_callback_handler(ctx, output)
    }

    // ============================================================
    // Interest Accrual Instructions
    // ============================================================

    /// Queue an interest update computation to Arcium MXE
    ///
    /// Flow:
    /// 1. Anyone can trigger interest update for any user
    /// 2. Handler queues computation with current timestamp and rate
    /// 3. MXE computes accrued interest privately
    /// 4. Callback updates encrypted state and pool aggregates
    pub fn update_interest(ctx: Context<UpdateInterest>, computation_offset: u64) -> Result<()> {
        instructions::interest::update_interest_handler(ctx, computation_offset)
    }

    /// Callback from Arcium MXE after interest computation completes
    #[arcium_callback(encrypted_ix = "compute_confidential_interest")]
    pub fn compute_confidential_interest_callback(
        ctx: Context<ComputeConfidentialInterestCallback>,
        output: SignedComputationOutputs<ComputeConfidentialInterestOutput>,
    ) -> Result<()> {
        instructions::interest::update_interest_callback_handler(ctx, output)
    }
}
