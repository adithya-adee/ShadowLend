// Interest accrual instruction module
//
// Enables on-demand interest updates for user borrows.
// - Handler: queues computation to Arcium MXE with time delta
// - Callback: updates encrypted state with accrued interest

mod accounts;
mod callback;
mod handler;

pub use accounts::*;
pub use callback::*;
pub use handler::*;
