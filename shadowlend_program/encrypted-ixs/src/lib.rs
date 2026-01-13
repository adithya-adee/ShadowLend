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

    // ============================================================
    // Borrow Circuit
    // ============================================================

    /// Output from borrow computation
    /// Returns approval status, new state, and borrow delta
    pub struct BorrowOutput {
        /// Whether borrow is approved (HF >= 1.0)
        pub approved: bool,
        /// Updated user state with new borrow amount
        pub new_state: UserState,
        /// Amount borrowed (for aggregate update)
        pub borrow_delta: u128,
    }

    /// Compute borrow: checks health factor and approves/denies borrow
    ///
    /// Input:
    /// - amount: Enc<Shared, u128> - user's requested borrow amount
    /// - current_state: Enc<Mxe, UserState> - current encrypted state
    /// - collateral_price: u64 - SOL price in cents (e.g., $150 = 15000)
    /// - borrow_price: u64 - USDC price in cents (e.g., $1 = 100)
    /// - ltv_bps: u16 - Loan-to-Value ratio in basis points (80% = 8000)
    ///
    /// Output:
    /// - Enc<Shared, BorrowOutput> - approval + new state + delta
    ///
    /// Privacy: Health factor computed privately, only approve/deny is revealed
    ///
    /// Health Factor Calculation:
    /// HF = (deposit_value_usd * ltv) / borrow_value_usd
    ///    = (deposit * collateral_price * ltv_bps) / (borrow * borrow_price * 10000)
    /// Approve if HF >= 1.0 (which means numerator >= denominator)
    #[instruction]
    pub fn compute_borrow(
        amount_ctxt: Enc<Shared, u128>,
        current_state_ctxt: Enc<Mxe, UserState>,
        collateral_price: u64,   // Price in cents
        borrow_price: u64,       // Price in cents
        ltv_bps: u16,            // LTV in basis points (8000 = 80%)
    ) -> Enc<Shared, BorrowOutput> {
        // Decrypt inputs in MXE
        let borrow_amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Calculate new total borrow
        let new_borrow = current_state.borrow_amount + borrow_amount;

        // Health Factor check (all in u128 to avoid overflow)
        // Collateral value with LTV: deposit * price * ltv / 10000
        // Borrow value: borrow * price
        // HF >= 1.0 means: collateral_with_ltv >= borrow_value
        let collateral_value = current_state.deposit_amount * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * (ltv_bps as u128) / 10000;
        let borrow_value = new_borrow * (borrow_price as u128);

        // Approve if collateralization is sufficient
        let approved = collateral_with_ltv >= borrow_value;

        // Create updated state (always update, callback checks approval)
        let new_state = UserState {
            deposit_amount: current_state.deposit_amount,
            borrow_amount: new_borrow,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        // Return encrypted output
        amount_ctxt.owner.from_arcis(BorrowOutput {
            approved,
            new_state,
            borrow_delta: borrow_amount,
        })
    }
}
