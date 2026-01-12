use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

/// Computation definition offset for deposit circuit
const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_deposit");

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

    // ============================================================
    // User Instructions - Deposit
    // ============================================================

    /// Queue a deposit computation to Arcium MXE
    ///
    /// User's encrypted deposit amount is processed privately by MXE.
    /// Only pool aggregates are updated publicly.
    pub fn deposit(
        ctx: Context<Deposit>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        encrypted_state: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::deposit::deposit_handler(
            ctx,
            computation_offset,
            encrypted_amount,
            encrypted_state,
            pub_key,
            nonce,
        )
    }

    /// Callback from Arcium MXE after deposit computation completes
    ///
    /// Handles:
    /// - Verifying MXE output signature
    /// - Emitting encrypted result for user to decrypt
    #[arcium_callback(encrypted_ix = "compute_deposit")]
    pub fn compute_deposit_callback(
        ctx: Context<ComputeDepositCallback>,
        output: SignedComputationOutputs<ComputeDepositOutput>,
    ) -> Result<()> {
        instructions::deposit::deposit_callback_handler(ctx, output)
    }
}
