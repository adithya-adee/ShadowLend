use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Deposit circuit: Adds amount to encrypted collateral balance
    #[instruction]
    pub fn deposit(
        amount: u64,
        current_encrypted: Enc<Shared, u128>,
        is_initialized: u8,
    ) -> Enc<Shared, u128> {
        let current = if is_initialized == 0 {
            0
        } else {
            current_encrypted.to_arcis()
        };
        let new_balance = current + amount as u128;
        current_encrypted.owner.from_arcis(new_balance)
    }

    /// Withdraw circuit: Subtracts amount from encrypted collateral if sufficient
    #[instruction]
    pub fn withdraw(
        amount: u64,
        current_encrypted: Enc<Shared, u128>,
        current_borrow: Enc<Shared, u128>,
        ltv_bps: u64,
        is_collateral_initialized: u8,
        is_borrow_initialized: u8,
    ) -> (Enc<Shared, u128>, u8, u64) {
        let collateral = if is_collateral_initialized == 0 {
            0
        } else {
            current_encrypted.to_arcis()
        };

        let borrow = if is_borrow_initialized == 0 {
            0
        } else {
            current_borrow.to_arcis()
        };

        // Check if withdrawal maintains health AND sufficient collateral
        let amount_u128 = amount as u128;
        let sufficient_collateral = amount_u128 <= collateral;

        let new_collateral = if sufficient_collateral {
            collateral - amount_u128
        } else {
            collateral
        };

        // Health check: new_collateral * 10000 >= borrow * ltv_bps
        let lhs = new_collateral * 10000;
        let rhs = borrow * (ltv_bps as u128);
        let health_ok = lhs >= rhs;

        let approved = sufficient_collateral && health_ok;

        let final_collateral = if approved { new_collateral } else { collateral };

        // Reveal the boolean as u8 (1 = approved, 0 = rejected)
        let approved_u8 = if approved { 1u8 } else { 0u8 };
        // Pass through amount
        let amount_out = amount;

        (
            current_encrypted.owner.from_arcis(final_collateral),
            approved_u8.reveal(),
            amount_out.reveal(),
        )
    }

    /// Borrow circuit: Checks health factor and updates debt if approved
    #[instruction]
    pub fn borrow(
        amount: u64,
        collateral: Enc<Shared, u128>,
        current_debt: Enc<Shared, u128>,
        ltv_bps: u64,
        is_collateral_initialized: u8,
        is_debt_initialized: u8,
    ) -> (Enc<Shared, u128>, u8, u64) {
        let col = if is_collateral_initialized == 0 {
            0
        } else {
            collateral.to_arcis()
        };
        let debt = if is_debt_initialized == 0 {
            0
        } else {
            current_debt.to_arcis()
        };

        let new_debt = debt + amount as u128;

        // Optimized health check without division:
        // new_debt * 10000 <= col * ltv_bps
        let lhs = new_debt * 10000;
        let rhs = col * (ltv_bps as u128);

        let approved = lhs <= rhs;

        let final_debt = if approved { new_debt } else { debt };

        // Reveal the boolean as u8 (1 = approved, 0 = rejected)
        let approved_u8 = if approved { 1u8 } else { 0u8 };
        // Pass through amount
        let amount_out = amount;

        (
            current_debt.owner.from_arcis(final_debt),
            approved_u8.reveal(),
            amount_out.reveal(),
        )
    }

    /// Repay circuit: Subtracts repayment from encrypted debt
    #[instruction]
    pub fn repay(
        amount: u64,
        current_debt: Enc<Shared, u128>,
        is_debt_initialized: u8,
    ) -> Enc<Shared, u128> {
        let debt = if is_debt_initialized == 0 {
            0
        } else {
            current_debt.to_arcis()
        };
        let new_debt = if amount as u128 >= debt {
            0
        } else {
            debt - amount as u128
        };
        current_debt.owner.from_arcis(new_debt)
    }

    /// Liquidate circuit: Checks if user is under-collateralized and liquidates if true.
    /// Returns: (NewEncCollateral, NewEncDebt, IsLiquidatable(0/1), SeizedCollateral, RepaidDebt)
    #[instruction]
    pub fn liquidate(
        amount: u64,
        current_collateral: Enc<Shared, u128>,
        current_debt: Enc<Shared, u128>,
        liquidation_threshold: u64,
        is_collateral_initialized: u8,
        is_debt_initialized: u8
    ) -> (Enc<Shared, u128>, Enc<Shared, u128>, u64, u64, u64) {
        let col = if is_collateral_initialized == 0 {
            0
        } else {
            current_collateral.to_arcis()
        };
        let debt = if is_debt_initialized == 0 {
            0
        } else {
            current_debt.to_arcis()
        };

        // Health Check: Is Debt * 10000 >= Collateral * Threshold?
        // Standard DeFi: If HF < 1.0, liquidate.
        // HF = (Col * Threshold) / Debt.
        // If (Col * Threshold) < (Debt * 10000), HF < 1.0, user is liquidatable.
        let lhs = col * (liquidation_threshold as u128);
        let rhs = debt * 10000;
        
        // Liquidatable if Collateral Value (adjusted by threshold) is LESS than Debt Value
        let is_liquidatable = lhs < rhs;

        // Calculate seizure amounts (if liquidatable)
        // Seized Collateral = Repay Amount (Assuming 1:1 price for MVP)
        // Cap seizure at total collateral
        let amount_u128 = amount as u128;
        let actual_seize = if amount_u128 > col { col } else { amount_u128 };
        
        // Calculate Repaid Debt
        // Cap repayment at total debt
        let actual_repay = if amount_u128 > debt { debt } else { amount_u128 };

        // New Balances
        let new_col = if is_liquidatable { col - actual_seize } else { col };
        let new_debt = if is_liquidatable { debt - actual_repay } else { debt };

        // Output Values
        let is_liq_u64 = if is_liquidatable { 1u64 } else { 0u64 };
        let out_seize = if is_liquidatable { actual_seize } else { 0 };
        let out_repay = if is_liquidatable { actual_repay } else { amount_u128 }; 

        (
            current_collateral.owner.from_arcis(new_col),
            current_debt.owner.from_arcis(new_debt),
            is_liq_u64.reveal(),
            (out_seize as u64).reveal(),
            (out_repay as u64).reveal()
        )
    }
}
