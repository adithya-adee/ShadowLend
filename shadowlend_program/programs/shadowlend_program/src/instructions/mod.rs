// Instructions module
//
// All program instructions organized by operation type:
// - admin: Pool initialization, computation definition setup
// - fund: Token funding for two-phase deposit (visible)
// - deposit: Collateral deposit with private balance updates
// - borrow: USDC borrow with private health factor check
// - withdraw: Collateral withdrawal with private HF verification
// - repay: Debt repayment with private balance update
// - liquidate: Under-collateralized position liquidation
// - interest: On-demand interest accrual

pub mod admin;
pub mod borrow;
pub mod deposit;
pub mod fund;
pub mod interest;
pub mod liquidate;
pub mod repay;
pub mod withdraw;

pub use admin::*;
pub use borrow::*;
pub use deposit::*;
pub use fund::*;
pub use interest::*;
pub use liquidate::*;
pub use repay::*;
pub use withdraw::*;

