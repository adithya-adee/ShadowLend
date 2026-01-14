// Liquidate instruction module
//
// Enables liquidators to liquidate under-collateralized positions.
// - Handler: queues computation to Arcium MXE with liquidator's repay amount
// - Callback: verifies HF < 1.0, transfers debt repayment, seizes collateral with bonus

mod accounts;
mod callback;
mod handler;

pub use accounts::*;
pub use callback::*;
pub use handler::*;
