// Instructions module
//
// All program instructions organized by operation type:
// - admin: Pool initialization, computation definition setup
// - deposit: Collateral deposit with private balance updates
// - borrow: USDC borrow with private health factor check

pub mod admin;
pub mod borrow;
pub mod deposit;

pub use admin::*;
pub use borrow::*;
pub use deposit::*;
