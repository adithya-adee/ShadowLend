/// ShadowLend Arcium Circuits (encrypted-ixs)
///
/// These circuits run inside Arcium MXE for confidential computation.
/// Each circuit operates on encrypted user state and returns encrypted results.
///
/// Key Design Decisions:
/// - Use Enc<Shared, T> for user-decryptable data (user can decrypt with private key)
/// - Use Enc<Mxe, T> for protocol-only data (pool state, internal computations)
/// - Fixed-size structs only (no Vec<T>)
/// - Use .min() / .max() for saturating arithmetic (safe for MPC)
/// - Boolean flags inside output structs (decrypted in callback)
///
/// CONFIDENTIAL TRANSACTION DESIGN:
/// - Pool state is encrypted with Enc<Mxe, PoolState> - only protocol can decrypt
/// - User state is encrypted with Enc<Shared, UserState> - user can decrypt
/// - Outputs only reveal success/failure via struct bool fields
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

    /// Encrypted pool state (MXE-only decryption)
    /// Contains aggregate totals that should remain hidden
    pub struct PoolState {
        /// Total collateral deposited across all users
        pub total_deposits: u128,
        /// Total amount borrowed across all users
        pub total_borrows: u128,
        /// Aggregate interest accumulated
        pub accumulated_interest: u128,
        /// Available liquidity in borrow vault
        pub available_borrow_liquidity: u128,
    }

    // ============================================================
    // CONFIDENTIAL Deposit Circuit (NEW - No Amount Revealed)
    // ============================================================

    /// Output from confidential deposit computation
    /// CRITICAL: No amounts are revealed - only success flag
    pub struct ConfidentialDepositOutput {
        /// Updated user state (user can decrypt via new_user_state encryption)
        pub new_user_state: UserState,
        /// Whether deposit was successful (revealed in callback)
        pub success: bool,
    }

    /// Confidential deposit: credits encrypted amount to user's balance
    /// 
    /// PRIVACY: No amounts are revealed in the output!
    /// The callback only sees user state + success flag.
    /// Pool state is returned separately with MXE encryption.
    ///
    /// Args:
    /// - amount_ctxt: User's deposit amount (encrypted with shared key)
    /// - current_user_state: User's current encrypted state
    /// - current_pool_state: Pool's current encrypted state (MXE-only)
    /// - max_creditable: Maximum amount user can credit (total_funded - total_credited)
    #[instruction]
    pub fn compute_confidential_deposit(
        amount_ctxt: Enc<Shared, u64>,
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        max_creditable: u64,
    ) -> (Enc<Shared, ConfidentialDepositOutput>, Enc<Mxe, PoolState>) {
        let amount = amount_ctxt.to_arcis();
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        // Verify user isn't trying to credit more than they've funded
        let valid_amount = amount <= max_creditable;

        // Calculate effective credit (0 if invalid, else full amount)
        let effective_credit = (valid_amount as u128) * (amount as u128);

        // Update user's deposit balance
        user_state.deposit_amount = user_state.deposit_amount + effective_credit;

        // Update pool totals
        pool_state.total_deposits = pool_state.total_deposits + effective_credit;

        let output = ConfidentialDepositOutput {
            new_user_state: user_state,
            success: valid_amount,
        };

        (
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // CONFIDENTIAL Borrow Circuit (NEW - No Amount Revealed)
    // ============================================================

    /// Output from confidential borrow computation
    /// Only reveals approval status via bool field
    pub struct ConfidentialBorrowOutput {
        /// Updated user state (user can decrypt)
        pub new_user_state: UserState,
        /// Whether borrow was approved (HF >= 1.0)
        pub approved: bool,
    }

    /// Confidential borrow: checks health factor and updates balances
    /// 
    /// PRIVACY: Only reveals approval flag, never amounts.
    /// All balance updates happen inside MXE.
    ///
    /// Health Factor Calculation:
    /// HF = (deposit_value_usd * ltv) / borrow_value_usd
    /// Approve if HF >= 1.0 (numerator >= denominator)
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

        let output = ConfidentialBorrowOutput {
            new_user_state: user_state,
            approved: final_approved,
        };

        (
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // CONFIDENTIAL Withdraw Circuit (NEW - No Amount Revealed)
    // ============================================================

    /// Output from confidential withdraw computation
    /// Only reveals approval status
    pub struct ConfidentialWithdrawOutput {
        /// Updated user state (user can decrypt)
        pub new_user_state: UserState,
        /// Whether withdrawal was approved (HF >= 1.0 after)
        pub approved: bool,
    }

    /// Confidential withdraw: debits encrypted balance without revealing amount
    /// 
    /// PRIVACY: Only reveals approval flag.
    /// Actual withdrawal claim happens in separate step.
    ///
    /// Approved if no borrows OR if HF >= 1.0 after withdrawal.
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

        let output = ConfidentialWithdrawOutput {
            new_user_state: user_state,
            approved,
        };

        (
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // CONFIDENTIAL Repay Circuit (NEW - No Amount Revealed)
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
        amount_ctxt: Enc<Shared, u64>,
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
    ) -> (Enc<Shared, ConfidentialRepayOutput>, Enc<Mxe, PoolState>) {
        let repay_amount = amount_ctxt.to_arcis();
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        let repay_u128 = repay_amount as u128;

        // Calculate total debt
        let total_debt = user_state.borrow_amount + user_state.accrued_interest;

        // Cap repayment at total debt
        let actual_repay = repay_u128.min(total_debt);

        // Apply repayment: interest first, then principal
        let interest_payment = actual_repay.min(user_state.accrued_interest);
        let new_interest = user_state.accrued_interest - interest_payment;

        let principal_payment = actual_repay - interest_payment;
        let new_borrow = user_state.borrow_amount - 
            principal_payment.min(user_state.borrow_amount);

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
            amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // CONFIDENTIAL Liquidate Circuit (NEW - No Amount Revealed)
    // ============================================================

    /// Output from confidential liquidation computation
    /// Only reveals whether liquidation occurred
    pub struct ConfidentialLiquidateOutput {
        /// Updated user state after liquidation (user can decrypt)
        pub new_user_state: UserState,
        /// Whether position was liquidatable and liquidation occurred
        pub liquidated: bool,
    }

    /// Confidential liquidate: verifies HF < 1.0 and updates balances
    /// 
    /// PRIVACY: Only reveals whether liquidation occurred.
    /// Actual token transfers handled separately with revealed amounts (trade-off).
    ///
    /// Liquidation occurs when:
    /// HF = (deposit * collateral_price * threshold) / (borrow * borrow_price) < 1.0
    #[instruction]
    pub fn compute_confidential_liquidate(
        repay_amount_ctxt: Enc<Shared, u64>,
        current_user_state: Enc<Shared, UserState>,
        current_pool_state: Enc<Mxe, PoolState>,
        collateral_price: u64,
        borrow_price: u64,
        liquidation_threshold: u64,
        liquidation_bonus: u64,
    ) -> (Enc<Shared, ConfidentialLiquidateOutput>, Enc<Mxe, PoolState>) {
        let repay_amount = repay_amount_ctxt.to_arcis();
        let mut user_state = current_user_state.to_arcis();
        let mut pool_state = current_pool_state.to_arcis();

        let repay_u128 = repay_amount as u128;

        // Calculate total borrow including interest
        let total_borrow = user_state.borrow_amount + user_state.accrued_interest;

        // Check if liquidatable: HF < 1.0
        let collateral_value = user_state.deposit_amount * (collateral_price as u128);
        let collateral_with_threshold = collateral_value * liquidation_threshold as u128;
        let borrow_value = total_borrow * (borrow_price as u128) * 10000;

        let has_borrow = total_borrow > 0;
        let under_collateralized = collateral_with_threshold < borrow_value;
        let is_liquidatable = has_borrow && under_collateralized;

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

        let principal_payment = actual_repay - interest_payment;
        user_state.borrow_amount = user_state.borrow_amount - 
            principal_payment.min(user_state.borrow_amount);

        // Update pool state
        pool_state.total_deposits = pool_state.total_deposits - seized;
        pool_state.total_borrows = pool_state.total_borrows - 
            principal_payment.min(pool_state.total_borrows);
        pool_state.accumulated_interest = 
            pool_state.accumulated_interest + interest_payment;

        let output = ConfidentialLiquidateOutput {
            new_user_state: user_state,
            liquidated: is_liquidatable,
        };

        (
            repay_amount_ctxt.owner.from_arcis(output),
            Mxe::get().from_arcis(pool_state),
        )
    }

    // ============================================================
    // CONFIDENTIAL Interest Circuit (NEW - No Amount Revealed)
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

    // ============================================================
    // LEGACY CIRCUITS REMOVED
    // ============================================================
    //
    // SECURITY AUDIT: The following legacy circuits were removed because
    // they revealed transaction amounts in their outputs:
    //
    // - compute_deposit → revealed deposit_delta
    // - compute_borrow → revealed borrow_delta  
    // - compute_withdraw → revealed withdraw_delta
    // - compute_repay → revealed repay_delta
    // - compute_liquidate → revealed repay_delta, collateral_seized
    // - compute_interest → revealed interest_accrued
    //
    // Use the confidential versions instead:
    // - compute_confidential_deposit
    // - compute_confidential_borrow
    // - compute_confidential_withdraw
    // - compute_confidential_repay
    // - compute_confidential_liquidate
    // - compute_confidential_interest
    //
    // These only reveal success/approval flags, never amounts.
}

