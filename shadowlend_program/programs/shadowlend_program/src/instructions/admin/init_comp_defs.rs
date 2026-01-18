use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Import ID from crate root (from declare_id! macro)
use crate::ID;

// ============================================================
// Confidential Deposit Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_deposit computation definition
///
/// This registers the confidential deposit circuit with Arcium MXE.
/// Must be called once before any deposits can be made.
#[init_computation_definition_accounts("compute_confidential_deposit", payer)]
#[derive(Accounts)]
pub struct InitComputeDepositCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential deposit computation definition
///
/// Registers the compute_confidential_deposit circuit with Arcium MXE.
pub fn init_compute_deposit_comp_def_handler(
    ctx: Context<InitComputeDepositCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Confidential Borrow Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_borrow computation definition
///
/// This registers the confidential borrow circuit with Arcium MXE.
/// Must be called once before any borrows can be made.
#[init_computation_definition_accounts("compute_confidential_borrow", payer)]
#[derive(Accounts)]
pub struct InitComputeBorrowCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential borrow computation definition
///
/// Registers the compute_confidential_borrow circuit with Arcium MXE.
pub fn init_compute_borrow_comp_def_handler(ctx: Context<InitComputeBorrowCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Confidential Withdraw Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_withdraw computation definition
///
/// This registers the confidential withdraw circuit with Arcium MXE.
/// Must be called once before any withdrawals can be made.
#[init_computation_definition_accounts("compute_confidential_withdraw", payer)]
#[derive(Accounts)]
pub struct InitComputeWithdrawCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential withdraw computation definition
///
/// Registers the compute_confidential_withdraw circuit with Arcium MXE.
pub fn init_compute_withdraw_comp_def_handler(
    ctx: Context<InitComputeWithdrawCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Confidential Repay Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_repay computation definition
///
/// This registers the confidential repay circuit with Arcium MXE.
/// Must be called once before any repayments can be made.
#[init_computation_definition_accounts("compute_confidential_repay", payer)]
#[derive(Accounts)]
pub struct InitComputeRepayCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential repay computation definition
///
/// Registers the compute_confidential_repay circuit with Arcium MXE.
pub fn init_compute_repay_comp_def_handler(ctx: Context<InitComputeRepayCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Confidential Liquidate Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_liquidate computation definition
///
/// This registers the confidential liquidate circuit with Arcium MXE.
/// Must be called once before any liquidations can be performed.
#[init_computation_definition_accounts("compute_confidential_liquidate", payer)]
#[derive(Accounts)]
pub struct InitComputeLiquidateCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential liquidate computation definition
///
/// Registers the compute_confidential_liquidate circuit with Arcium MXE.
pub fn init_compute_liquidate_comp_def_handler(
    ctx: Context<InitComputeLiquidateCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Confidential Interest Computation Definition
// ============================================================

/// Accounts for initializing the compute_confidential_interest computation definition
///
/// This registers the confidential interest accrual circuit with Arcium MXE.
/// Must be called once before any interest updates can be performed.
#[init_computation_definition_accounts("compute_confidential_interest", payer)]
#[derive(Accounts)]
pub struct InitComputeInterestCompDef<'info> {
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// MXE account for this program
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// Computation definition account (will be created)
    #[account(mut)]
    /// CHECK: Checked by Arcium program, not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Initialize confidential interest computation definition
///
/// Registers the compute_confidential_interest circuit with Arcium MXE.
pub fn init_compute_interest_comp_def_handler(
    ctx: Context<InitComputeInterestCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
