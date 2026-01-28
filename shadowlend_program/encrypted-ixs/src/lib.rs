use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct UserState {
        pub deposit: u128,
        pub debt: u128,
        pub internal: u128,
    }

    /// Deposit circuit: Adds amount to encrypted collateral balance
    #[instruction]
    pub fn deposit(
        amount: u64,
        user_state: Enc<Shared, UserState>,
        is_initialized: u8,
    ) -> Enc<Shared, UserState> {
        let mut state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        state.deposit = state.deposit + amount as u128;

        user_state.owner.from_arcis(state)
    }

    /// Withdraw circuit: Subtracts amount from encrypted collateral if sufficient
    #[instruction]
    pub fn withdraw(
        amount: u64,
        user_state: Enc<Shared, UserState>,
        ltv_bps: u64,
        is_initialized: u8, // Now just one flag for the whole state struct
    ) -> (Enc<Shared, UserState>, u8, u64) {
        let state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        // Check if withdrawal maintains health AND sufficient collateral
        let amount_u128 = amount as u128;
        let sufficient_collateral = amount_u128 <= state.deposit;

        let new_deposit = if sufficient_collateral {
            state.deposit - amount_u128
        } else {
            state.deposit
        };

        // Health check: new_deposit * 10000 >= debt * ltv_bps
        let lhs = new_deposit * 10000;
        let rhs = state.debt * (ltv_bps as u128);
        let health_ok = lhs >= rhs;

        let approved = sufficient_collateral && health_ok;

        let final_deposit = if approved { new_deposit } else { state.deposit };

        let mut final_state = state;
        final_state.deposit = final_deposit;

        // Reveal the boolean as u8 (1 = approved, 0 = rejected)
        let approved_u8 = if approved { 1u8 } else { 0u8 };
        // Pass through amount
        let amount_out = amount;

        (
            user_state.owner.from_arcis(final_state),
            approved_u8.reveal(),
            amount_out.reveal(),
        )
    }

    /// Borrow circuit: Checks health factor and updates debt/internal balance if approved
    #[instruction]
    pub fn borrow(
        user_state: Enc<Shared, UserState>,
        amount: Enc<Shared, u128>,
        ltv_bps: u64,
        is_initialized: u8,
    ) -> (Enc<Shared, UserState>, u8) {
        let state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        let amt = amount.to_arcis();

        let new_debt = state.debt + amt;
        let new_internal = state.internal + amt;

        // Optimized health check without division:
        // new_debt * 10000 <= deposit * ltv_bps
        let lhs = new_debt * 10000;
        let rhs = state.deposit * (ltv_bps as u128);

        let approved = lhs <= rhs;

        // Capture values before move
        let current_debt = state.debt;
        let current_internal = state.internal;

        let mut final_state = state;
        final_state.debt = if approved { new_debt } else { current_debt };
        final_state.internal = if approved {
            new_internal
        } else {
            current_internal
        };

        // Reveal the boolean as u8 (1 = approved, 0 = rejected)
        let approved_u8 = if approved { 1u8 } else { 0u8 };

        (
            user_state.owner.from_arcis(final_state),
            approved_u8.reveal(),
        )
    }

    /// Repay circuit: Subtracts repayment from encrypted debt
    #[instruction]
    pub fn repay(
        amount: u64,
        user_state: Enc<Shared, UserState>,
        is_initialized: u8,
    ) -> Enc<Shared, UserState> {
        let state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        let new_debt = if amount as u128 >= state.debt {
            0
        } else {
            state.debt - amount as u128
        };

        let mut final_state = state;
        final_state.debt = new_debt;

        user_state.owner.from_arcis(final_state)
    }

    /// Liquidate circuit: Checks if user is under-collateralized and liquidates if true.
    /// Returns: (NewUserState, IsLiquidatable(0/1), SeizedCollateral, RepaidDebt)
    #[instruction]
    pub fn liquidate(
        amount: u64,
        user_state: Enc<Shared, UserState>,
        liquidation_threshold: u64,
        is_initialized: u8,
    ) -> (Enc<Shared, UserState>, u64, u64, u64) {
        let state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        // Health Check: Is Debt * 10000 >= Collateral * Threshold?
        // Standard DeFi: If HF < 1.0, liquidate.
        // HF = (Col * Threshold) / Debt.
        // If (Col * Threshold) < (Debt * 10000), HF < 1.0, user is liquidatable.
        let lhs = state.deposit * (liquidation_threshold as u128);
        let rhs = state.debt * 10000;

        // Liquidatable if Collateral Value (adjusted by threshold) is LESS than Debt Value
        let is_liquidatable = lhs < rhs;

        // Calculate seizure amounts (if liquidatable)
        // Seized Collateral = Repay Amount (Assuming 1:1 price for MVP)
        // Cap seizure at total collateral
        let amount_u128 = amount as u128;
        let actual_seize = if amount_u128 > state.deposit {
            state.deposit
        } else {
            amount_u128
        };

        // Calculate Repaid Debt
        // Cap repayment at total debt
        let actual_repay = if amount_u128 > state.debt {
            state.debt
        } else {
            amount_u128
        };

        // Capture values before move
        let current_deposit = state.deposit;
        let current_debt = state.debt;

        let mut final_state = state;

        // New Balances
        final_state.deposit = if is_liquidatable {
            current_deposit - actual_seize
        } else {
            current_deposit
        };
        final_state.debt = if is_liquidatable {
            current_debt - actual_repay
        } else {
            current_debt
        };

        // Output Values
        let is_liq_u64 = if is_liquidatable { 1u64 } else { 0u64 };
        let out_seize = if is_liquidatable { actual_seize } else { 0 };
        let out_repay = if is_liquidatable {
            actual_repay
        } else {
            amount_u128
        };

        (
            user_state.owner.from_arcis(final_state),
            is_liq_u64.reveal(),
            (out_seize as u64).reveal(),
            (out_repay as u64).reveal(),
        )
    }

    /// Spend circuit: Downgrades internal balance to public output.
    /// Returns: (NewUserState, Approved(0/1), Amount)
    #[instruction]
    pub fn spend(
        amount: u64,
        user_state: Enc<Shared, UserState>,
        is_initialized: u8,
    ) -> (Enc<Shared, UserState>, u8, u64) {
        let state = if is_initialized == 0 {
            UserState {
                deposit: 0,
                debt: 0,
                internal: 0,
            }
        } else {
            user_state.to_arcis()
        };

        let amount_u128 = amount as u128;

        // Capture before move
        let current_internal = state.internal;

        let sufficient = current_internal >= amount_u128;

        let new_internal = if sufficient {
            current_internal - amount_u128
        } else {
            current_internal
        };

        let mut final_state = state;
        final_state.internal = new_internal;

        let approved_u8 = if sufficient { 1u8 } else { 0u8 };

        (
            user_state.owner.from_arcis(final_state),
            approved_u8.reveal(),
            amount,
        )
    }
}
