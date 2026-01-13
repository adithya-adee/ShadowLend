use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Import ID from crate root (from declare_id! macro)
use crate::ID;

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
