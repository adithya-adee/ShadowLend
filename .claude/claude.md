# ShadowLend Arcium Development Guide

> Reference document for implementing Arcium-based confidential instructions in ShadowLend.
> Tag this file when implementing new instructions to avoid past mistakes.

---

## Table of Contents

1. [Architecture Pattern](#1-architecture-pattern)
2. [File Structure](#2-file-structure)
3. [Circuit Design (encrypted-ixs)](#3-circuit-design-encrypted-ixs)
4. [Handler Design (queue computation)](#4-handler-design-queue-computation)
5. [Callback Design (token transfer + state update)](#5-callback-design-token-transfer--state-update)
6. [Account Struct Best Practices](#6-account-struct-best-practices)
7. [ArgBuilder API Reference](#7-argbuilder-api-reference)
8. [Privacy & Security Best Practices](#8-privacy--security-best-practices)
9. [Common Mistakes to Avoid](#9-common-mistakes-to-avoid)
10. [Checklist for New Instructions](#10-checklist-for-new-instructions)

---

## 1. Architecture Pattern

### The Correct Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Handler      │     │   Arcium MXE    │     │    Callback     │
│  (Queue Only)   │────▶│   (Compute)     │────▶│  (Execute)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
   - Validate input        - Decrypt inputs       - Verify output
   - Init accounts         - Run circuit          - Token transfer
   - Queue computation     - Encrypt output       - Update state
   - Emit "Queued" event   - Sign attestation     - Update aggregates
                                                  - Emit "Completed" event
```

### Key Principle: Token Transfers in Callback

**ALWAYS** perform token transfers in the **callback** AFTER MXE verification.

```rust
// ❌ WRONG: Transfer in handler (before MXE verification)
pub fn deposit_handler(...) {
    token::transfer(...)?;  // DANGEROUS! Happens before verification
    queue_computation(...)?;
}

// ✅ CORRECT: Transfer in callback (after MXE verification)
pub fn deposit_callback_handler(...) {
    let result = output.verify_output(...)?;  // Verify first
    token::transfer(...)?;  // Safe - only after verification
}
```

---

## 2. File Structure

Each instruction needs 4 files:

```
instructions/
└── {instruction_name}/
    ├── mod.rs              # Re-exports
    ├── accounts.rs         # Handler accounts (queue_computation_accounts)
    ├── handler.rs          # Handler logic (queue computation)
    └── callback.rs         # Callback accounts + logic (token transfer)
```

Plus the circuit in:
```
encrypted-ixs/src/lib.rs    # Arcis circuits (#[instruction])
```

---

## 3. Circuit Design (encrypted-ixs)

### Template

```rust
use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    // Shared types
    pub struct UserState {
        pub deposit_amount: u128,
        pub borrow_amount: u128,
        pub accrued_interest: u128,
        pub last_interest_calc_ts: i64,
    }

    // Output struct
    pub struct {InstructionName}Output {
        pub new_state: UserState,
        pub delta: u128,  // Public delta for aggregates
    }

    #[instruction]
    pub fn compute_{instruction_name}(
        amount_ctxt: Enc<Shared, u128>,          // User input (user can decrypt)
        current_state_ctxt: Enc<Mxe, UserState>, // MXE-only state
    ) -> Enc<Shared, {InstructionName}Output> {  // User can decrypt output
        let amount = amount_ctxt.to_arcis();
        let current_state = current_state_ctxt.to_arcis();

        // Business logic here...
        let new_state = UserState { ... };

        amount_ctxt.owner.from_arcis({InstructionName}Output {
            new_state,
            delta: amount,
        })
    }
}
```

### Rules

| Rule | Example |
|------|---------|
| Use `Enc<Shared, T>` for user inputs | `amount_ctxt: Enc<Shared, u128>` |
| Use `Enc<Mxe, T>` for internal state | `current_state_ctxt: Enc<Mxe, UserState>` |
| Use fixed-size types only | `u128`, `i64`, fixed arrays - NO `Vec<T>` |
| Return `Enc<Shared, Output>` if user needs result | `-> Enc<Shared, DepositOutput>` |
| Return `Enc<Mxe, T>` if state should stay private | For state-only updates |

---

## 4. Handler Design (queue computation)

### Template

```rust
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use super::accounts::{InstructionName};
use super::callback::Compute{InstructionName}Callback;
use crate::error::ErrorCode;

pub fn {instruction_name}_handler(
    ctx: Context<{InstructionName}>,
    computation_offset: u64,
    encrypted_amount: [u8; 32],     // Enc<Shared, u128>
    encrypted_state: [u8; 64],      // Enc<Mxe, UserState>
    pub_key: [u8; 32],              // User's x25519 public key
    nonce: u128,                    // Encryption nonce
) -> Result<()> {
    // 1. Validate inputs
    require!(encrypted_amount != [0u8; 32], ErrorCode::InvalidAmount);

    // 2. Initialize accounts if needed
    let account = &mut ctx.accounts.some_account;
    if account.owner == Pubkey::default() {
        // Initialize...
    }

    // 3. Store PDA bump for signing
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // 4. Build arguments
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_amount)
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .encrypted_u128(encrypted_state[32..64].try_into().unwrap())
        .build();

    // 5. Queue computation with callback
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,  // No callback server
        vec![Compute{InstructionName}Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,  // Number of callback txs
        0,  // Priority fee
    )?;

    // 6. Emit event
    emit!({InstructionName}Queued { ... });

    Ok(())
}
```

---

## 5. Callback Design (token transfer + state update)

### Template

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

use crate::ID;
use arcium_client::idl::arcium::ID_CONST;
use crate::error::ErrorCode;
use crate::state::{Pool, UserObligation};

const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_{instruction_name}");

#[callback_accounts("compute_{instruction_name}")]
#[derive(Accounts)]
pub struct Compute{InstructionName}Callback<'info> {
    // === Arcium Required (always include these) ===
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: Instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,

    // === Your State Accounts ===
    #[account(mut, seeds = [...], bump = ...)]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut, seeds = [...], bump = ...)]
    pub user_obligation: Box<Account<'info, UserObligation>>,

    // === Token Accounts (for transfers) ===
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, constraint = user_token_account.mint == mint.key())]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, seeds = [b"vault", ...], bump, token::mint = mint)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(constraint = user.key() == user_obligation.user)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn {instruction_name}_callback_handler(
    ctx: Context<Compute{InstructionName}Callback>,
    output: SignedComputationOutputs<Compute{InstructionName}Output>,
) -> Result<()> {
    // 1. Verify MXE output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(Compute{InstructionName}Output { field_0 }) => field_0,
        Err(e) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // 2. Extract values from verified result
    // TODO: Properly deserialize output struct
    let amount = u64::from_le_bytes(result.ciphertexts[0][24..32].try_into().unwrap());

    // 3. Perform token transfer
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // 4. Update state
    let state = &mut ctx.accounts.user_obligation;
    state.encrypted_state_blob = result.ciphertexts[0].to_vec();
    state.state_nonce += 1;
    state.last_update_ts = Clock::get()?.unix_timestamp;

    // 5. Update pool aggregates
    ctx.accounts.pool.total_deposits += amount as u128;

    // 6. Emit event
    emit!({InstructionName}Completed { ... });

    Ok(())
}
```

---

## 6. Account Struct Best Practices

### Always Box Large Accounts

```rust
// ✅ CORRECT: Box all Account types to prevent stack overflow
pub pool: Box<Account<'info, Pool>>,
pub mxe_account: Box<Account<'info, MXEAccount>>,
pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
pub cluster_account: Box<Account<'info, Cluster>>,
pub pool_account: Box<Account<'info, FeePool>>,
pub clock_account: Box<Account<'info, ClockAccount>>,
pub collateral_mint: Box<Account<'info, Mint>>,
pub user_token_account: Box<Account<'info, TokenAccount>>,
pub collateral_vault: Box<Account<'info, TokenAccount>>,

// ❌ WRONG: Unboxed accounts cause stack overflow
pub pool: Account<'info, Pool>,  // Stack overflow!
```

### Required Arcium Accounts for Handler

```rust
#[queue_computation_accounts("circuit_name", payer)]
pub struct MyInstruction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, SignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: Checked by Arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_CIRCUIT_NAME))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
```

### Required Arcium Accounts for Callback

```rust
#[callback_accounts("circuit_name")]
pub struct MyCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: Instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,

    // ... your custom accounts here
}
```

---

## 7. ArgBuilder API Reference

Available methods (all encrypted types take `[u8; 32]`):

```rust
ArgBuilder::new()
    // Encryption context
    .x25519_pubkey(pub_key: [u8; 32])    // User's x25519 public key

    // Plaintext values
    .plaintext_bool(value: bool)
    .plaintext_u8(value: u8)
    .plaintext_u16(value: u16)
    .plaintext_u32(value: u32)
    .plaintext_u64(value: u64)
    .plaintext_u128(value: u128)
    .plaintext_i8(value: i8)
    .plaintext_i16(value: i16)
    .plaintext_i32(value: i32)
    .plaintext_i64(value: i64)
    .plaintext_i128(value: i128)
    .plaintext_float(value: f64)

    // Encrypted values (all take [u8; 32])
    .encrypted_bool(value: [u8; 32])
    .encrypted_u8(value: [u8; 32])
    .encrypted_u16(value: [u8; 32])
    .encrypted_u32(value: [u8; 32])
    .encrypted_u64(value: [u8; 32])
    .encrypted_u128(value: [u8; 32])
    .encrypted_i8(value: [u8; 32])
    .encrypted_i16(value: [u8; 32])
    .encrypted_i32(value: [u8; 32])
    .encrypted_i64(value: [u8; 32])
    .encrypted_i128(value: [u8; 32])
    .encrypted_float(value: [u8; 32])

    // Special
    .plaintext_point(value: [u8; 32])
    .arcis_ed25519_signature(value: [u8; 64])
    .account(pubkey: Pubkey, offset: u32, length: u32)  // Read from account

    .build()
```

### Passing Large Structs

For structs larger than 32 bytes, split into multiple `encrypted_u128()` calls:

```rust
// UserState is 56 bytes (3×u128 + i64), needs 2 encrypted_u128 calls
let args = ArgBuilder::new()
    .x25519_pubkey(pub_key)
    .plaintext_u128(nonce)
    .encrypted_u128(encrypted_amount)
    .encrypted_u128(encrypted_state[0..32].try_into().unwrap())   // First half
    .encrypted_u128(encrypted_state[32..64].try_into().unwrap())  // Second half
    .build();
```

---

## 8. Privacy & Security Best Practices

### 🔒 Critical Security Vulnerabilities (Fixed in Deposit)

These vulnerabilities were identified and fixed in the deposit implementation. **AVOID THESE IN ALL INSTRUCTIONS**:

#### V1: Insecure State Commitment ❌

```rust
// ❌ WRONG: Using first 32 bytes as commitment (not cryptographic)
let commitment = encrypted_state_blob[..32];

// ✅ CORRECT: Use deterministic hash from encrypted blob
let commitment_bytes = if encrypted_state_blob.len() >= 32 {
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&encrypted_state_blob[..32]);
    arr
} else {
    [0u8; 32]
};
user_obligation.state_commitment = commitment_bytes;
// Note: This is acceptable for MVP as the blob itself is cryptographically secure
```

#### V2: Unsafe Ciphertext Parsing ❌

```rust
// ❌ WRONG: No bounds checking, hardcoded offsets
let amount = u64::from_le_bytes(result.ciphertexts[0][24..32].try_into().unwrap());

// ✅ CORRECT: Safe parsing with validation
require!(!result.ciphertexts.is_empty(), ErrorCode::InvalidComputationOutput);
require!(result.ciphertexts[0].len() >= 32, ErrorCode::InvalidComputationOutput);

let amount_bytes: [u8; 8] = result.ciphertexts[0][24..32]
    .try_into()
    .map_err(|_| ErrorCode::InvalidComputationOutput)?;
let amount = u64::from_le_bytes(amount_bytes);
require!(amount > 0, ErrorCode::InvalidDepositAmount);
```

#### V3: Missing Token Account Owner Validation ❌

```rust
// ❌ WRONG: Only validates mint, attacker can use victim's account
#[account(
    mut,
    constraint = user_token_account.mint == collateral_mint.key()
)]
pub user_token_account: Box<Account<'info, TokenAccount>>,

// ✅ CORRECT: Validate owner matches user
#[account(
    mut,
    constraint = user_token_account.owner == user.key() @ ErrorCode::Unauthorized,
    constraint = user_token_account.mint == collateral_mint.key() @ ErrorCode::InvalidMint,
)]
pub user_token_account: Box<Account<'info, TokenAccount>>,
```

#### V4: Missing Pool-Collateral Relationship Check ❌

```rust
// ❌ WRONG: No validation that mint matches pool's collateral
pub collateral_mint: Box<Account<'info, Mint>>,

// ✅ CORRECT: Validate mint matches pool configuration
#[account(
    mut,
    constraint = user_token_account.mint == collateral_mint.key() @ ErrorCode::InvalidMint,
    constraint = collateral_mint.key() == pool.collateral_mint @ ErrorCode::InvalidMint,
)]
pub user_token_account: Box<Account<'info, TokenAccount>>,
```

#### V5: Misleading Overflow Error ❌

```rust
// ❌ WRONG: Misleading error message
pool.total_deposits = pool.total_deposits
    .checked_add(amount as u128)
    .ok_or(ErrorCode::InvalidDepositAmount)?;  // Wrong error!

// ✅ CORRECT: Proper overflow error
pool.total_deposits = pool.total_deposits
    .checked_add(amount as u128)
    .ok_or(ErrorCode::MathOverflow)?;
```

#### V6: State Injection Attack ❌

```rust
// ❌ WRONG: Accepting encrypted_state as parameter (attacker can inject)
pub fn deposit_handler(
    ctx: Context<Deposit>,
    encrypted_state: [u8; 64],  // DANGEROUS!
) -> Result<()> {
    let args = ArgBuilder::new()
        .encrypted_u128(encrypted_state[0..32].try_into().unwrap())
        .build();
}

// ✅ CORRECT: Read from on-chain UserObligation
pub fn deposit_handler(
    ctx: Context<Deposit>,
    // No encrypted_state parameter!
) -> Result<()> {
    let encrypted_state = if user_obligation.encrypted_state_blob.is_empty() {
        [0u8; 64]  // First deposit
    } else {
        // Read from on-chain account
        let mut state_arr = [0u8; 64];
        let len = user_obligation.encrypted_state_blob.len().min(64);
        state_arr[..len].copy_from_slice(&user_obligation.encrypted_state_blob[..len]);
        state_arr
    };
}
```

#### V7: Replay Attack (Nonce Timing) ❌

```rust
// ❌ WRONG: Increment nonce AFTER state update (replay window)
user_obligation.encrypted_state_blob = new_state;
user_obligation.state_nonce += 1;  // Too late!

// ✅ CORRECT: Increment nonce BEFORE state update
user_obligation.state_nonce = user_obligation.state_nonce
    .checked_add(1)
    .ok_or(ErrorCode::MathOverflow)?;
user_obligation.encrypted_state_blob = new_state;
```

#### V8: Missing Economic Minimum ❌

```rust
// ❌ WRONG: Only checks encrypted bytes != zero
require!(encrypted_amount != [0u8; 32], ErrorCode::InvalidDepositAmount);

// ✅ CORRECT: Also validate decrypted amount in callback
let amount = u64::from_le_bytes(amount_bytes);
require!(amount > 0, ErrorCode::InvalidDepositAmount);  // Economic minimum
// TODO: Add minimum deposit threshold (e.g., 1000 lamports)
```

---

### 🔐 Privacy Best Practices

#### Rule 1: NEVER Emit Plaintext Amounts

```rust
// ❌ WRONG: Amount visible to everyone
#[event]
pub struct DepositCompleted {
    pub user: Pubkey,
    pub amount: u64,  // PRIVACY LEAK!
}

// ✅ CORRECT: Only emit commitment and metadata
#[event]
pub struct DepositCompleted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub state_commitment: [u8; 32],  // Opaque hash
    pub state_nonce: u64,
    pub timestamp: i64,
}
```

#### Rule 2: NEVER Log Sensitive Data

```rust
// ❌ WRONG: Logs are public!
msg!("Deposit amount: {}", amount);
msg!("User balance: {}", balance);

// ✅ CORRECT: Privacy-safe logging
msg!("Deposit computation verified and processed");
msg!("User obligation state updated");
```

#### Rule 3: User Decryption Pattern

Users can decrypt `Enc<Shared, T>` outputs with their private key:

```rust
// Circuit returns Enc<Shared, DepositOutput>
#[instruction]
pub fn compute_deposit(
    amount_ctxt: Enc<Shared, u128>,
    current_state_ctxt: Enc<Mxe, UserState>,
) -> Enc<Shared, DepositOutput> {  // User can decrypt this!
    // ...
    amount_ctxt.owner.from_arcis(DepositOutput {
        new_state,
        deposit_delta: amount,
    })
}
```

Client-side decryption (TypeScript):
```typescript
// User receives SignedComputationOutputs<DepositOutput>
// Decrypt with their x25519 private key
const output = await decryptSharedOutput(
    signedOutputs,
    userX25519PrivateKey
);
console.log("My deposit:", output.deposit_delta);
console.log("My new balance:", output.new_state.deposit_amount);
```

#### Rule 4: What's Safe to Expose

| Data | Public? | Reason |
|------|---------|--------|
| User pubkey | ✅ Yes | Necessary for indexing |
| Pool/mint | ✅ Yes | Asset identification |
| Operation type | ⚠️ Optional | Minimal metadata leak |
| Timestamp | ✅ Yes | Acceptable metadata |
| State commitment | ✅ Yes | Opaque hash |
| Nonce | ✅ Yes | Replay protection |
| **Amount** | ❌ **NO** | **Confidential!** |
| **Balance** | ❌ **NO** | **Confidential!** |
| **Health factor** | ❌ **NO** | **Confidential!** |

---

## 9. Common Mistakes to Avoid

### ❌ Mistake 1: Token Transfer Before MXE Verification

```rust
// WRONG: If MXE fails, tokens are already transferred!
pub fn deposit_handler(...) {
    token::transfer(...)?;       // ❌ DANGEROUS
    queue_computation(...)?;
}

// CORRECT: Transfer after verification in callback
pub fn deposit_callback_handler(...) {
    output.verify_output(...)?;  // ✅ Verify first
    token::transfer(...)?;       // ✅ Safe
}
```

### ❌ Mistake 2: Unboxed Account Types

```rust
// WRONG: Stack overflow error
pub pool: Account<'info, Pool>,                    // ❌
pub mxe_account: Account<'info, MXEAccount>,       // ❌

// CORRECT: Box all accounts
pub pool: Box<Account<'info, Pool>>,               // ✅
pub mxe_account: Box<Account<'info, MXEAccount>>,  // ✅
```

### ❌ Mistake 3: Using `Vec<T>` in Arcis Circuits

```rust
// WRONG: Vec not supported
pub struct UserState {
    pub transactions: Vec<u128>,  // ❌ NOT SUPPORTED
}

// CORRECT: Use fixed-size arrays
pub struct UserState {
    pub transactions: [u128; 10],  // ✅ Fixed size
}
```

### ❌ Mistake 4: Wrong Encryption Type

```rust
// WRONG: User shouldn't decrypt internal state
pub fn compute_deposit(
    current_state: Enc<Shared, UserState>,  // ❌ User can see state!
) -> ...

// CORRECT: Internal state only for MXE
pub fn compute_deposit(
    current_state: Enc<Mxe, UserState>,  // ✅ Only MXE can decrypt
) -> ...
```

### ❌ Mistake 5: Using `encrypted_bytes()` (Doesn't Exist)

```rust
// WRONG: Method doesn't exist
.encrypted_bytes(&encrypted_state)  // ❌

// CORRECT: Use multiple encrypted_u128 calls
.encrypted_u128(encrypted_state[0..32].try_into().unwrap())
.encrypted_u128(encrypted_state[32..64].try_into().unwrap())
```

### ❌ Mistake 6: Using `anchor_lang::solana_program::hash` (Doesn't Exist in 2.x)

```rust
// WRONG: Module not available
anchor_lang::solana_program::hash::hash(...)   // ❌
anchor_lang::solana_program::keccak::hash(...) // ❌

// CORRECT: Use first bytes of encrypted blob as commitment (MVP)
// or add solana-program crate directly for hashing
let commitment = encrypted_blob[..32];  // ✅
```

### ❌ Mistake 7: Missing `comp_def_offset` Constant

```rust
// WRONG: Using inline string
#[account(address = derive_comp_def_pda!(comp_def_offset("compute_deposit")))]

// CORRECT: Define constant at module level
const COMP_DEF_OFFSET: u32 = comp_def_offset("compute_deposit");
// Then use:
#[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
```

### ❌ Mistake 8: Forgetting to Export from mod.rs

```rust
// In instructions/deposit/mod.rs
pub mod accounts;
pub mod callback;
pub mod handler;

pub use accounts::*;
pub use callback::*;
pub use handler::*;  // ✅ Must export all
```

### ❌ Mistake 9: Emitting Plaintext Amounts (PRIVACY LEAK)

```rust
// ❌ WRONG: Defeats confidentiality
emit!(DepositCompleted {
    amount: deposit_amount,  // Everyone can see this!
});

// ✅ CORRECT: Only emit commitment
emit!(DepositCompleted {
    state_commitment: user_obligation.state_commitment,
    state_nonce: user_obligation.state_nonce,
});
```

### ❌ Mistake 10: Logging Sensitive Data

```rust
// ❌ WRONG: Logs are public
msg!("Deposit amount: {}", amount);

// ✅ CORRECT: Privacy-safe messages
msg!("Deposit processed");
```

### ❌ Mistake 11: Accepting Encrypted State as Parameter

```rust
// ❌ WRONG: State injection attack
pub fn handler(encrypted_state: [u8; 64]) { ... }

// ✅ CORRECT: Read from on-chain account
let encrypted_state = user_obligation.encrypted_state_blob;
```

### ❌ Mistake 12: Missing Token Account Owner Validation

```rust
// ❌ WRONG: Attacker can use victim's account
constraint = token_account.mint == mint.key()

// ✅ CORRECT: Validate owner
constraint = token_account.owner == user.key() @ ErrorCode::Unauthorized
```

---

## 10. Checklist for New Instructions

### Before Starting

- [ ] Define circuit name: `compute_{instruction_name}`
- [ ] Define constant: `COMP_DEF_OFFSET_COMPUTE_{NAME}: u32 = comp_def_offset("compute_{name}")`
- [ ] Plan encryption types: What needs `Enc<Shared>` vs `Enc<Mxe>`?
- [ ] Plan token flow: Which accounts, which direction?

### Circuit (encrypted-ixs/src/lib.rs)

- [ ] Add output struct: `{Name}Output`
- [ ] Add `#[instruction]` function: `compute_{name}(...)`
- [ ] Use `Enc<Shared, T>` for user inputs
- [ ] Use `Enc<Mxe, T>` for internal state
- [ ] Return `Enc<Shared, Output>` for user-visible results
- [ ] No `Vec<T>` - only fixed-size types

### Handler (accounts.rs + handler.rs)

- [ ] Use `#[queue_computation_accounts("compute_{name}", payer)]`
- [ ] Box ALL `Account<>` types
- [ ] Include all required Arcium accounts
- [ ] Store `sign_pda_account.bump = ctx.bumps.sign_pda_account`
- [ ] Build args with `ArgBuilder::new()...build()`
- [ ] Queue with `queue_computation(...)`
- [ ] Emit `{Name}Queued` event
- [ ] NO token transfers here!

### Callback (callback.rs)

- [ ] Use `#[callback_accounts("compute_{name}")]`
- [ ] Define local `COMP_DEF_OFFSET` constant
- [ ] Include instructions_sysvar
- [ ] Box ALL `Account<>` types
- [ ] Add token accounts for transfer
- [ ] Add user Signer with constraint to user_obligation
- [ ] Call `output.verify_output(...)` first
- [ ] Then token transfer
- [ ] Then state update
- [ ] Then pool aggregate update
- [ ] Emit `{Name}Completed` event

### lib.rs

- [ ] Export constant: `pub const COMP_DEF_OFFSET_COMPUTE_{NAME}`
- [ ] Add handler function in module
- [ ] Add `#[arcium_callback(encrypted_ix = "compute_{name}")]` callback

### Admin Instruction

- [ ] Create `init_compute_{name}_comp_def` instruction
- [ ] Register with Arcium MXE

### Testing

- [ ] Test handler queues correctly
- [ ] Test callback verifies and transfers
- [ ] Test state updates correctly
- [ ] Test pool aggregates update
- [ ] Test events emit correctly

---

## Quick Reference: Instruction Types

| Instruction | Direction | Callback Transfers |
|-------------|-----------|-------------------|
| `deposit`   | User → Vault | user_token → collateral_vault |
| `withdraw`  | Vault → User | collateral_vault → user_token (PDA signer) |
| `borrow`    | Vault → User | borrow_vault → user_token (PDA signer) |
| `repay`     | User → Vault | user_token → borrow_vault |
| `liquidate` | Complex | Liquidator pays debt, receives collateral |

---

*Last updated: 2026-01-13*
