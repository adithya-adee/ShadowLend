# ShadowLend Development Guide

## Overview

ShadowLend is a **privacy-preserving lending protocol** on Solana using **Arcium MXE** for confidential computation. This document explains the implemented architecture and common patterns.

---

## Architecture: Hybrid Privacy Model

> [!IMPORTANT]
> ShadowLend uses a **Hybrid Privacy** model, NOT the original "Two-Phase Deposit" design.

### What's Private

| Data | Status | Why |
|------|--------|-----|
| User Balances | ✅ PRIVATE | Stored as `Enc<Shared, UserState>` |
| Health Factors | ✅ PRIVATE | Computed inside Arcium MXE |
| Pool Totals | ✅ PRIVATE | Stored as `Enc<Mxe, PoolState>` |

### What's Public

| Data | Status | Why |
|------|--------|-----|
| Transfer Amounts | PUBLIC | SPL Token compatibility |
| Liquidation Events | PUBLIC | Protocol safety |

---

## Instruction Flows

### Atomic Operations (Transfer BEFORE Computation)

**Deposit & Repay** use atomic flows:
1. Handler performs SPL transfer (User → Vault)
2. Handler queues Arcium computation with **plaintext** amount
3. Circuit updates encrypted balances
4. Callback verifies success and stores state

```rust
// deposit/handler.rs pattern
token::transfer(..., amount)?;  // Transfer FIRST
let args = ArgBuilder::new()
    .plaintext_u64(amount)       // Plaintext to circuit
    ...
```

### Revealed Operations (Computation BEFORE Transfer)

**Borrow, Withdraw, Liquidate** reveal amounts in callbacks:
1. Handler queues computation with **encrypted** amount
2. Circuit verifies HF privately, outputs `revealed_amount`
3. Callback reads revealed amount and performs SPL transfer

```rust
// borrow/callback.rs pattern
let approved = user_output.ciphertexts[4][0] != 0;
let amount = u64::from_le_bytes(user_output.ciphertexts[5][0..8]...);
token::transfer(..., amount)?;  // Transfer AFTER verification
```

---

## Circuit Output Structure

All circuits return outputs in this ciphertext layout:

| Index | Content | Type |
|-------|---------|------|
| 0-3 | `UserState` (4 u128 fields) | Encrypted |
| 4 | `approved` / `success` flag | Revealed bool |
| 5 | `revealed_amount` (if applicable) | Revealed u64 |
| 6 | `revealed_seized` (liquidate only) | Revealed u64 |

> [!CAUTION]
> Do NOT use `ciphertexts.len() - 1` to find amounts. Use explicit indices.

---

## Common Mistakes to Avoid

### ❌ Wrong: Using encrypted amount for atomic operations
```rust
// BAD - Deposit should use plaintext
.encrypted_u128(encrypted_amount)
```

### ✅ Correct: Use plaintext for atomic operations
```rust
// GOOD - Deposit uses plaintext (already transferred)
.plaintext_u64(amount)
```

### ❌ Wrong: Forgetting encrypted_pool_state
```rust
// BAD - Missing pool state for liquidity checks
let args = ArgBuilder::new()
    .encrypted_u128(user_state[0..32]...)
    .encrypted_u128(user_state[32..64]...)
    // Missing pool state!
```

### ✅ Correct: Always include pool state
```rust
// GOOD - Include pool state for all operations
let args = ArgBuilder::new()
    .encrypted_u128(user_state[0..32]...)
    .encrypted_u128(user_state[32..64]...)
    .encrypted_u128(pool_state[0..32]...)   // Pool state
    .encrypted_u128(pool_state[32..64]...)  // Pool state
```

---

## File Structure

```
shadowlend_program/
├── encrypted-ixs/src/lib.rs      # Arcium circuits
├── programs/shadowlend_program/
│   ├── src/
│   │   ├── lib.rs                # Program entry + instruction routing
│   │   ├── instructions/
│   │   │   ├── deposit/
│   │   │   │   ├── handler.rs    # Atomic: transfer → compute
│   │   │   │   ├── callback.rs   # State update only
│   │   │   │   └── accounts.rs   # Token accounts included
│   │   │   ├── borrow/
│   │   │   │   ├── handler.rs    # Compute with encrypted amount
│   │   │   │   └── callback.rs   # Reveal → transfer
│   │   │   ├── withdraw/         # Same as borrow
│   │   │   ├── repay/
│   │   │   │   ├── handler.rs    # Atomic: transfer → compute
│   │   │   │   └── callback.rs   # State update only
│   │   │   └── liquidate/
│   │   │       ├── handler.rs    # Compute with plaintext repay
│   │   │       └── callback.rs   # Reveal → dual transfer
│   │   ├── state/                # Pool, UserObligation structs
│   │   └── error.rs              # Error codes
```

---

## Testing

```bash
# Build circuits and program
anchor build

# Run with local validator
solana-test-validator --reset
anchor test --skip-local-validator
```

---

## Key Principles

1. **Token transfers happen in Solana handlers, not Arcium circuits**
2. **Atomic operations = transfer first, then compute**
3. **Revealed operations = compute first, then transfer revealed amount**
4. **Always pass encrypted pool state to circuits**
5. **Use explicit ciphertext indices, not array length**
6. **Always pass Pyth oracle accounts to borrow/withdraw/liquidate**

---

## Pyth Oracle Integration

> [!IMPORTANT]
> Pyth oracle is used for real-time pricing. **All borrow, withdraw, and liquidate instructions require Pyth price update accounts.**

### Feed IDs (Mainnet & Devnet)

| Asset | Feed ID |
|-------|---------|
| SOL/USD | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| USDC/USD | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |

### Account Structure

```rust
// borrow/withdraw/liquidate accounts.rs
pub struct Borrow<'info> {
    // ... other accounts ...
    
    /// CHECK: Pyth SOL/USD price update - validated in handler
    pub sol_price_update: UncheckedAccount<'info>,
    
    /// CHECK: Pyth USDC/USD price update - validated in handler
    pub usdc_price_update: UncheckedAccount<'info>,
}
```

### Handler Pattern

```rust
// Read prices before building Arcium args
let clock = Clock::get()?;
let sol_price_cents = get_price_from_pyth_account(
    &ctx.accounts.sol_price_update.to_account_info(),
    &SOL_USD_FEED_ID,
    &clock,
)?;
let usdc_price_cents = get_price_from_pyth_account(
    &ctx.accounts.usdc_price_update.to_account_info(),
    &USDC_USD_FEED_ID,
    &clock,
)?;
```

---

## Pyth Integration Mistakes to Avoid

### ❌ Wrong: Using `pyth-solana-receiver-sdk`

```toml
# BAD - SDK incompatible with solana-program 2.x
pyth-solana-receiver-sdk = "0.5.0"
```

### ✅ Correct: Manual account parsing

```rust
// GOOD - Use custom parser in constants.rs
use crate::constants::{get_price_from_pyth_account, SOL_USD_FEED_ID};

let price = get_price_from_pyth_account(&account, &SOL_USD_FEED_ID, &clock)?;
```

### ❌ Wrong: Using `Account<PriceUpdateV2>` type

```rust
// BAD - PriceUpdateV2 requires incompatible SDK
pub sol_price_update: Account<'info, PriceUpdateV2>,
```

### ✅ Correct: Using `UncheckedAccount`

```rust
// GOOD - Manual validation in handler
/// CHECK: Validated via get_price_from_pyth_account
pub sol_price_update: UncheckedAccount<'info>,
```

### ❌ Wrong: Forgetting oracle accounts

```rust
// BAD - Missing price feeds for HF calculation
pub struct Borrow<'info> {
    pub payer: Signer<'info>,
    pub pool: Account<'info, Pool>,
    // Missing sol_price_update and usdc_price_update!
}
```

### ❌ Wrong: Not checking price staleness

```rust
// BAD - Stale prices can be exploited
let price = account.data[offset..];  // No age check!
```

### ✅ Correct: Use staleness check

```rust
// GOOD - Enforces 30 second max age
let price = get_price_from_pyth_account(&account, feed_id, &clock)?;  // Built-in check
```

