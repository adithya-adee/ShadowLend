use anchor_lang::prelude::*;

/// Custom error codes for ShadowLend protocol
/// Named `ErrorCode` to match Arcium's expected pattern for PDA macros
#[error_code]
pub enum ErrorCode {
    // === Arcium Computation Errors ===
    #[msg("The MXE computation was aborted")]
    AbortedComputation,

    #[msg("Arcium cluster not set on MXE account")]
    ClusterNotSet,

    // === Deposit Errors ===
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,

    // === Borrow Errors ===
    #[msg("Borrow request rejected - insufficient collateral")]
    BorrowRejected,

    #[msg("Borrow amount must be greater than zero")]
    InvalidBorrowAmount,

    // === Withdraw Errors ===
    #[msg("Withdrawal would cause undercollateralization")]
    WithdrawRejected,

    #[msg("Withdraw amount must be greater than zero")]
    InvalidWithdrawAmount,

    // === Liquidation Errors ===
    #[msg("Position is healthy and cannot be liquidated")]
    PositionHealthy,

    // === Pool Errors ===
    #[msg("Insufficient liquidity in borrow pool")]
    InsufficientLiquidity,

    // === General Errors ===
    #[msg("Unauthorized - only pool authority can perform this action")]
    Unauthorized,

    #[msg("Invalid pool configuration")]
    InvalidPoolConfig,

    #[msg("Invalid mint - does not match pool collateral")]
    InvalidMint,

    #[msg("Repay amount must be greater than zero")]
    InvalidRepayAmount,

    #[msg("Invalid computation output from MXE")]
    InvalidComputationOutput,

    #[msg("Math overflow detected")]
    MathOverflow,
}
