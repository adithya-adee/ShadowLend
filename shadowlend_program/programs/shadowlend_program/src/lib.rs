use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

declare_id!("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

/// Computation definition offset for deposit circuit
pub const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_deposit");

/// Computation definition offset for borrow circuit
pub const COMP_DEF_OFFSET_COMPUTE_BORROW: u32 = comp_def_offset("compute_borrow");

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
    #[arcium_callback(encrypted_ix = "compute_deposit")]
    pub fn compute_deposit_callback(
        ctx: Context<ComputeDepositCallback>,
        output: SignedComputationOutputs<ComputeDepositOutput>,
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
    #[arcium_callback(encrypted_ix = "compute_borrow")]
    pub fn compute_borrow_callback(
        ctx: Context<ComputeBorrowCallback>,
        output: SignedComputationOutputs<ComputeBorrowOutput>,
    ) -> Result<()> {
        instructions::borrow::borrow_callback_handler(ctx, output)
    }
}
