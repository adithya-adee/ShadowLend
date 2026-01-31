# ShadowLend V3: Private Credit Architecture

## The Problem: Transaction History Leaks State
In the V2 (Hybrid Privacy) model, every `Borrow` instruction is accompanied by a public SPL Token Transfer to the user's wallet.
*   **Leak:** `Transaction Amount` = `Borrow Amount`.
*   **Vulnerability:** An observer can sum up all historical transactions to calculate the exact `Total Debt` and `Health Factor` of a user. This allows bots to track user health and "snipe" liquidations, defeating the purpose of a private lending protocol.

## The Solution: Decoupled Credit & Spending
To solve this, we introduce the **Private Credit Account (PCA)** model. We separate the act of "taking a loan" (increasing debt) from the act of "utilizing funds" (spending/withdrawing).

### Core Concept: The Internal Balance
We introduce a new encrypted field to the `UserObligation` state:
*   `encrypted_internal_balance`: Represents funds borrowed but not yet withdrawn/spent.

The workflow changes from 1 step to 2 steps:

### 1. The `ConfidentialBorrow` Instruction (Internal)
The user requests to increase their debt limit and credit their internal balance.
*   **Input:** `EncryptedAmount`.
*   **Action:** 
    1.  Arcium validates: `Collateral / (CurrentDebt + Amount) > LTV`.
    2.  Arcium updates:
        *   `EncryptedDebt += Amount`
        *   `EncryptedInternalBalance += Amount`
*   **On-Chain Visibility:** 
    *   Observer sees: "User A called ConfidentialBorrow".
    *   Reference: **NO Token Transfer** occurs.
    *   Data: The amount is encrypted in the instruction arguments.
*   **Privacy Gain:** The observer **cannot** know how much was borrowed. The user's `Total Debt` is now completely hidden from the history log.

### 2. The `PrivateSpend` Instruction (External)
The user requests to use their borrowed funds to pay a 3rd party or withdraw to themselves.
*   **Input:** `ClearAmount`, `RecipientAddress`, `Proof/Signature`.
*   **Action:**
    1.  Arcium validates: `EncryptedInternalBalance >= ClearAmount`.
    2.  Arcium updates: `EncryptedInternalBalance -= ClearAmount`.
    3.  Program transfers `ClearAmount` from `BorrowVault` to `RecipientAddress`.
*   **On-Chain Visibility:**
    *   Observer sees: "User A sent X tokens to Recipient".
*   **Privacy Consequence:**
    *   The observer knows the user *spent* X.
    *   **Crucially**, the observer does **NOT** know if the user's Total Debt is X, 10X, or 100X.
    *   The observer cannot calculate the Health Factor because the denominator (Total Debt) is unknown. 

## Privacy Guarantees

| Data Point | V2 (Current) | V3 (Private Credit) |
| :--- | :--- | :--- |
| **Borrow Event** | Public Amount | **Hidden (Encrypted)** |
| **Total Debt** | Calculable (Sum of History) | **Hidden** |
| **Health Factor** | Calculable | **Hidden** |
| **Liquidation Price** | Calculable | **Hidden** |
| **Spend Destination** | Public | Public |
| **Spend Amount** | Public | Public |


## Why Tracking is Impossible: The Security Explanation

The fundamental innovation in V3 is the **Credit-Spend Decoupling**.

### 1. The Denominator Problem
In V2, the Health Factor formula is effectively public:
$$ \text{Health} = \frac{\text{Total Collateral} \times \text{LTV}}{\text{Total Debt}} $$
Because `Total Debt` was visible (sum of all borrow transfers), any observer could calculate `Health`.

In V3, `ConfidentialBorrow` increases `Total Debt` **without** any public transfer.
*   **Result:** The denominator `Total Debt` becomes an unknown variable $X$.
*   **Consequence:** Even if an observer knows your Collateral and LTV, they cannot solve the equation. The Health Factor is mathematically indeterminate to an outsider.

### 2. The Spending Decoy
When you execute `PrivateSpend` (e.g., withdraw 50 USDC), an observer sees 50 USDC leaving the vault.
*   **Observer Assumption:** "User A has 50 USDC of debt."
*   **Reality:** User A might have `1,000,000 USDC` of debt (borrowed confidentially) and is just spending `50`.
*   **Conclusion:** The public "Spend Amount" has **zero correlation** with the "Total Debt". It acts as a decoy, providing no useful information about the user's actual solvency or liquidation price.

This architecture makes ShadowLend resistant to:
*   **Liquidation Sniping:** Bots cannot calculate user health.
*   **Financial Profiling:** Analytics firms cannot estimate a user's leverage or risk appetite.



### 1. State Update (`UserObligation`)
We add a new encrypted field: `encrypted_internal_balance`.

**Why is this needed?**
Think of this like a bank account.
*   **V2 (Old):** When you borrowed, the bank handed you cash immediately. This made the loan amount public.
*   **V3 (New):** When you borrow, the bank deposits the funds into your **Internal Confidential Account**. You now have "Credit" available to spend.
    *   `encrypted_borrow` tracks what you **Owe** (Liability).
    *   `encrypted_internal_balance` tracks what you **Have** (Asset inside the secure enclave).
    *   This separation allows you to borrow `1M` (Internal) but only withdraw `50` (External), keeping the `1M` secret.

```rust
pub struct UserObligation {
    // ... existing fields
    pub encrypted_internal_balance: [u8; 32], // New: Available credit to spend
}
```

### 2. Modify Instruction: `borrow` (Internal / Confidential)
*   **Replaces:** The old `borrow` logic.
*   **Type:** Encrypted (Arcium).
*   **Logic:**
    *   Input: `EncryptedAmount`.
    *   Health Check: `Collateral / (CurrentDebt + Amount) > LTV`.
    *   State Update: `Debt += Amount`, `InternalBalance += Amount`.
    *   **NO Token Transfer**.

### 3. New Instruction: `spend` (External / Public Transfer)
*   **Type:** Arcium + CPI.
*   **Logic:**
    *   Input: `PlaintextAmount`, `Recipient`.
    *   Check: `InternalBalance >= PlaintextAmount`.
    *   State Update: `InternalBalance -= PlaintextAmount`.
    *   **Transfer:** Sends tokens from Vault to Recipient.


## Conclusion
This architecture transforms ShadowLend from a simple "Private State" protocol into a **Private Credit Line**. By decoupling the borrowing event from the transfer event, we completely obscure the user's financial health and debt position from external observers, protecting them from predatory analytics and liquidation sniping.
