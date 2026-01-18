//! ShadowLend Arcium Circuits
//!
//! Confidential computation circuits that run inside Arcium MXE (Multi-party eXecution Environment).
//! These circuits operate on encrypted user and pool state to enable private lending operations.
//!
//! # Encryption Types
//! - `Enc<Shared, T>` - User-decryptable data (user can decrypt with their private key)
//! - `Enc<Mxe, T>` - Protocol-only data (only MXE nodes can decrypt)
//!
//! # Design Constraints
//! - Fixed-size structs only (no `Vec<T>` in circuit types)
//! - Use `.min()` / `.max()` for saturating arithmetic (safe for MPC)
//! - Boolean approval flags are revealed in output structs
//!
//! # Privacy Guarantees
//! - Individual balances remain encrypted
//! - Health factor calculations happen privately
//! - Only approved amounts are revealed for SPL transfers
use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ============================================================
    // Shared Types
    // ============================================================

    /// Encrypted user state stored on-chain.
    ///
    /// Contains the user's lending position within a pool.
    /// Encrypted with `Enc<Shared, UserState>` so user can decrypt.
    pub struct UserState {
        /// Collateral deposited (in base units, e.g., lamports)
        pub deposit_amount: u128,
        /// Principal amount borrowed (in base units)
        pub borrow_amount: u128,
        /// Accrued interest on outstanding borrow
        pub accrued_interest: u128,
        /// Unix timestamp of last interest calculation
        pub last_interest_calc_ts: i64,
    }

    /// Encrypted pool state (MXE-only decryption).
    ///
    /// Contains aggregate totals that remain hidden from observers.
    /// Prevents TVL tracking and front-running attacks.
    pub struct PoolState {
        /// Total collateral deposited across all users
        pub total_deposits: u128,
        /// Total principal borrowed across all users
        pub total_borrows: u128,
        /// Aggregate interest accumulated by protocol
        pub accumulated_interest: u128,
        /// Available liquidity for new borrows
        pub available_borrow_liquidity: u128,
    }

    // ============================================================
    // Deposit Circuit
    // ============================================================

    /// Output from confidential deposit computation
    pub struct ConfidentialDepositOutput {
        /// Updated user state
        pub new_user_state: UserState,
        /// Public success flag
        pub success: bool,
    }

    /// Atomic Confidential Deposit
    ///
    /// HYBRID MODEL:
    /// - Input `amount` is PLAINTEXT (publicly verified by SPL transfer in handler)
    /// - Updates encrypted state internally
    #[instruction]
    pub fn compute_confidential_deposit(
        amount: u64, // PLAINTEXT INPUT
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
    ) -> (Enc<Shared, ConfidentialDepositOutput>, Enc<Mxe, PoolState>) {
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        // Update user's deposit balance
        user_state.deposit_amount = user_state.deposit_amount + (amount as u128);

        // Update pool totals
        pool_state.total_deposits = pool_state.total_deposits + (amount as u128);

        let output = ConfidentialDepositOutput {
            new_user_state: user_state,
            success: true,
        };

        (
            current_user_state.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // Borrow Circuit
    // ============================================================

    /// Output from confidential borrow computation
    pub struct ConfidentialBorrowOutput {
        /// Updated user state (user can decrypt)
        pub new_user_state: UserState,
        /// Whether borrow was approved (HF >= 1.0)
        pub approved: bool,
        /// Revealed amount for SPL transfer (0 if not approved)
        pub revealed_amount: u64,
    }

    /// Confidential borrow: checks health factor and updates balances
    #[instruction]
    pub fn compute_confidential_borrow(
        amount_ctxt: Enc<Shared, u64>,
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        collateral_price: u64,
        borrow_price: u64,
        ltv_bps: u64,
    ) -> (Enc<Shared, ConfidentialBorrowOutput>, Enc<Mxe, PoolState>) {
        let borrow_amount = amount_ctxt.to_arcis();
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        // Calculate new total borrow
        let proposed_borrow = user_state.borrow_amount + (borrow_amount as u128);

        // Health Factor check (all in u128 to avoid overflow)
        let collateral_value = user_state.deposit_amount * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * ltv_bps as u128 / 10000;
        let borrow_value = proposed_borrow * (borrow_price as u128);

        // Approve if collateralization is sufficient
        let approved = collateral_with_ltv >= borrow_value;

        // Check pool has enough liquidity
        let has_liquidity = pool_state.available_borrow_liquidity >= (borrow_amount as u128);
        let final_approved = approved && has_liquidity;

        // Conditional update using multiplication by approval flag
        let update_factor = final_approved as u128;
        let borrow_delta = update_factor * (borrow_amount as u128);

        // Update user state
        user_state.borrow_amount = user_state.borrow_amount + borrow_delta;

        // Update pool state
        pool_state.total_borrows = pool_state.total_borrows + borrow_delta;
        pool_state.available_borrow_liquidity = 
            pool_state.available_borrow_liquidity - borrow_delta;

        // REVEAL Logic: Only reveal amount if approved
        let revealed = if final_approved { borrow_amount } else { 0 };

        let output = ConfidentialBorrowOutput {
            new_user_state: user_state,
            approved: final_approved,
            revealed_amount: revealed,
        };

        (
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // Withdraw Circuit
    // ============================================================

    /// Output from confidential withdraw computation
    pub struct ConfidentialWithdrawOutput {
        /// Updated user state
        pub new_user_state: UserState,
        /// Whether withdrawal was approved
        pub approved: bool,
        /// Revealed amount for SPL transfer
        pub revealed_amount: u64,
    }

    /// Confidential withdraw: checks HF and updates balances
    #[instruction]
    pub fn compute_confidential_withdraw(
        amount_ctxt: Enc<Shared, u64>,
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        collateral_price: u64,
        borrow_price: u64,
        ltv_bps: u64,
    ) -> (Enc<Shared, ConfidentialWithdrawOutput>, Enc<Mxe, PoolState>) {
        let withdraw_amount = amount_ctxt.to_arcis();
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        // Cap at actual deposit
        let withdraw_u128 = withdraw_amount as u128;
        let actual_withdraw = withdraw_u128.min(user_state.deposit_amount);

        // Calculate new deposit after withdrawal
        let new_deposit = user_state.deposit_amount - actual_withdraw;

        // Health Factor check after withdrawal
        let total_borrow = user_state.borrow_amount + user_state.accrued_interest;
        let collateral_value = new_deposit * (collateral_price as u128);
        let collateral_with_ltv = collateral_value * ltv_bps as u128 / 10000;
        let borrow_value = total_borrow * (borrow_price as u128);

        let no_borrow = total_borrow == 0;
        let hf_ok = collateral_with_ltv >= borrow_value;
        let approved = no_borrow || hf_ok;

        // Conditional update
        let update_factor = approved as u128;
        let withdraw_delta = update_factor * actual_withdraw;

        // Update user state
        user_state.deposit_amount = user_state.deposit_amount - withdraw_delta;

        // Update pool state
        pool_state.total_deposits = pool_state.total_deposits - withdraw_delta;
        
        // REVEAL Logic: Only reveal amount if approved
        let revealed = if approved { withdraw_delta as u64 } else { 0 };

        let output = ConfidentialWithdrawOutput {
            new_user_state: user_state,
            approved,
            revealed_amount: revealed,
        };

        (
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // Repay Circuit
    // ============================================================

    /// Output from confidential repay computation
    /// Only reveals success flag
    pub struct ConfidentialRepayOutput {
        /// Updated user state (user can decrypt)
        pub new_user_state: UserState,
        /// Whether repayment was successful
        pub success: bool,
    }

    /// Confidential repay: reduces borrow balance without revealing amount
    /// 
    /// PRIVACY: Only reveals success flag.
    /// Repayment priority: interest first, then principal
    #[instruction]
    pub fn compute_confidential_repay(
        amount: u64, // PLAINTEXT INPUT
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
    ) -> (Enc<Shared, ConfidentialRepayOutput>, Enc<Mxe, PoolState>) {
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        let repay_u128 = amount as u128;

        // Calculate total debt
        let total_debt = user_state.borrow_amount + user_state.accrued_interest;

        // Cap repayment at total debt
        let actual_repay = repay_u128.min(total_debt);

        // Apply repayment: interest first, then principal
        let interest_payment = actual_repay.min(user_state.accrued_interest);
        let new_interest = user_state.accrued_interest - interest_payment;

        // OPTIMIZATION: No .min() needed for principal_payment
        // Proof: actual_repay <= total_debt = borrow_amount + accrued_interest
        //        interest_payment <= accrued_interest
        //        => principal_payment = actual_repay - interest_payment <= borrow_amount
        let principal_payment = actual_repay - interest_payment;
        let new_borrow = user_state.borrow_amount - principal_payment;

        // Update user state
        user_state.borrow_amount = new_borrow;
        user_state.accrued_interest = new_interest;

        // Update pool state
        pool_state.total_borrows = pool_state.total_borrows - 
            principal_payment.min(pool_state.total_borrows);
        pool_state.available_borrow_liquidity = 
            pool_state.available_borrow_liquidity + actual_repay;
        pool_state.accumulated_interest = 
            pool_state.accumulated_interest + interest_payment;

        let success = actual_repay > 0;

        let output = ConfidentialRepayOutput {
            new_user_state: user_state,
            success,
        };

        (
            current_user_state.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // Liquidate Circuit
    // ============================================================

    /// Output from confidential liquidation computation
    pub struct ConfidentialLiquidateOutput {
        /// Updated user state
        pub new_user_state: UserState,
        /// Whether liquidation occurred
        pub liquidated: bool,
        /// Revealed repay amount for SPL transfer
        pub revealed_repay: u64,
        /// Revealed seized collateral for SPL transfer
        pub revealed_seized: u64,
    }

    /// Confidential liquidate: verifies HF < 1.0 and updates balances
    #[instruction]
    pub fn compute_confidential_liquidate(
        repay_amount: u64, // PLAINTEXT INPUT
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        collateral_price: u64,
        borrow_price: u64,
        liquidation_threshold: u64,
        liquidation_bonus: u64,
    ) -> (Enc<Shared, ConfidentialLiquidateOutput>, Enc<Mxe, PoolState>) {
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        let repay_u128 = repay_amount as u128;

        // Calculate total borrow including interest
        let total_borrow = user_state.borrow_amount + user_state.accrued_interest;

        // Check if liquidatable: HF < 1.0
        // OPTIMIZATION: No separate has_borrow check needed
        // Proof: If total_borrow = 0, then borrow_value = 0
        //        collateral_with_threshold >= 0, so NOT under_collateralized
        let collateral_value = user_state.deposit_amount * (collateral_price as u128);
        let collateral_with_threshold = collateral_value * liquidation_threshold as u128;
        let borrow_value = total_borrow * (borrow_price as u128) * 10000;

        let is_liquidatable = collateral_with_threshold < borrow_value;

        // Only proceed if liquidatable
        let proceed = is_liquidatable as u128;

        // Cap repay at total debt
        let actual_repay = (proceed * repay_u128).min(total_borrow);

        // Calculate collateral seized with bonus
        let repay_value_calc = actual_repay * (borrow_price as u128);
        let collateral_amount = repay_value_calc / (collateral_price as u128).max(1);
        let with_bonus = collateral_amount * (10000 + liquidation_bonus as u128) / 10000;
        let seized = with_bonus.min(user_state.deposit_amount);

        // Update user state
        user_state.deposit_amount = user_state.deposit_amount - seized;

        // Apply repayment: interest first, then principal
        let interest_payment = actual_repay.min(user_state.accrued_interest);
        user_state.accrued_interest = user_state.accrued_interest - interest_payment;

        // OPTIMIZATION: No .min() needed for principal_payment (same proof as repay)
        let principal_payment = actual_repay - interest_payment;
        user_state.borrow_amount = user_state.borrow_amount - principal_payment;

        // Update pool state
        pool_state.total_deposits = pool_state.total_deposits - seized;
        pool_state.total_borrows = pool_state.total_borrows - 
            principal_payment.min(pool_state.total_borrows);
        pool_state.accumulated_interest = 
            pool_state.accumulated_interest + interest_payment;

        let output = ConfidentialLiquidateOutput {
            new_user_state: user_state,
            liquidated: is_liquidatable,
            revealed_repay: actual_repay as u64,
            revealed_seized: seized as u64,
        };

        (
            current_user_state.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // Interest Circuit
    // ============================================================

    /// Output from confidential interest computation
    /// Only reveals success flag
    pub struct ConfidentialInterestOutput {
        /// Updated user state with accrued interest (user can decrypt)
        pub new_user_state: UserState,
        /// Whether interest was calculated
        pub success: bool,
    }

    /// Confidential interest accrual: updates interest without revealing amount
    /// 
    /// PRIVACY: Only reveals success flag.
    /// Interest calculation:
    /// interest = borrow_amount * (rate_bps / 10000) * (time_elapsed / SECONDS_PER_YEAR)
    #[instruction]
    pub fn compute_confidential_interest(
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        current_ts: i64,
        borrow_rate_bps: u64,
    ) -> (Enc<Shared, ConfidentialInterestOutput>, Enc<Mxe, PoolState>) {
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        // Seconds per year (approximate)
        let seconds_per_year: u128 = 31536000;

        // Calculate time elapsed since last update
        let last_ts = user_state.last_interest_calc_ts;
        let diff = current_ts - last_ts;
        let time_elapsed: u128 = (diff.max(0)) as u128;

        // Calculate interest
        let borrow = user_state.borrow_amount;
        let rate = borrow_rate_bps as u128;
        let interest = borrow * rate * time_elapsed / (10000 * seconds_per_year);

        // Update user state
        user_state.accrued_interest = user_state.accrued_interest + interest;
        user_state.last_interest_calc_ts = current_ts;

        // Update pool state
        pool_state.accumulated_interest = pool_state.accumulated_interest + interest;

        let output = ConfidentialInterestOutput {
            new_user_state: user_state,
            success: true,
        };

        (
            current_user_state.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }
}

