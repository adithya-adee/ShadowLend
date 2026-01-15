//! ShadowLend Protocol State Accounts
//!
//! This module defines the on-chain account structures for the lending protocol:
//! - [`Pool`]: Lending pool configuration and encrypted aggregate state
//! - [`UserObligation`]: User's encrypted position (deposits, borrows, interest)

pub mod pool;
pub mod user_obligation;

pub use pool::*;
pub use user_obligation::*;
