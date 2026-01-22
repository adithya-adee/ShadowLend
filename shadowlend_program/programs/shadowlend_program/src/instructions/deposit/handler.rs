use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use crate::error::ErrorCode;
use super::accounts::Deposit;
use super::callback::DepositCallback;

/// Handles deposit instruction by transferring tokens and queuing MXE computation
pub fn deposit_handler(
    ctx: Context<Deposit>,
    computation_offset: u64,
    amount: u64,
    user_pubkey: [u8; 32],
    user_nonce: u128,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    
    // Store the user_obligation key early before any borrows
    let user_obligation_key = ctx.accounts.user_obligation.key();
    
    // Build arguments for Arcium deposit circuit
    // This block limits the scope of the mutable borrow
    let args = {
        let user_obligation = &mut ctx.accounts.user_obligation;
        
        // Initialize user obligation on first deposit
        if user_obligation.user == Pubkey::default() {
            user_obligation.user = ctx.accounts.payer.key();
            user_obligation.pool = ctx.accounts.pool.key();
            user_obligation.encrypted_deposit = [0u8; 32];
            user_obligation.encrypted_borrow = [0u8; 32];
            user_obligation.state_nonce = 0;
            user_obligation.bump = ctx.bumps.user_obligation;
        }
        
        let mut args = ArgBuilder::new()
            .plaintext_u64(amount)
            .x25519_pubkey(user_pubkey)
            .plaintext_u128(user_nonce);
        
        // Pass encrypted deposit by reference or zero placeholder
        args = if user_obligation.encrypted_deposit != [0u8; 32] {
            args.account(user_obligation_key, 72u32, 32u32) // offset to encrypted_deposit
        } else {
            args.encrypted_u128([0u8; 32])
        };
        
        args.build()
    }; // Mutable borrow of user_obligation is dropped here
    
    // Transfer tokens from user to collateral vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };
    
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi,
        ),
        amount,
    )?;
    
    // Queue computation to Arcium MXE
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None, // No callback server needed
        vec![DepositCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: user_obligation_key,
                    is_writable: true,
                }
            ],
        )?],
        1, // tx count
        0, // priority fee
    )?;
    
    msg!("Deposited {} tokens, queued Arcium computation", amount);
    
    Ok(())
}
