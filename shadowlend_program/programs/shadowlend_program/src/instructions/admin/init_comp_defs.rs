use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Import ID from crate root (from declare_id! macro)
use crate::ID;

// ============================================================
// Deposit Computation Definition
// ============================================================

/// Accounts for initializing the compute_deposit computation definition
///
/// This registers the deposit circuit with Arcium MXE.
/// Must be called once before any deposits can be made.
#[init_computation_definition_accounts("compute_deposit", payer)]
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

/// Initialize deposit computation definition
///
/// Registers the compute_deposit circuit with Arcium MXE.
pub fn init_compute_deposit_comp_def_handler(
    ctx: Context<InitComputeDepositCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Borrow Computation Definition
// ============================================================

/// Accounts for initializing the compute_borrow computation definition
///
/// This registers the borrow circuit with Arcium MXE.
/// Must be called once before any borrows can be made.
#[init_computation_definition_accounts("compute_borrow", payer)]
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

/// Initialize borrow computation definition
///
/// Registers the compute_borrow circuit with Arcium MXE.
pub fn init_compute_borrow_comp_def_handler(
    ctx: Context<InitComputeBorrowCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Withdraw Computation Definition
// ============================================================

/// Accounts for initializing the compute_withdraw computation definition
///
/// This registers the withdraw circuit with Arcium MXE.
/// Must be called once before any withdrawals can be made.
#[init_computation_definition_accounts("compute_withdraw", payer)]
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

/// Initialize withdraw computation definition
///
/// Registers the compute_withdraw circuit with Arcium MXE.
pub fn init_compute_withdraw_comp_def_handler(
    ctx: Context<InitComputeWithdrawCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Repay Computation Definition
// ============================================================

/// Accounts for initializing the compute_repay computation definition
///
/// This registers the repay circuit with Arcium MXE.
/// Must be called once before any repayments can be made.
#[init_computation_definition_accounts("compute_repay", payer)]
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

/// Initialize repay computation definition
///
/// Registers the compute_repay circuit with Arcium MXE.
pub fn init_compute_repay_comp_def_handler(
    ctx: Context<InitComputeRepayCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Liquidate Computation Definition
// ============================================================

/// Accounts for initializing the compute_liquidate computation definition
///
/// This registers the liquidate circuit with Arcium MXE.
/// Must be called once before any liquidations can be performed.
#[init_computation_definition_accounts("compute_liquidate", payer)]
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

/// Initialize liquidate computation definition
///
/// Registers the compute_liquidate circuit with Arcium MXE.
pub fn init_compute_liquidate_comp_def_handler(
    ctx: Context<InitComputeLiquidateCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

// ============================================================
// Interest Computation Definition
// ============================================================

/// Accounts for initializing the compute_interest computation definition
///
/// This registers the interest accrual circuit with Arcium MXE.
/// Must be called once before any interest updates can be performed.
#[init_computation_definition_accounts("compute_interest", payer)]
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

/// Initialize interest computation definition
///
/// Registers the compute_interest circuit with Arcium MXE.
pub fn init_compute_interest_comp_def_handler(
    ctx: Context<InitComputeInterestCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
