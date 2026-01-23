use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount - must be greater than zero")]
    InvalidAmount,

    #[msg("Computation aborted - MPC verification failed")]
    AbortedComputation,

    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    #[msg("Borrow not approved - health factor too low")]
    BorrowNotApproved,

    #[msg("Withdrawal not approved - would violate health factor")]
    WithdrawNotApproved,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Cluster not set")]
    ClusterNotSet,

    #[msg("Invalid Token Mint")]
    InvalidMint,

    #[msg("Unauthorized")]
    Unauthorized,
}
