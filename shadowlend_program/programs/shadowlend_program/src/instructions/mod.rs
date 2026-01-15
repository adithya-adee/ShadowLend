//! ShadowLend Program Instructions
//!
//! All user and admin operations:
//! - admin: Pool initialization, MXE circuit registration
//! - deposit: Collateral deposit (atomic: SPL transfer + MXE state update)
//! - borrow: USDC borrow with private health factor check
//! - withdraw: Collateral withdrawal with private HF verification
//! - repay: Debt repayment with private balance update
//! - liquidate: Undercollateralized position liquidation
//! - interest: On-demand interest accrual

pub mod admin;
pub mod borrow;
pub mod deposit;
pub mod interest;
pub mod liquidate;
pub mod repay;
pub mod withdraw;

pub use admin::*;
pub use borrow::*;
pub use deposit::*;
pub use interest::*;
pub use liquidate::*;
pub use repay::*;
pub use withdraw::*;
