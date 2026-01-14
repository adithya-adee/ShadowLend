// Withdraw instruction module
//
// Enables users to withdraw collateral with private health factor check.
// - Handler: queues computation to Arcium MXE
// - Callback: verifies output and transfers tokens from vault to user

mod accounts;
mod callback;
mod handler;

pub use accounts::*;
pub use callback::*;
pub use handler::*;
