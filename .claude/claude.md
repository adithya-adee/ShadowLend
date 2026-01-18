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

---

## Arcium PDA Issues and Fixes (v0.5.x Legacy)

> [!IMPORTANT]
> These are critical mistakes discovered while integrating Arcium SDK v0.5.4.
> **For v0.6.2+ migration, see the [Arcium v0.6.2 Migration Guide](#arcium-v062-migration-guide) section below.**

### Documentation Links

- [Arcium v0.5 Migration Guide](https://docs.arcium.com/developers/migration/migration-v0.4-to-v0.5)
- [Arcium JS Client Library](https://docs.arcium.com/developers/js-client-library)
- [Arcium Encryption Guide](https://docs.arcium.com/developers/js-client-library/encryption)
- [Computation Definition Accounts](https://docs.arcium.com/developers/program/computation-def-accs)

---

### Issue 1: `ID_CONST` Import Conflict (comp_def PDA Mismatch)

**Symptom:** `ConstraintSeeds` or `ConstraintAddress` error on `comp_def_account`

**Root Cause:** The `derive_comp_def_pda!` macro uses `ID_CONST` internally. If you import `ID_CONST` from the wrong source, the PDA is derived with the wrong program ID.

#### ❌ Wrong: Importing Arcium's ID_CONST

```rust
// BAD - This imports Arcium's program ID, not yours!
use arcium_client::idl::arcium::ID_CONST;

#[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
```

#### ✅ Correct: Import from crate root

```rust
// GOOD - declare_id! creates ID_CONST with YOUR program ID
use crate::ID_CONST;

#[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
```

**Explanation:** 
- `declare_id!("YourProgramId")` creates both `ID` and `ID_CONST` at the crate root
- The `derive_comp_def_pda!` macro looks for `ID_CONST` in scope
- Importing `arcium_client::idl::arcium::ID_CONST` shadows your program's ID with Arcium's ID
- Arcium's `InitComputationDefinition` expects your program ID as the seed, causing a mismatch

---

### Issue 2: `sign_pda_account` Constraints Conflict

**Symptom:** `ConstraintSeeds` error - Left and Right PDAs don't match

**Root Cause:** Using both `seeds` and `address = derive_sign_pda!()` causes a conflict because they derive PDAs using different program IDs.

#### ❌ Wrong: Using both seeds AND address constraints

```rust
// BAD - seeds uses YOUR program ID, derive_sign_pda!() uses Arcium's ID_CONST
#[account(
    init_if_needed,
    space = 9,
    payer = payer,
    seeds = [&SIGN_PDA_SEED],
    bump,
    address = derive_sign_pda!(),  // Conflict!
)]
pub sign_pda_account: Account<'info, SignerAccount>,
```

#### ✅ Correct: Use only seeds constraint

```rust
// GOOD - Only use seeds, Anchor derives the PDA with YOUR program ID
#[account(
    init_if_needed,
    space = 9,
    payer = payer,
    seeds = [&SIGN_PDA_SEED],
    bump,
)]
pub sign_pda_account: Account<'info, SignerAccount>,
```

**Explanation:**
- `seeds = [&SIGN_PDA_SEED]` derives PDA using `PublicKey::find_program_address(..., &program_id)`
- `derive_sign_pda!()` internally uses `ID_CONST` which could be wrong if imported incorrectly
- For `sign_pda_account`, you only need the `seeds` constraint - Anchor handles derivation

---

### Issue 3: Missing Bump Assignment

**Symptom:** `AccountNotInitialized` or runtime errors when CPI signing

**Root Cause:** When using `init_if_needed`, you must manually set the bump on the account.

#### ❌ Wrong: Forgetting bump assignment

```rust
// BAD - Bump not set, CPI signing will fail
pub fn deposit_handler(ctx: Context<Deposit>, ...) -> Result<()> {
    // Missing: ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    
    queue_computation(ctx.accounts, ...)?;
    Ok(())
}
```

#### ✅ Correct: Set bump from context

```rust
// GOOD - Set bump for CPI signing
pub fn deposit_handler(ctx: Context<Deposit>, ...) -> Result<()> {
    // Set the bump for the sign_pda_account
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    
    queue_computation(ctx.accounts, ...)?;
    Ok(())
}
```

---

### Issue 4: TypeScript PDA Derivation Mismatch

**Symptom:** `AccountNotInitialized` or `ConstraintAddress` on client side

**Root Cause:** TypeScript uses different program ID than on-chain derivation.

#### ❌ Wrong: Using Arcium program ID for comp_def

```typescript
// BAD - Using Arcium program ID
const arciumProgramId = getArciumProgramId();
const compDefAccount = getCompDefAccAddress(arciumProgramId, compDefOffsetNum);
```

#### ✅ Correct: Use YOUR program ID

```typescript
// GOOD - Use your program ID
const compDefAccount = getCompDefAccAddress(program.programId, compDefOffsetNum);
```

---

### Issue 5: signPdaAccount Not Needed in Client

**Symptom:** N/A (but cleaner code)

**Root Cause:** When `sign_pda_account` uses `seeds` constraint, Anchor auto-derives it.

#### ❌ Wrong: Manually passing signPdaAccount

```typescript
// BAD - Unnecessary manual derivation
const [signPda] = deriveSignerPda(program.programId);

.accountsPartial({
    // ...
    signPdaAccount: signPda,  // Not needed!
})
```

#### ✅ Correct: Let Anchor derive it

```typescript
// GOOD - Anchor derives from seeds constraint automatically
.accountsPartial({
    computationAccount: arciumAccounts.computationAccount,
    clusterAccount: arciumAccounts.clusterAccount,
    mxeAccount: arciumAccounts.mxeAccount,
    // signPdaAccount omitted - auto-derived
})
```

---

### Quick Reference: Correct Import Pattern

```rust
// src/lib.rs
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

declare_id!("YourProgramIdHere");  // Creates ID and ID_CONST

#[arcium_program]
pub mod your_program {
    use super::*;
    // ...
}
```

```rust
// src/instructions/deposit/accounts.rs
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use crate::{SignerAccount, ID};
use crate::ID_CONST;  // From declare_id!, NOT from arcium_client

#[queue_computation_accounts("compute_confidential_deposit", payer)]
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    
    #[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_DEPOSIT))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    // ...
}
```

---

### MxeKeysNotSet Error

**Symptom:** `MxeKeysNotSet` error when calling `queue_computation`

**Cause:** This is an **Arcium devnet infrastructure issue**, not your code.

> "The MXE keys are not set, i.e. not all the nodes of the MXE cluster agreed on the MXE keys."

**Solutions:**
1. Wait for MXE cluster to be ready (nodes need to complete key exchange)
2. Try a different cluster offset
3. Contact Arcium support about devnet cluster availability

---

## Arcium v0.6.2 Migration Guide

> [!IMPORTANT]
> These changes are REQUIRED when upgrading from Arcium v0.5.x to v0.6.2+

### Migration Checklist

| Change | Files Affected |
|--------|----------------|
| `SignerAccount` → `ArciumSignerAccount` | All `accounts.rs` files (type and import) |
| `&SIGN_PDA_SEED` → `b"ArciumSignerAccount"` | All `accounts.rs` files (PDA seeds) |
| Add `mut` to `clock_account` | All `accounts.rs` files |
| Add `crate::ID` import | All `accounts.rs` files |
| `arcis-imports` → `arcis` | `encrypted-ixs/Cargo.toml` |
| `use arcis_imports::*` → `use arcis::*` | `encrypted-ixs/src/lib.rs` |
| `@arcium-hq/client` → `0.6.2` | `package.json` |
| TypeScript PDA seed → `"ArciumSignerAccount"` | All TS files deriving signer PDA |

---

### Issue 1: SignerAccount Renamed to ArciumSignerAccount

**Symptom:** Compilation errors about missing `SignerAccount` type.

**Root Cause:** Arcium v0.6.2 renamed `SignerAccount` to `ArciumSignerAccount`.

#### ❌ Wrong: Using old type name

```rust
// BAD - SignerAccount no longer exists in Arcium v0.6.2
use arcium_anchor::prelude::SignerAccount;

pub sign_pda_account: Account<'info, SignerAccount>,
```

#### ✅ Correct: Use new type name

```rust
// GOOD - Use ArciumSignerAccount from arcium_anchor::prelude::*
pub sign_pda_account: Account<'info, ArciumSignerAccount>,
```

---

### Issue 2: PDA Seed Changed

**Symptom:** `ConstraintSeeds` error - PDA derivation mismatch.

**Root Cause:** The PDA seed must now be `b"ArciumSignerAccount"` instead of `&SIGN_PDA_SEED`.

#### ❌ Wrong: Using old SIGN_PDA_SEED constant

```rust
// BAD - SIGN_PDA_SEED may contain old "SignerAccount" value
#[account(
    init_if_needed,
    space = 9,
    payer = payer,
    seeds = [&SIGN_PDA_SEED],
    bump,
)]
pub sign_pda_account: Account<'info, ArciumSignerAccount>,
```

#### ✅ Correct: Use literal bytes

```rust
// GOOD - Use literal bytes matching Arcium v0.6.2
#[account(
    init_if_needed,
    space = 9,
    payer = payer,
    seeds = [b"ArciumSignerAccount"],
    bump,
)]
pub sign_pda_account: Account<'info, ArciumSignerAccount>,
```

**TypeScript Update Required:**

```typescript
// Update all PDA derivations
const signPdaAccount = PublicKey.findProgramAddressSync(
  [Buffer.from("ArciumSignerAccount")],  // NOT "SignerAccount"
  programId
)[0];
```

---

### Issue 3: ClockAccount Must Be Mutable

**Symptom:** `clock_account must be mutable` error during build.

**Root Cause:** Arcium v0.6.2 requires the clock account to be mutable.

#### ❌ Wrong: Read-only clock account

```rust
// BAD - Missing mut constraint
#[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
pub clock_account: Box<Account<'info, ClockAccount>>,
```

#### ✅ Correct: Mutable clock account

```rust
// GOOD - Add mut constraint
#[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
pub clock_account: Box<Account<'info, ClockAccount>>,
```

---

### Issue 4: Missing ID Import for Macros

**Symptom:** `cannot find value ID in this scope` on `derive_mxe_pda!()` macro.

**Root Cause:** Arcium macros require `crate::ID` to be in scope.

#### ❌ Wrong: Only importing ID_CONST

```rust
// BAD - Missing ID import
use crate::ID_CONST;
```

#### ✅ Correct: Import both ID and ID_CONST

```rust
// GOOD - Import both for macro compatibility
use crate::{ID, ID_CONST};
```

---

### Issue 5: Arcis Import Migration

**Symptom:** Compilation errors in `encrypted-ixs/src/lib.rs`.

**Root Cause:** The `arcis-imports` crate was renamed to `arcis` in v0.6.2.

#### Cargo.toml Update

```toml
# Before (v0.5.x)
arcis-imports = { version = "0.5.x", ... }

# After (v0.6.2)
arcis = { version = "0.6.2", ... }
```

#### Rust Import Update

```rust
// Before (v0.5.x)
use arcis_imports::*;

// After (v0.6.2)
use arcis::*;
```

---

### Quick Reference: Correct v0.6.2 Pattern

```rust
// src/instructions/deposit/accounts.rs (v0.6.2 pattern)
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::state::{Pool, UserObligation};
use crate::ArciumSignerAccount;  // Re-exported from lib.rs
use crate::{ID, ID_CONST};       // Both required for macros
use crate::error::ErrorCode;

#[queue_computation_accounts("compute_confidential_deposit", payer)]
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    // ... other accounts ...
    
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],  // Literal bytes, NOT constant
        bump,
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]  // Must be mut
    pub clock_account: Box<Account<'info, ClockAccount>>,
    
    // ... rest of accounts ...
}
```

```rust
// src/lib.rs (v0.6.2 pattern)
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

declare_id!("YourProgramIdHere");

// Re-export ArciumSignerAccount for use in instruction modules
pub use arcium_anchor::prelude::ArciumSignerAccount;
```

---

### Version Reference

| Package | v0.5.x | v0.6.2+ |
|---------|--------|---------|
| `@arcium-hq/client` | `0.5.4` | `0.6.2` |
| `arcis` (Cargo) | `arcis-imports` | `arcis` |
| Type name | `SignerAccount` | `ArciumSignerAccount` |
| PDA seed | `"SignerAccount"` | `"ArciumSignerAccount"` |
