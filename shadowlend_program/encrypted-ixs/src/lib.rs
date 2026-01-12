/// ShadowLend Arcium Circuits (encrypted-ixs)
///
/// These circuits run inside Arcium MXE for confidential computation.
/// Each circuit operates on encrypted user state and returns encrypted results.
///
/// Key Design Decisions:
/// - Use Enc<Shared, T> for user inputs/outputs (user can decrypt)
/// - Use Enc<Mxe, T> for internal state (only MXE can decrypt)
/// - Fixed-size structs only (no Vec<T>)
use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    // ============================================================
    // Common Types shared across circuits
    // ============================================================

    /// Encrypted user state stored on-chain
    /// Uses fixed-size fields only (no Vec)
    pub struct UserState {
        /// Collateral deposited (e.g., SOL in lamports)
        pub deposit_amount: u128,
        /// Amount borrowed (e.g., USDC in base units)
        pub borrow_amount: u128,
        /// Accrued interest on borrow
        pub accrued_interest: u128,
        /// Timestamp of last interest calculation
        pub last_interest_calc_ts: i64,
    }

    // ============================================================
    // Deposit Circuit
    // ============================================================

    /// Input for deposit computation
    /// User provides amount, MXE provides current state
    pub struct DepositInput {
        /// Amount of collateral to deposit (from user, Enc<Shared>)
        pub amount: u128,
    }

    /// Output from deposit computation
    /// Returns new encrypted state and public delta
    pub struct DepositOutput {
        /// Updated user state (encrypted for MXE)
        pub new_state: UserState,
        /// Amount added to deposits (public, for aggregate update)
        pub deposit_delta: u128,
    }

    /// Compute deposit: adds amount to user's deposit balance
    ///
    /// Input:
    /// - amount: Enc<Shared, u128> - user's deposit amount
    /// - current_state: Enc<Mxe, UserState> - current encrypted state (from on-chain)
    ///
    /// Output:
    /// - Enc<Shared, DepositOutput> - new state + delta for callback
    ///
    /// Privacy: Individual deposit amount hidden, only aggregate delta revealed
    #[instruction]
    pub fn compute_deposit(
        amount_ctxt: Enc<Shared, u128>,
        current_state_ctxt: Enc<Mxe, UserState>,
    ) -> Enc<Shared, DepositOutput> {
        // Decrypt inputs in MXE
        let amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Calculate new deposit amount
        let new_deposit = current_state.deposit_amount + amount;

        // Create updated state
        let new_state = UserState {
            deposit_amount: new_deposit,
            borrow_amount: current_state.borrow_amount,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        // Return encrypted output (Shared so user callback can access delta)
        amount_ctxt.owner.from_arcis(DepositOutput {
            new_state,
            deposit_delta: amount,
        })
    }
}
