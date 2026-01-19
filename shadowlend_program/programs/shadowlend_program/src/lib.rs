use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use constants::*;

pub use instructions::*;
pub use state::*;

declare_id!("EeTbMXq1M2RffanXbU6EdTzBtdafMxc47YZ2faK1ioxy");

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
pub const COMP_DEF_OFFSET_COMPUTE_LIQUIDATE: u32 =
    comp_def_offset("compute_confidential_liquidate");

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
    pub fn init_compute_liquidate_comp_def(
        ctx: Context<InitComputeLiquidateCompDef>,
    ) -> Result<()> {
        instructions::admin::init_compute_liquidate_comp_def_handler(ctx)
    }

    /// Register the interest computation definition with Arcium MXE
    pub fn init_compute_interest_comp_def(ctx: Context<InitComputeInterestCompDef>) -> Result<()> {
        instructions::admin::init_compute_interest_comp_def_handler(ctx)
    }

    // ============================================================
    // Deposit: Transfer collateral + update encrypted balance
    // ============================================================

    /// Deposit collateral into the pool.
    /// Performs SPL transfer and queues MXE computation to update encrypted balance.
    pub fn deposit(
        ctx: Context<Deposit>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::deposit::deposit_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
            mxe_nonce,
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
    // Borrow: Request USDC with private health factor check
    // ============================================================

    /// Borrow tokens against deposited collateral.
    /// MXE privately verifies health factor >= 1.0 before approval.
    pub fn borrow(
        ctx: Context<Borrow>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::borrow::borrow_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            user_nonce,
            mxe_nonce,
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
    // Withdraw: Reclaim collateral with private HF verification
    // ============================================================

    /// Withdraw collateral from the pool.
    /// MXE privately verifies health factor stays safe after withdrawal.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        pub_key: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::withdraw::withdraw_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            pub_key,
            user_nonce,
            mxe_nonce,
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
    // Repay: Reduce debt with private balance update
    // ============================================================

    /// Repay borrowed tokens to reduce debt.
    /// Interest is paid first, then principal.
    pub fn repay(
        ctx: Context<Repay>,
        computation_offset: u64,
        amount: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::repay::repay_handler(
            ctx,
            computation_offset,
            amount,
            user_pubkey,
            user_nonce,
            mxe_nonce,
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
    // Liquidate: Repay undercollateralized debt + seize collateral
    // ============================================================

    /// Liquidate an undercollateralized position.
    /// MXE privately verifies HF < 1.0 before allowing liquidation.
    pub fn liquidate(
        ctx: Context<Liquidate>,
        computation_offset: u64,
        repay_amount: u64,
        target_user_pubkey: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::liquidate::liquidate_handler(
            ctx,
            computation_offset,
            repay_amount,
            target_user_pubkey,
            user_nonce,
            mxe_nonce,
        )
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
    // Interest: On-demand interest accrual
    // ============================================================

    /// Accrue interest on a user's borrow position.
    /// Anyone can trigger; computed privately in MXE.
    pub fn update_interest(
        ctx: Context<UpdateInterest>,
        computation_offset: u64,
        user_pubkey: [u8; 32],
        user_nonce: u128,
        mxe_nonce: u128,
    ) -> Result<()> {
        instructions::interest::update_interest_handler(
            ctx,
            computation_offset,
            user_pubkey,
            user_nonce,
            mxe_nonce,
        )
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
