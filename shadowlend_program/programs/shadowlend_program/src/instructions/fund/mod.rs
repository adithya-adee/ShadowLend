// Fund Account Module - Two-Phase Deposit Model
// This separates the visible "funding" step from the hidden "crediting" step

mod accounts;
mod handler;

pub use accounts::*;
pub use handler::*;
