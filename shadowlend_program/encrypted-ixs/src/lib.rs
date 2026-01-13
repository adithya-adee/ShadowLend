/// ShadowLend Arcium Circuits (encrypted-ixs)
///
/// These circuits run inside Arcium MXE for confidential computation.
/// Each circuit operates on encrypted user state and returns encrypted results.
///
/// Key Design Decisions:
/// - Use Enc<Shared, T> for user inputs/outputs (user can decrypt)
/// - Use Enc<Mxe, T> for internal state (only MXE can decrypt)
/// - Use .reveal() for values needed as plaintext for on-chain token transfers
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
    /// - new_state: Encrypted user state (user can decrypt with private key)
    /// - deposit_delta: REVEALED (plaintext) for on-chain token transfer
    pub struct DepositOutput {
        /// Updated user state (encrypted)
        pub new_state: UserState,
        /// Amount added to deposits - REVEALED for token transfer
        pub deposit_delta: u64,
    }

    /// Compute deposit: adds amount to user's deposit balance
    ///
    /// The deposit_delta is revealed (plaintext) so the callback can use it
    /// for the token transfer. This is a privacy tradeoff: the amount becomes
    /// public, but it's necessary for on-chain SPL token transfers.
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

        // Reveal deposit_delta for on-chain token transfer
        // Note: This makes the transfer amount public
        let revealed_delta = (amount as u64).reveal();

        // Return encrypted output with revealed delta
        amount_ctxt.owner.from_arcis(DepositOutput {
            new_state,
            deposit_delta: revealed_delta,
        })
    }

    // ============================================================
    // Borrow Circuit
    // ============================================================

    /// Output from borrow computation
    /// - approved: REVEALED (plaintext) so callback can check approval
    /// - new_state: Encrypted user state
    /// - borrow_delta: REVEALED (plaintext) for on-chain token transfer
    pub struct BorrowOutput {
        /// Whether borrow is approved (HF >= 1.0) - REVEALED
        pub approved: bool,
        /// Updated user state with new borrow amount (encrypted)
        pub new_state: UserState,
        /// Amount borrowed - REVEALED for token transfer
        pub borrow_delta: u64,
    }

    /// Compute borrow: checks health factor and approves/denies borrow
    ///
    /// The approved status and borrow_delta are revealed so the callback
    /// can check approval and perform the token transfer.
    ///
    /// Health Factor Calculation:
    /// HF = (deposit_value_usd * ltv) / borrow_value_usd
    ///    = (deposit * collateral_price * ltv_bps) / (borrow * borrow_price * 10000)
    /// Approve if HF >= 1.0 (numerator >= denominator)
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
        let collateral_value = current_state.deposit_amount * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * (ltv_bps as u128) / 10000;
        let borrow_value = new_borrow * (borrow_price as u128);

        // Approve if collateralization is sufficient
        let approved = collateral_with_ltv >= borrow_value;

        // Create updated state
        let new_state = UserState {
            deposit_amount: current_state.deposit_amount,
            borrow_amount: new_borrow,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        // Reveal values needed for on-chain operations
        let revealed_approved = approved.reveal();
        let revealed_delta = (borrow_amount as u64).reveal();

        // Return encrypted output with revealed fields
        amount_ctxt.owner.from_arcis(BorrowOutput {
            approved: revealed_approved,
            new_state,
            borrow_delta: revealed_delta,
        })
    }
}
