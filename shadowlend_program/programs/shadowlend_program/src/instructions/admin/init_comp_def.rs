use crate::ID;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;

// ============================================================
// Deposit Computation Definition
// ============================================================

#[init_computation_definition_accounts("deposit", authority)]
#[derive(Accounts)]
pub struct InitDepositCompDef<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: Checked by Arcium program
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_deposit_comp_def_handler(ctx: Context<InitDepositCompDef>) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://qisejajribahvwowmbef.supabase.co/storage/v1/object/public/Circuits/deposit.arcis".to_string(),
            hash: circuit_hash!("deposit"),
        })),
        None,
    )?;
    Ok(())
}

// ============================================================
// Withdraw Computation Definition
// ============================================================

#[init_computation_definition_accounts("withdraw", authority)]
#[derive(Accounts)]
pub struct InitWithdrawCompDef<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: Checked by Arcium program
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_withdraw_comp_def_handler(ctx: Context<InitWithdrawCompDef>) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://qisejajribahvwowmbef.supabase.co/storage/v1/object/public/Circuits/withdraw.arcis".to_string(),
            hash: circuit_hash!("withdraw"),
        })),
        None,
    )?;
    Ok(())
}

// ============================================================
// Borrow Computation Definition
// ============================================================

#[init_computation_definition_accounts("borrow", authority)]
#[derive(Accounts)]
pub struct InitBorrowCompDef<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: Checked by Arcium program
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_borrow_comp_def_handler(ctx: Context<InitBorrowCompDef>) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://qisejajribahvwowmbef.supabase.co/storage/v1/object/public/Circuits/borrow.arcis".to_string(),
            hash: circuit_hash!("borrow"),
        })),
        None,
    )?;
    Ok(())
}

// ============================================================
// Repay Computation Definition
// ============================================================

#[init_computation_definition_accounts("repay", authority)]
#[derive(Accounts)]
pub struct InitRepayCompDef<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: Checked by Arcium program
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_repay_comp_def_handler(ctx: Context<InitRepayCompDef>) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://qisejajribahvwowmbef.supabase.co/storage/v1/object/public/Circuits/repay.arcis".to_string(),
            hash: circuit_hash!("repay"),
        })),
        None,
    )?;
    Ok(())
}
