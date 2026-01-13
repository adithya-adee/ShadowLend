// Interest accrual instruction module
//
// Enables on-demand interest updates for user borrows.
// - Handler: queues computation to Arcium MXE with time delta
// - Callback: updates encrypted state with accrued interest

pub mod accounts;
pub mod callback;
pub mod handler;

pub use accounts::*;
pub use callback::*;
pub use handler::*;
