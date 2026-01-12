// Admin instructions module
//
// Contains administrative operations for protocol setup:
// - Pool initialization
// - Arcium computation definition registration

pub mod init_comp_defs;
pub mod initialize_pool;

pub use init_comp_defs::*;
pub use initialize_pool::*;
