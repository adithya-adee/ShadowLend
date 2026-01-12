// Instructions module
//
// All program instructions organized by operation type:
// - admin: Pool initialization, computation definition setup
// - deposit: Collateral deposit with private balance updates

pub mod admin;
pub mod deposit;

pub use admin::*;
pub use deposit::*;
