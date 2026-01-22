use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Deposit circuit: Adds amount to encrypted collateral balance
    #[instruction]
    pub fn deposit(amount: u64, current_encrypted: Enc<Shared, u128>) -> Enc<Shared, u128> {
        let current = current_encrypted.to_arcis();
        let new_balance = current + amount as u128;
        current_encrypted.owner.from_arcis(new_balance)
    }

    /// Withdraw circuit: Subtracts amount from encrypted collateral if sufficient
    #[instruction]
    pub fn withdraw(
        amount: u64,
        current_encrypted: Enc<Shared, u128>,
        current_borrow: &Enc<Shared, u128>,
        ltv_bps: u64,
    ) -> (Enc<Shared, u128>, u8, u64) {
        let collateral = current_encrypted.to_arcis();
        let borrow = current_borrow.to_arcis();

        // Check if withdrawal maintains health
        let new_collateral = if amount as u128 <= collateral {
            collateral - amount as u128
        } else {
            collateral
        };

        // Health check: new_collateral * 10000 >= borrow * ltv_bps
        // Avoiding division for efficiency
        let approved = new_collateral * 10000 >= borrow * (ltv_bps as u128);

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
        collateral: &Enc<Shared, u128>,
        current_debt: Enc<Shared, u128>,
        ltv_bps: u64,
    ) -> (Enc<Shared, u128>, u8, u64) {
        let col = collateral.to_arcis();
        let debt = current_debt.to_arcis();

        let new_debt = debt + amount as u128;

        // Optimized health check without division:
        // new_debt * 10000 <= col * ltv_bps
        let approved = new_debt * 10000 <= col * (ltv_bps as u128);

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
    pub fn repay(amount: u64, current_debt: Enc<Shared, u128>) -> Enc<Shared, u128> {
        let debt = current_debt.to_arcis();
        let new_debt = if amount as u128 >= debt {
            0
        } else {
            debt - amount as u128
        };
        current_debt.owner.from_arcis(new_debt)
    }
}
