/// ShadowLend Arcium Circuits (encrypted-ixs)
///
/// These circuits run inside Arcium MXE for confidential computation.
/// Each circuit operates on encrypted user state and returns encrypted results.
///
/// Key Design Decisions:
/// - Use Enc<Shared, T> for all inputs/outputs (user can decrypt with private key)
/// - Fixed-size structs only (no Vec<T>)
/// - Use .min() / .max() for saturating arithmetic (safe for MPC)
/// - Boolean comparisons return encrypted bools, decrypted in callback
/// - Return entire output as Enc<Shared, T> - callback deserializes all fields
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
    pub struct DepositOutput {
        /// Updated user state (encrypted)
        pub new_state: UserState,
        /// Amount added to deposits - for token transfer
        pub deposit_delta: u64,
    }

    /// Compute deposit: adds amount to user's deposit balance
    #[instruction]
    pub fn compute_deposit(
        amount_ctxt: Enc<Shared, u64>,
        current_state_ctxt: Enc<Shared, UserState>,
    ) -> Enc<Shared, DepositOutput> {
        let amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Calculate new deposit amount
        let new_deposit = current_state.deposit_amount + (amount as u128);

        // Create updated state
        let new_state = UserState {
            deposit_amount: new_deposit,
            borrow_amount: current_state.borrow_amount,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        // Return encrypted output
        amount_ctxt.owner.from_arcis(DepositOutput {
            new_state,
            deposit_delta: amount,
        })
    }

    // ============================================================
    // Borrow Circuit
    // ============================================================

    /// Output from borrow computation
    pub struct BorrowOutput {
        /// Whether borrow is approved (HF >= 1.0)
        pub approved: bool,
        /// Updated user state with new borrow amount (encrypted)
        pub new_state: UserState,
        /// Amount borrowed - for token transfer
        pub borrow_delta: u64,
    }

    /// Compute borrow: checks health factor and approves/denies borrow
    ///
    /// Health Factor Calculation:
    /// HF = (deposit_value_usd * ltv) / borrow_value_usd
    /// Approve if HF >= 1.0 (numerator >= denominator)
    #[instruction]
    pub fn compute_borrow(
        amount_ctxt: Enc<Shared, u64>,
        current_state_ctxt: Enc<Shared, UserState>,
        collateral_price: u64,
        borrow_price: u64,
        ltv_bps: u64,
    ) -> Enc<Shared, BorrowOutput> {
        let borrow_amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Calculate new total borrow
        let new_borrow = current_state.borrow_amount + (borrow_amount as u128);

        // Health Factor check (all in u128 to avoid overflow)
        let collateral_value = current_state.deposit_amount * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * ltv_bps as u128 / 10000;
        let borrow_value = new_borrow * (borrow_price as u128);

        // Approve if collateralization is sufficient (no if/else - direct comparison)
        let approved = collateral_with_ltv >= borrow_value;

        let new_state = UserState {
            deposit_amount: current_state.deposit_amount,
            borrow_amount: new_borrow,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        amount_ctxt.owner.from_arcis(BorrowOutput {
            approved,
            new_state,
            borrow_delta: borrow_amount,
        })
    }

    // ============================================================
    // Withdraw Circuit
    // ============================================================

    /// Output from withdraw computation
    pub struct WithdrawOutput {
        /// Whether withdrawal is approved (HF >= 1.0 after)
        pub approved: bool,
        /// Updated user state with reduced deposit (encrypted)
        pub new_state: UserState,
        /// Amount withdrawn - for token transfer
        pub withdraw_delta: u64,
    }

    /// Compute withdraw: checks health factor remains safe after withdrawal
    ///
    /// Uses saturating arithmetic to avoid underflow.
    /// Approved if no borrows OR if HF >= 1.0 after withdrawal.
    #[instruction]
    pub fn compute_withdraw(
        amount_ctxt: Enc<Shared, u64>,
        current_state_ctxt: Enc<Shared, UserState>,
        collateral_price: u64,
        borrow_price: u64,
        ltv_bps: u64,
    ) -> Enc<Shared, WithdrawOutput> {
        let withdraw_amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Calculate actual withdrawal (capped at deposit using min)
        let withdraw_u128 = withdraw_amount as u128;
        let actual_withdraw = withdraw_u128.min(current_state.deposit_amount);

        // Calculate new deposit after withdrawal (saturating sub)
        let new_deposit = current_state.deposit_amount - actual_withdraw;

        // Calculate total borrow including interest
        let total_borrow = current_state.borrow_amount + current_state.accrued_interest;

        // Check if safe:
        // If no borrows (total_borrow == 0), always approved
        // Otherwise check HF after withdrawal
        let collateral_value = new_deposit * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * ltv_bps as u128 / 10000;
        let borrow_value = total_borrow * (borrow_price as u128);

        // Approved: either no borrow, or collateral covers borrow
        // (total_borrow == 0) OR (collateral_with_ltv >= borrow_value)
        let no_borrow = total_borrow == 0;
        let hf_ok = collateral_with_ltv >= borrow_value;
        let approved = no_borrow || hf_ok;

        let new_state = UserState {
            deposit_amount: new_deposit,
            borrow_amount: current_state.borrow_amount,
            accrued_interest: current_state.accrued_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        amount_ctxt.owner.from_arcis(WithdrawOutput {
            approved,
            new_state,
            withdraw_delta: actual_withdraw as u64,
        })
    }

    // ============================================================
    // Repay Circuit
    // ============================================================

    /// Output from repay computation
    pub struct RepayOutput {
        /// Updated user state with reduced borrow (encrypted)
        pub new_state: UserState,
        /// Amount repaid - for token transfer
        pub repay_delta: u64,
    }

    /// Compute repay: reduces user's borrow balance
    ///
    /// Repayment priority: interest first, then principal
    /// Uses saturating arithmetic to handle edge cases.
    #[instruction]
    pub fn compute_repay(
        amount_ctxt: Enc<Shared, u64>,
        current_state_ctxt: Enc<Shared, UserState>,
    ) -> Enc<Shared, RepayOutput> {
        let repay_amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        let repay_u128 = repay_amount as u128;

        // Calculate total debt
        let total_debt = current_state.borrow_amount + current_state.accrued_interest;

        // Cap repayment at total debt
        let actual_repay = repay_u128.min(total_debt);

        // Apply repayment: interest first, then principal
        // Amount going to interest
        let interest_payment = actual_repay.min(current_state.accrued_interest);
        let new_interest = current_state.accrued_interest - interest_payment;

        // Remaining goes to principal
        let principal_payment = actual_repay - interest_payment;
        let new_borrow = current_state.borrow_amount - principal_payment.min(current_state.borrow_amount);

        let new_state = UserState {
            deposit_amount: current_state.deposit_amount,
            borrow_amount: new_borrow,
            accrued_interest: new_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        amount_ctxt.owner.from_arcis(RepayOutput {
            new_state,
            repay_delta: actual_repay as u64,
        })
    }

    // ============================================================
    // Liquidate Circuit
    // ============================================================

    /// Output from liquidation computation
    pub struct LiquidateOutput {
        /// Whether position is liquidatable (HF < 1.0)
        pub is_liquidatable: bool,
        /// Updated user state after liquidation (encrypted)
        pub new_state: UserState,
        /// Debt repaid by liquidator
        pub repay_delta: u64,
        /// Collateral seized (with bonus)
        pub collateral_seized: u64,
    }

    /// Compute liquidation: verifies HF < 1.0 and calculates collateral seizure
    ///
    /// Liquidation occurs when:
    /// HF = (deposit * collateral_price * liquidation_threshold) / (borrow * borrow_price) < 1.0
    ///
    /// Collateral seized = (repay_amount * borrow_price / collateral_price) * (1 + bonus)
    #[instruction]
    pub fn compute_liquidate(
        repay_amount_ctxt: Enc<Shared, u64>,
        current_state_ctxt: Enc<Shared, UserState>,
        collateral_price: u64,
        borrow_price: u64,
        liquidation_threshold: u64,
        liquidation_bonus: u64,
    ) -> Enc<Shared, LiquidateOutput> {
        let repay_amount = repay_amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        let repay_u128 = repay_amount as u128;

        // Calculate total borrow including interest
        let total_borrow = current_state.borrow_amount + current_state.accrued_interest;

        // Check if liquidatable: HF < 1.0
        // collateral * price * threshold < borrow * price * 10000
        let collateral_value = current_state.deposit_amount * (collateral_price as u128);
        let collateral_with_threshold = collateral_value * liquidation_threshold as u128;
        let borrow_value = total_borrow * (borrow_price as u128) * 10000;

        // is_liquidatable: total_borrow > 0 AND collateral_with_threshold < borrow_value
        let has_borrow = total_borrow > 0;
        let under_collateralized = collateral_with_threshold < borrow_value;
        let is_liquidatable = has_borrow && under_collateralized;

        // Cap repay at total debt
        let actual_repay = repay_u128.min(total_borrow);

        // Calculate collateral seized with bonus
        // collateral = repay * borrow_price / collateral_price * (10000 + bonus) / 10000
        let repay_value = actual_repay * (borrow_price as u128);
        let collateral_amount = repay_value / (collateral_price as u128).max(1);
        let with_bonus = collateral_amount * (10000 + liquidation_bonus as u128) / 10000;

        // Cap at available collateral
        let seized = with_bonus.min(current_state.deposit_amount);

        // Update state after liquidation
        let new_deposit = current_state.deposit_amount - seized;

        // Apply repayment: interest first, then principal
        let interest_payment = actual_repay.min(current_state.accrued_interest);
        let new_interest = current_state.accrued_interest - interest_payment;
        let principal_payment = actual_repay - interest_payment;
        let new_borrow = current_state.borrow_amount - principal_payment.min(current_state.borrow_amount);

        let new_state = UserState {
            deposit_amount: new_deposit,
            borrow_amount: new_borrow,
            accrued_interest: new_interest,
            last_interest_calc_ts: current_state.last_interest_calc_ts,
        };

        repay_amount_ctxt.owner.from_arcis(LiquidateOutput {
            is_liquidatable,
            new_state,
            repay_delta: actual_repay as u64,
            collateral_seized: seized as u64,
        })
    }

    // ============================================================
    // Interest Accrual Circuit
    // ============================================================

    /// Output from interest computation
    pub struct InterestOutput {
        /// Updated user state with accrued interest (encrypted)
        pub new_state: UserState,
        /// Interest accrued this period - for pool tracking
        pub interest_accrued: u64,
    }

    /// Compute interest accrual for a user's borrow position
    ///
    /// Interest calculation:
    /// interest = borrow_amount * (rate_bps / 10000) * (time_elapsed / SECONDS_PER_YEAR)
    ///
    /// Simplified for hackathon: uses linear interest model
    #[instruction]
    pub fn compute_interest(
        current_state_ctxt: Enc<Shared, UserState>,
        current_ts: i64,
        borrow_rate_bps: u64,
    ) -> Enc<Shared, InterestOutput> {
        let current_state = current_state_ctxt.to_arcis();

        // Seconds per year (approximate)
        let seconds_per_year: u128 = 31536000;

        // Calculate time elapsed since last update
        // Using max(0, diff) pattern without if/else
        let last_ts = current_state.last_interest_calc_ts;
        let diff = current_ts - last_ts;
        // Convert to u128, treating negative as 0
        let time_elapsed: u128 = (diff.max(0)) as u128;

        // Calculate interest: borrow * rate * time / (10000 * year)
        let borrow = current_state.borrow_amount;
        let rate = borrow_rate_bps as u128;

        // interest = borrow * rate_bps * time / (10000 * seconds_per_year)
        // If borrow == 0, interest will be 0
        let interest = borrow * rate * time_elapsed / (10000 * seconds_per_year);

        let new_state = UserState {
            deposit_amount: current_state.deposit_amount,
            borrow_amount: current_state.borrow_amount,
            accrued_interest: current_state.accrued_interest + interest,
            last_interest_calc_ts: current_ts,
        };

        current_state_ctxt.owner.from_arcis(InterestOutput {
            new_state,
            interest_accrued: interest as u64,
        })
    }
}
