use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Import ID from crate root (from declare_id! macro)
use crate::ID;
// Import ID_CONST from arcium_client for PDA derivation macros
use arcium_client::idl::arcium::ID_CONST;

use crate::error::ErrorCode;

/// Computation definition offset for deposit circuit
const COMP_DEF_OFFSET_COMPUTE_DEPOSIT: u32 = comp_def_offset("compute_deposit");

/// Accounts for the deposit callback instruction
///
/// Called by Arcium MXE after compute_deposit completes.
/// Handles state updates and emits events.
///
/// NOTE: Struct name MUST match pattern `Compute{CircuitName}Callback` for Arcium
#[callback_accounts("compute_deposit")]
#[derive(Accounts)]
pub struct ComputeDepositCallback<'info> {
    // === Arcium Required Accounts ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    /// MXE account for this program
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Computation account, checked by arcium program via callback constraints
    pub computation_account: UncheckedAccount<'info>,

    /// Arcium cluster account for output verification
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: Instructions sysvar, checked by account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

/// Deposit callback handler - processes MXE computation result
///
/// This is called automatically by Arcium after compute_deposit completes.
///
/// Steps:
/// 1. Verify computation output signature
/// 2. Emit event with encrypted result (user decrypts client-side)
///
/// Note: Token transfers happen on client side after decryption and verification.
/// This keeps the callback minimal and lets user verify amounts before transferring.
pub fn deposit_callback_handler(
    ctx: Context<ComputeDepositCallback>,
    output: SignedComputationOutputs<ComputeDepositOutput>,
) -> Result<()> {
    // Verify the output signature from MXE cluster
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ComputeDepositOutput { field_0 }) => field_0,
        Err(e) => {
            msg!("Computation verification failed: {}", e);
            return Err(ErrorCode::AbortedComputation.into());
        }
    };

    // Emit event with encrypted output
    // User will decrypt client-side using their private key
    emit!(DepositComputed {
        ciphertext: result.ciphertexts[0],
        nonce: result.nonce.to_le_bytes(),
    });

    Ok(())
}

/// Event emitted when deposit computation completes
/// Contains encrypted result for user to decrypt client-side
#[event]
pub struct DepositComputed {
    /// Encrypted output containing new_state and deposit_delta
    pub ciphertext: [u8; 32],
    /// Nonce used for encryption
    pub nonce: [u8; 16],
}
