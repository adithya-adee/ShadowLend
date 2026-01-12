# ShadowLend Architecture Documentation
## Private Lending Protocol with Arcium MXE Integration

**Project:** ShadowLend - Privacy-Preserving Lending on Solana  
**Architecture:** Arcium MXE-Based Confidential Compute  
**Target:** Solana Privacy Hack 2026 (Arcium Track)  
**Status:** Production-Ready Design (3-Week Implementation)  

---

## 1. Executive Overview

ShadowLend is a privacy-preserving lending protocol that enables users to borrow and lend cryptocurrency without exposing collateral amounts, loan sizes, or wallet positions—while maintaining complete protocol correctness and solvency guarantees.

**Core Privacy Model:**
- Individual deposit/borrow amounts: **HIDDEN** (encrypted on-chain)
- Health factors: **HIDDEN** (computed privately in Arcium MXE)
- Exact collateral composition: **HIDDEN** (only Arcium nodes see plaintext)
- Pool aggregates (totals, utilization, rates): **PUBLIC** (required for protocol function)
- Transaction existence: **PUBLIC** (on-chain commitment/attestation)

**Why Arcium?**
Arcium's Multi-Party Computation (MPC) network enables shared private state computation—a perfect fit for DeFi protocols where multiple users' encrypted data must interact. Unlike zero-knowledge proofs, Arcium computations complete in ~500ms instead of 15+ seconds, making user experience dramatically better for a hackathon demo.

---

## 2. System Architecture

### 2.1 Three-Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Layer                                  │
│  (Client SDK, Wallet Integration, Encryption)                  │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ├──→ Transaction Construction
               ├──→ Data Encryption (MXE Public Key)
               └──→ Submission to Solana
               
┌──────────────────────────────────────────────────────────────────┐
│              Solana Smart Contracts Layer                         │
│  (Pool Management, Commitment Verification, State Anchoring)    │
└──────────────┬──────────────────────────────────────────────────┘
               │
        On-Chain Data:
        ├─ Pool Accounts (public aggregates)
        ├─ User Obligation Accounts (encrypted state blobs)
        ├─ Arcium Configuration Registry
        └─ Attestation Verification Logic
               │
               └──→ CPI to Arcium Program
               
┌──────────────────────────────────────────────────────────────────┐
│           Arcium MXE Network (Off-Chain)                          │
│  (Confidential Computation, State Management, Attestation)      │
└──────────────────────────────────────────────────────────────────┘
               │
        MXE Nodes (TEE Clusters):
        ├─ Decrypt user requests
        ├─ Fetch encrypted user state
        ├─ Execute lending logic privately
        ├─ Generate cryptographic attestations
        └─ Return encrypted results
```

---

## 3. Core Components

### 3.1 Solana Smart Contracts (On-Chain)

#### 3.1.1 Pool Account
Stores public protocol state required for interest rate calculation and system transparency.

**Structure:**
```
Pool {
    authority: Pubkey,
    mint: Pubkey,
    total_deposits: u128,           // Public: enables LTV calculations
    total_borrows: u128,             // Public: enables utilization
    accumulated_interest: u128,      // Public: interest rate calculation
    utilization_rate: u64,          // Public: percentage (0-100000 = 0-100%)
    current_borrow_rate: u64,       // Public: APY (basis points)
    current_deposit_rate: u64,      // Public: APY (basis points)
    liquidation_threshold: u16,     // Public: percentage LTV
    last_update_ts: i64,
    arcium_config: Pubkey,          // Reference to Arcium configuration
}
```

**Why Public?**
- Interest rates depend on utilization ratio
- Liquidators need pool state to calculate incentives
- Enables protocol transparency without breaking individual privacy

#### 3.1.2 User Obligation Account
Stores encrypted user financial state on-chain, anchoring private computation to the blockchain.

**Structure:**
```
UserObligation {
    user: Pubkey,
    pool: Pubkey,
    encrypted_state_blob: Vec<u8>,      // Enc<Mxe, UserState>
    state_commitment: [u8; 32],         // Hash of encrypted state
    last_mxe_attestation: Option<Attestation>,
    last_update_ts: i64,
}

// Contents of encrypted_state_blob (only MXE can decrypt):
UserState {
    deposit_amount: u128,
    borrow_amount: u128,
    accrued_interest: u128,
    collateral_assets: Vec<(Pubkey, u64)>,  // (token, amount)
    last_interest_calc_ts: i64,
}
```

**Why This Pattern?**
- State commitment allows Solana to verify MXE computed correctly
- Encrypted blob keeps sensitive data off public view
- Attestation provides cryptographic proof of correct computation

#### 3.1.3 Arcium Configuration Account
Registry of trusted MXE nodes and their attestation parameters.

**Structure:**
```
ArciumConfig {
    authority: Pubkey,
    mxe_registry: Vec<MxeNodeInfo>,
}

MxeNodeInfo {
    node_pubkey: Pubkey,
    attestation_key: [u8; 32],       // EdDSA public key for verification
    enclave_measurement: [u8; 32],   // MRENCLAVE for TEE verification
    is_active: bool,
}
```

---

### 3.2 Arcium MXE Network (Off-Chain Confidential Compute)

#### 3.2.1 MXE Node Architecture
Each MXE node is an independent MPC participant running inside a TEE cluster (conceptually; Arcium handles this distribution).

**Node Responsibilities:**
1. **Decryption**: Decrypt user inputs using shared client-MXE encryption key
2. **State Fetch**: Retrieve encrypted user balances from on-chain accounts
3. **Computation**: Execute lending logic (health factor, interest, liquidations)
4. **Attestation**: Generate TEE signature proving correct computation
5. **Result Encryption**: Re-encrypt results for user or Solana program consumption

**Key Properties:**
- **Dishonest Majority Model** (Cerberus Protocol): Requires only 1 honest node (vs traditional 51%)
- **Parallel Execution**: Multiple MXE clusters compute simultaneously for scalability
- **Economic Incentives**: Node operators stake tokens; misbehavior incurs slashing penalties

#### 3.2.2 Confidential Computation Engine

The MXE implements the lending protocol logic **entirely on encrypted data**:

**Health Factor Calculation (Inside TEE):**
```
health_factor = (total_collateral_usd × ltv_weight) / total_borrow_usd

where:
  total_collateral_usd = sum(user_balance[collateral_i] × price[collateral_i])
  ltv_weight = 0.8 (80% loan-to-value threshold)
  total_borrow_usd = sum(user_borrow[borrow_i] × price[borrow_i])

Triggering Conditions:
  HF < 1.0  → Position liquidatable
  HF < 1.5  → Warning zone
  HF > 2.0  → Safe
```

**Interest Accrual (Inside TEE):**
```
accrued_interest = (borrow_amount × annual_rate × time_elapsed) / 365 days

Process:
1. Fetch current interest rate from Solana (public)
2. Calculate interest on user's encrypted borrow_amount
3. Update user's encrypted balance
4. Generate attestation
```

**Liquidation Execution (Inside TEE):**
```
if health_factor < 1.0:
  liquidation_incentive = 1.05  // 5% bonus to liquidator
  max_repay = min(borrow_amount, 50% of debt)
  collateral_seized = max_repay × 1.05 / collateral_price
  
  Generate attestation proof + encrypted result
```

#### 3.2.3 Encrypted State Management

**User Balance Encryption:**
- **Encryption Scheme**: AES-256-GCM with client-MXE shared secret
- **Key Derivation**: HKDF-SHA256 from user's transaction signature
- **Freshness Check**: Timestamp in attestation must be < 60 seconds old

**State Sharing Between MXE Nodes:**
- State is split across cluster nodes using Shamir secret sharing
- No single node ever sees plaintext user balance
- Distributed computation ensures privacy even if one node is compromised

**Public vs. Encrypted State Boundaries:**

| Data | Visibility | Storage | Usage |
|------|-----------|---------|-------|
| Total pool deposits | Public | Solana Pool Account | Interest rate model |
| Total pool borrows | Public | Solana Pool Account | Utilization calculation |
| User deposit amount | Private | Encrypted blob on-chain | MXE computation only |
| User borrow amount | Private | Encrypted blob on-chain | MXE computation only |
| User health factor | Private | Attestation only | MXE computation |
| Health factor range | Public (0-4 scale) | Solana via attestation | Liquidator efficiency |

---

## 4. User Flows

### 4.1 Deposit Flow (Private Collateral)

**Timeline: ~2-3 seconds**

```
Step 1: User Action (Client)
  User enters deposit amount (e.g., 100 SOL)
  Client generates nonce (prevents replay)
  ↓
Step 2: Client-Side Encryption
  plaintext_data = {amount: 100, nonce, timestamp, user_pubkey}
  encrypted_data = Encrypt(plaintext_data, MXE_public_key)
  ↓
Step 3: Submit to Solana
  User calls lending_program::deposit(encrypted_data)
  Solana program verifies:
    - User has sufficient balance
    - User authority is valid
    - Transaction is within recent timestamp
  ↓
Step 4: Create Encrypted State Blob
  new_obligation = UserObligation {
    user: user_pubkey,
    encrypted_state_blob: empty (MXE will populate),
    state_commitment: hash(empty),
  }
  Store on-chain
  ↓
Step 5: Forward to Arcium MXE
  Solana program calls CPI to Arcium:
    send(encrypted_data, user_obligation_account)
  ↓
Step 6: MXE Decryption & Processing (Inside TEE)
  MXE node receives encrypted_data
  MXE decrypts using shared secret:
    plaintext = Decrypt(encrypted_data, MXE_shared_key)
  Validate:
    - Signature matches user_pubkey
    - Timestamp within 60 seconds
    - Nonce not previously used
  ↓
Step 7: Update Encrypted State
  Fetch current user balance from encrypted_state_blob
  new_balance = old_balance + 100
  new_state = UserState {
    deposit_amount: new_balance,
    collateral_assets: [...],
  }
  ↓
Step 8: Encrypt & Commit State
  encrypted_blob = Encrypt(new_state, MXE_encryption_key)
  state_commitment = sha256(encrypted_blob)
  ↓
Step 9: Generate Attestation
  attestation = MXE_sign(user_pubkey || state_commitment || timestamp)
  Return attestation + encrypted_blob to Solana
  ↓
Step 10: Solana Verification & Finalization
  Solana program verifies:
    - MXE signature matches registered node
    - MRENCLAVE matches trusted enclave
    - Timestamp within acceptable range
  Update on-chain:
    user_obligation.encrypted_state_blob = encrypted_blob
    user_obligation.last_mxe_attestation = attestation
  ↓
Step 11: Update Pool State (Public)
  pool.total_deposits += 100
  pool.utilization_rate = total_borrows / total_deposits
  Recalculate and update borrow_rate via interest rate model
  ↓
Completion: ✓ Deposit Complete
  User is notified via on-chain event
  User's collateral is private; pool state is updated
```

---

### 4.2 Borrow Flow (Private Collateral Check + Private Execution)

**Timeline: ~2-3 seconds**

```
Step 1: User Request (Client)
  User wants to borrow 10 SOL
  Client prepares: borrow_request = {amount: 10, nonce, user_pubkey}
  encrypted_request = Encrypt(borrow_request, MXE_public_key)
  ↓
Step 2: Submit to Solana
  User calls lending_program::borrow(encrypted_request)
  Solana program:
    - Verifies signer is user
    - Checks pool has sufficient liquidity
    - Creates borrow obligation account if needed
  ↓
Step 3: Forward to Arcium MXE
  Solana CPI: send(encrypted_request, user_obligation_account, pool_account)
  ↓
Step 4: MXE Private Collateral Access
  MXE fetches user_obligation account
  Decrypts user_state from encrypted_state_blob:
    {deposit_amount: 100 SOL, borrow_amount: 0, ...}
  ↓
Step 5: Health Factor Calculation (Inside TEE)
  Fetches price data from on-chain oracle or external API:
    SOL_price = $20 (example)
  
  Calculates inside TEE:
    collateral_value_usd = 100 SOL × $20 = $2000
    borrow_value_usd = 10 SOL × $20 = $200
    ltv_used = $200 / $2000 = 10%
    health_factor = (collateral_value_usd × 0.8) / borrow_value_usd
                  = ($2000 × 0.8) / $200
                  = 1600 / 200
                  = 8.0 ✓ Safe
  ↓
Step 6: Borrow Amount Validation
  if health_factor >= 1.0:
    Approved ✓
    Generate encrypted result: {approved: true, new_borrow: 10}
  else:
    Rejected ✗
    Generate encrypted result: {approved: false, reason: "insufficient_collateral"}
  ↓
Step 7: Attestation Generation
  attestation = MXE_sign(user_pubkey || health_factor_hash || timestamp)
  ↓
Step 8: Return Encrypted Result to Solana
  MXE sends back attestation + encrypted_result
  ↓
Step 9: Solana Verification
  If attestation valid AND result approved:
    Update user_obligation:
      new_state = {deposit: 100, borrow: 10, ...}
      new_encrypted_blob = Encrypt(new_state)
    ↓
    Update pool:
      pool.total_borrows += 10
      pool.utilization_rate = (old_borrows + 10) / total_deposits
      Recalculate borrow_rate
    ↓
    Transfer 10 SOL from pool account → user wallet
  ↓
Completion: ✓ Borrow Complete (Health Factor Remained Private)
  Only MXE nodes and user know exact health factor
  Protocol enforced correctness on-chain via attestation
  Pool state updated publicly
```

---

### 4.3 Interest Accrual Flow (Continuous, Private)

**Timeline: Triggered periodically (daily/hourly) or on-demand**

```
Scheduled Action: MXE Cron Job
  Every 1 hour, MXE cluster initiates:
    For each active user_obligation:
  ↓
Step 1: Fetch Current Interest Rate (Public)
  Query Solana pool account:
    current_borrow_rate = 5% APY (public)
    pool.last_update_ts = X
  ↓
Step 2: Decrypt User State
  MXE decrypts user_obligation.encrypted_state_blob:
    {deposit_amount: 100, borrow_amount: 10, last_calc_ts: Y}
  ↓
Step 3: Calculate Accrued Interest (Inside TEE)
  time_elapsed = now - last_calc_ts  // in seconds
  interest = borrow_amount × (rate / 100) × (time_elapsed / 365 days)
  interest = 10 SOL × 0.05 × (3600 seconds / 31,536,000 seconds)
           ≈ 0.00159 SOL
  ↓
Step 4: Update Encrypted State
  new_borrow = 10 + 0.00159 = 10.00159 SOL
  updated_state = {
    deposit_amount: 100,
    borrow_amount: 10.00159,
    last_calc_ts: now,
    accrued_interest_total: previous_total + 0.00159,
  }
  ↓
Step 5: Re-encrypt & Commit
  encrypted_blob = Encrypt(updated_state)
  state_commitment = sha256(encrypted_blob)
  attestation = MXE_sign(commitment || timestamp)
  ↓
Step 6: Submit Update to Solana
  MXE calls transaction:
    update_obligation(user_pubkey, encrypted_blob, attestation)
  ↓
Step 7: Solana Verification & Storage
  Verify attestation
  Update user_obligation account
  Update pool.accumulated_interest (public aggregate)
  ↓
Result: ✓ Interest Accrued Privately
  User balance updated only MXE can see
  No one knows exact user borrow amount or accrued interest
  Pool state reflects aggregate changes
```

---

### 4.4 Liquidation Flow (Private Solvency Check + Atomic Execution)

**Timeline: ~2-4 seconds (on-demand trigger)**

```
External Trigger: Liquidator Bot or Smart Contract
  Monitors on-chain price feed
  Detects price drop:
    SOL price dropped from $20 → $10
    User's health factor likely < 1.0
  ↓
Step 1: Liquidator Calls MXE Liquidation Check
  liquidation_request = {user_pubkey, amount_to_liquidate}
  encrypted_request = Encrypt(liquidation_request, MXE_public_key)
  ↓
Step 2: MXE Private Health Factor Computation
  Fetch user's encrypted state:
    {deposit_amount: 100 SOL, borrow_amount: 10 SOL, ...}
  Fetch current prices:
    SOL_price = $10 (dropped from $20)
  ↓
  Calculate health factor inside TEE:
    collateral_value_usd = 100 × $10 = $1000
    borrow_value_usd = 10 × $10 = $100
    health_factor = ($1000 × 0.8) / $100 = 8.0... wait let me recalculate
    health_factor = ($1000 × 0.8) / $100 = 8.0
    
    Hmm, that's still > 1.0. Let me use a more realistic example:
    
    Revised example:
    Initial: 100 SOL deposit @ $20 = $2000, 15 SOL borrow @ $20 = $300
    HF = ($2000 × 0.8) / $300 = 5.33 ✓
    
    After price drop to $10:
    100 SOL deposit @ $10 = $1000, 15 SOL borrow @ $10 = $150
    HF = ($1000 × 0.8) / $150 = 5.33 (still safe)
    
    Even more extreme example needed:
    Initial: 100 SOL deposit @ $20 = $2000, 16.5 SOL borrow @ $20 = $330
    HF = ($2000 × 0.8) / $330 = 4.85 ✓
    
    After price drop to $10:
    100 SOL deposit @ $10 = $1000, 16.5 SOL borrow @ $10 = $165
    HF = ($1000 × 0.8) / $165 = 4.85 (still safe!)
    
    Actually, let me use actual leverage:
    Initial: 100 SOL deposit @ $20, borrow 20 SOL @ $20 = $400
    HF = ($2000 × 0.8) / $400 = 4.0 ✓
    
    After drop to $10:
    100 SOL @ $10 = $1000, borrow 20 SOL @ $10 = $200
    HF = ($1000 × 0.8) / $200 = 4.0 (still safe)
    
    OK with correlation it stays safe. Let's use different token:
    Deposit: 100 SOL @ $20 = $2000
    Borrow: 1500 USDC = $1500
    HF = ($2000 × 0.8) / $1500 = 1.067 ✓ (close to liquidation)
    
    SOL drops to $5:
    HF = ($500 × 0.8) / $1500 = 0.267 ✗ LIQUIDATABLE
  ↓
  Check: HF < 1.0? YES
  ↓
Step 3: Calculate Liquidation Amount
  liquidation_premium = 1.05  // 5% incentive to liquidator
  max_repay = min(current_borrow, 50% of total_debt)
                = min(1500, 750) = 750 USDC
  
  collateral_to_seize = (750 × 1.05) / collateral_price
                      = 787.5 USDC worth of SOL
                      = 787.5 / $5 = 157.5 SOL (more than user has!)
                      // But limited by available collateral
                      = min(157.5, 100) = 100 SOL
  
  Adjusted: 
    collateral_to_seize = 100 SOL
    actual_repay = 100 × $5 / 1.05 = 476.19 USDC
  ↓
Step 4: Prepare Encrypted Liquidation Proof
  Inside TEE, generate proof that:
    - User's HF < 1.0
    - Liquidation amount is within protocol limits
    - Collateral seizing is fair
  ↓
Step 5: Generate Attestation
  attestation = MXE_sign(user_pubkey || HF_hash || liquidation_params || timestamp)
  encrypted_result = {
    can_liquidate: true,
    repay_amount: 476.19,
    collateral_to_seize: 100 SOL,
  }
  ↓
Step 6: Return to Solana
  MXE submits encrypted_result + attestation
  ↓
Step 7: Solana Verification & Execution
  Verify attestation signature
  Verify MRENCLAVE matches trusted enclave
  If valid:
    Execute atomic liquidation:
    1. Transfer 476.19 USDC from liquidator → pool
    2. Seize 100 SOL from user's collateral
    3. Transfer 100 SOL to liquidator
    4. Update user state:
       new_deposit = 0 SOL
       new_borrow = 1500 - 476.19 = 1023.81 USDC
    5. Encrypt + store new state on-chain
    6. Emit LiquidationExecuted event
  ↓
Result: ✓ Liquidation Complete
  User's exact HF never revealed publicly
  Only final transfer amounts visible on-chain
  User still retains privacy despite liquidation
```

---

## 5. Privacy & Security Analysis

### 5.1 Privacy Guarantees

| Sensitive Data | Privacy Level | Mechanism | Trade-offs |
|---|---|---|---|
| Individual deposits | 🔒 HIGH | Encrypted state blobs + MXE-only keys | None |
| Individual borrows | 🔒 HIGH | Encrypted state blobs + MXE-only keys | None |
| Collateral composition | 🔒 HIGH | Asset list encrypted, MXE-only access | None |
| Health factors | 🔒 HIGH | Computed inside TEE, only attestation visible | None |
| Interest accrual | 🔒 HIGH | Computed on encrypted balances | None |
| Wallet identity ↔ position | 🟡 MEDIUM | Visible on-chain when user signs | Can use privacy routing layer (Umbra) |
| Pool totals | ⚪ PUBLIC | Required for interest rate model | Enables liquidation hunting on pool level |
| Transaction timing | ⚪ PUBLIC | Block included in public blockchain | Cannot avoid (blockchain inherent) |

### 5.2 Security Model

#### Arcium MPC Security (Dishonest Majority - Cerberus)
```
Guarantee: Privacy maintained if at least 1 MPC node is honest

Why this works:
- User data split across cluster using Shamir secret sharing
- No single node ever sees plaintext
- Computation uses MPC protocol where intermediate values are randomized
- If 99% of nodes collude, privacy still maintained (one honest node suffices)

Enforcement:
- Economic incentives: Nodes must stake tokens
- Slashing: Detected misbehavior results in token loss
- Identifiable termination: Protocol can identify and remove dishonest nodes
```

#### Solana Smart Contract Security
```
Verification Layer:
1. Attestation Signature Check
   - Verify MXE signature matches registered node pubkey
   - Prevents unauthorized computation results

2. Enclave Measurement Verification
   - Check MRENCLAVE hash matches deployed version
   - Detects unauthorized code modifications

3. Timestamp Freshness
   - All attestations must be < 60 seconds old
   - Prevents replay attacks

4. State Commitment Verification
   - Hash of encrypted state must match commitment
   - Detects tampering with encrypted blobs

5. Pool Invariant Checks
   - total_deposits >= total_borrows (solvency)
   - utilization_rate correctly calculated
   - interest_accumulated matches rate model
```

#### Client-Side Encryption Security
```
Key Derivation:
- Shared secret derived from user transaction signature
- HKDF-SHA256 ensures cryptographic key strength
- Different per transaction (prevents key reuse)

Encryption Scheme:
- AES-256-GCM (AEAD) ensures authenticity + confidentiality
- 256-bit keys (quantum-resistant size)
- Random IVs for each encryption

Threat Model Addressed:
✓ Network eavesdropping (encryption in transit)
✓ Solana RPC node snooping (encrypted state blobs)
✓ Casual observer looking at blockchain (ciphertexts unintelligible)
✗ Compromised MXE nodes (relies on >50% honest nodes)
✗ Quantum computers (would break AES-256, but mitigated by Arcium roadmap)
```

### 5.3 Compliance & Auditability

**Designed for Institutional Adoption:**

1. **Public Aggregates Enable Compliance Reporting**
   - Pool totals allow external auditors to verify TVL
   - Utilization rates demonstrate protocol health
   - Interest rate history is transparent

2. **Attestation Trail**
   - Every MXE operation generates signed attestation
   - Solana stores attestation on-chain (immutable record)
   - Enables retroactive compliance investigations

3. **Liquidation Transparency**
   - Liquidation events are public (who was liquidated, how much)
   - Prevents selective/hidden liquidations
   - Enables market participants to trust liquidation fairness

4. **Optional Identity Integration**
   - Users can optionally link wallet to legal identity
   - Supports KYC/AML requirements
   - Protocol itself doesn't enforce (optional for applications built on ShadowLend)

---

## 6. Technical Implementation Details

### 6.1 Solana Program Structure

**File Organization:**
```
shadowlend-solana/
├── programs/
│   └── shadowlend-lending/
│       ├── src/
│       │   ├── lib.rs                    # Program entry
│       │   ├── state.rs                  # Pool & UserObligation structs
│       │   ├── instructions/
│       │   │   ├── mod.rs
│       │   │   ├── deposit.rs            # Deposit instruction
│       │   │   ├── borrow.rs             # Borrow instruction
│       │   │   ├── repay.rs              # Repay instruction
│       │   │   ├── withdraw.rs           # Withdraw instruction
│       │   │   ├── liquidate.rs          # Liquidation instruction
│       │   │   └── update_obligation.rs  # MXE attestation finalization
│       │   ├── utils/
│       │   │   ├── arcium.rs             # Arcium integration helpers
│       │   │   ├── oracle.rs             # Price feed integration
│       │   │   └── interest_model.rs     # Interest rate calculations
│       │   └── errors.rs                 # Custom error types
│       └── Cargo.toml
├── tests/
│   ├── deposit.rs
│   ├── borrow.rs
│   ├── liquidation.rs
│   └── interest.rs
└── Cargo.toml
```

### 6.2 Arcium MXE Program Structure

**File Organization:**
```
shadowlend-arcium/
├── src/
│   ├── lib.rs                      # MXE entry point
│   ├── state.rs                    # UserState definition
│   ├── operations/
│   │   ├── deposit.rs              # Encrypt & store deposit
│   │   ├── borrow.rs               # Validate & execute borrow
│   │   ├── repay.rs                # Process repayment
│   │   ├── withdraw.rs             # Validate & execute withdrawal
│   │   ├── liquidate.rs            # Liquidation logic
│   │   └── interest_accrual.rs     # Interest calculations
│   ├── utils/
│   │   ├── encryption.rs           # Encryption/decryption utilities
│   │   ├── health_factor.rs        # Health factor calculations
│   │   ├── oracle.rs               # Price feed fetching
│   │   └── state_management.rs     # Encrypted state operations
│   └── errors.rs
├── Cargo.toml
└── arcis-config.toml               # Arcis compilation config
```

### 6.3 Key Dependencies

**Solana Program:**
```toml
[dependencies]
anchor-lang = "0.32"
anchor-spl = "0.32"
solana-program = "1.19"
arcium-anchor = "0.1"     # NEW: Arcium integration helpers
spl-token = "4.0"
bytemuck = "1.14"
```

**Arcium MXE Program:**
```toml
[dependencies]
arcium = "0.4"            # Arcium MXE framework
arcis = "0.2"             # Arcis compiler (Rust for encrypted compute)
serde = { version = "1.0", features = ["derive"] }
bincode = "1.3"
sha2 = "0.10"
aes-gcm = "0.10"          # For encryption operations
```

### 6.4 Attestation Verification Code (Solana)

**Pseudo-code:**
```rust
pub fn verify_mxe_attestation(
    attestation: &Attestation,
    user_pubkey: &Pubkey,
    expected_commitment: &[u8; 32],
    mxe_config: &Account<ArciumConfig>,
) -> Result<()> {
    // 1. Check MXE node is registered
    let mxe_node = mxe_config
        .mxe_registry
        .iter()
        .find(|node| node.node_pubkey == attestation.mxe_node)
        .ok_or(LendingError::InvalidMxeNode)?;
    
    // 2. Verify attestation signature
    let message = [
        user_pubkey.as_ref(),
        expected_commitment,
        &attestation.timestamp.to_le_bytes(),
    ].concat();
    
    ed25519::verify(
        &attestation.signature,
        &message,
        &mxe_node.attestation_key,
    )?;
    
    // 3. Check enclave measurement
    require_eq!(
        attestation.mrenclave,
        mxe_node.enclave_measurement,
        LendingError::InvalidEnclaveMeasurement
    );
    
    // 4. Verify freshness (< 60 seconds)
    let now = Clock::get()?.unix_timestamp;
    require!(
        (now - attestation.timestamp).abs() < 60,
        LendingError::AttestationTooOld
    );
    
    Ok(())
}
```

---

## 7. Deployment Architecture

### 7.1 Development Environment

**Local Testing:**
1. **Solana Validator** (local-net)
   - Test Solana program locally
   - Simulate Arcium CPI calls

2. **Arcium Devnet MXE Cluster**
   - 3-node Arcium cluster running on Devnet
   - Can execute real encrypted computations
   - Provides attestations for testing

3. **Client SDK** (TypeScript/Rust)
   - Encryption/decryption logic
   - Transaction construction
   - Attestation verification

### 7.2 Devnet Deployment

```
Solana Devnet RPC
        ↓
Shadowlend Program (deployed)
        ↓
CPI calls to Arcium Program (on Devnet)
        ↓
Arcium Devnet MXE Cluster
(3-4 nodes running in Docker)
```

### 7.3 Mainnet Deployment (Post-Hackathon)

```
Solana Mainnet RPC
        ↓
Shadowlend Program (audited + deployed)
        ↓
CPI calls to Arcium Mainnet Program
        ↓
Arcium Mainnet MXE Network
(100+ nodes, permissionless participation)
```

---

## 8. Implementation Timeline (3 Weeks)

### Week 1: Foundation & Integration
- **Days 1-2:**
  - Set up Solana program scaffold (Anchor)
  - Design Pool & UserObligation account structures
  - Implement pool initialization and interest rate model

- **Days 3-4:**
  - Integrate arcium-anchor crate
  - Implement Arcium configuration account
  - Create CPI helpers for Arcium calls

- **Days 5-7:**
  - Implement deposit instruction (Solana side)
  - Create encrypted state blob structure
  - Build basic attestation verification

**Deliverable:** Solana program compiles, basic account structures in place

---

### Week 2: MXE Logic & User Flows
- **Days 1-3:**
  - Implement MXE deposit operation
  - Implement MXE health factor calculation
  - Implement MXE interest accrual

- **Days 4-5:**
  - Implement borrow flow (Solana + MXE coordination)
  - Implement liquidation flow
  - Add state encryption/decryption

- **Days 6-7:**
  - Client SDK: Encryption & transaction construction
  - Client SDK: Attestation verification
  - Integration testing

**Deliverable:** Full deposit → borrow → liquidate flows working on Devnet

---

### Week 3: Polish & Demo
- **Days 1-2:**
  - Comprehensive testing
  - Fix bugs discovered in integration testing
  - Optimize Arcium circuit for performance

- **Days 3-4:**
  - Build demo UI (simple React app)
  - Create demo scenario (deposit → borrow → liquidate)
  - Prepare demo walkthrough

- **Days 5-6:**
  - Documentation finalization
  - Code cleanup and comments
  - Prepare submission materials

- **Day 7:**
  - Final testing
  - Prepare for judging
  - Create pitch video/slides

**Deliverable:** Working demo, tested codebase, submission-ready

---

## 9. Key Features & Differentiators

### 9.1 Hackathon Fit

| Criterion | ShadowLend | Why Best-in-Class |
|---|---|---|
| **Arcium Usage** | 🟢 Native | MXE is core architecture, not bolted-on |
| **Privacy Model** | 🟢 User → MXE → Pool | Clear privacy boundaries, not all-or-nothing |
| **Demo-able** | 🟢 500ms latency | Fast enough for live demo (vs 15s for ZKP) |
| **Compliance** | 🟢 Audit-ready | Public aggregates + private positions = institutional friendly |
| **Timeline** | 🟢 3 weeks | Pre-built SDK (arcium-anchor) + architecture ready |
| **Scaling** | 🟢 Parallel MXE | Supports growth; not bottlenecked by single TEE |

### 9.2 Beyond Hackathon (Production Roadmap)

**Phase 1 (Q1 2026):** Mainnet launch with single collateral (SOL)
- Full security audit
- Governance token launch
- Risk management framework

**Phase 2 (Q2 2026):** Multi-collateral support
- Integration with Marinade staked SOL
- Integration with LST derivatives
- Chainlink CCIP for cross-chain collateral

**Phase 3 (Q3 2026):** Advanced features
- Private leverage trading (using encrypted order book)
- Private liquidation auction mechanisms
- Integration with Arkham Intelligence for optional compliance

**Phase 4 (Q4 2026):** AI integration
- Encrypted portfolio recommendation engine
- Private risk management AI agents
- Encrypted data monetization for model training

---

## 10. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| MXE node downtime | Medium | Medium | Use 3+ node cluster; automatic fallback |
| Arcium SDK bugs | Low | High | Use latest v0.4.0; extensive testing |
| Interest rate model miscalculation | Low | High | Separate rate calculation tests; use battle-tested formulas from Aave |
| Attestation oracle attacks | Low | Medium | Verify attestations on-chain; use multiple MXE nodes |
| User misunderstands privacy model | High | Low | Clear documentation; UI warnings; educational content |
| Liquidation front-running | Medium | Medium | Private liquidation triggers; MXE handles detection |
| State encryption key leakage | Very Low | Critical | Use standard AES-256-GCM; hardware security where possible |

---

## 11. Appendix: Formula Reference

### Interest Rate Model

**Linear Utilization Model (Like Aave):**
```
Utilization = Total_Borrows / Total_Deposits

Borrow_APY = Base_Rate + (Utilization × Slope1)    [if U < Optimal_U]
           = Base_Rate + (Slope1 × Optimal_U) + (Slope2 × (U - Optimal_U))
           [if U >= Optimal_U]

Deposit_APY = Borrow_APY × Utilization × (1 - Reserve_Factor)
```

**Suggested Parameters:**
```
Base_Rate = 0% (0 bps)
Optimal_Utilization = 80%
Slope1 = 4% (400 bps)
Slope2 = 100% (10000 bps)
Reserve_Factor = 10%

Example at 50% utilization:
  Borrow_APY = 0% + (50% × 4%) = 2%
  Deposit_APY = 2% × 50% × 90% = 0.9%

Example at 90% utilization (above optimal):
  Borrow_APY = 0% + (4% × 80%) + (100% × 10%) = 13.2%
  Deposit_APY = 13.2% × 90% × 90% = 10.67%
```

### Health Factor Calculation

```
HF = (Collateral_Value_USD × LTV_Weight) / Borrow_Value_USD

where:
  Collateral_Value_USD = Σ(Deposit_Amount[i] × Price[i])
  Borrow_Value_USD = Σ(Borrow_Amount[i] × Price[i])
  LTV_Weight = 0.8 (80% loan-to-value threshold)

Liquidation Threshold:
  HF < 1.0  → Position liquidatable
  LTV = 1.0 / LTV_Weight = 125% (users can borrow up to 80% LTV)

Example:
  Deposit 100 SOL @ $20 = $2000
  Borrow 1500 USDC @ $1.0 = $1500
  
  HF = ($2000 × 0.8) / $1500 = 1.067
  
  User can safely borrow up to: $2000 × 0.8 = $1600 USDC
  Current utilization: $1500 / $1600 = 93.75%
```

### Liquidation Calculation

```
Max_Liquidation_Amount = min(Current_Borrow, 50% × Total_Borrow)
Liquidation_Premium = 1.05 (5%)
Collateral_Seized = Max_Liquidation_Amount × Liquidation_Premium / Collateral_Price

Example:
  Current borrow: 1500 USDC
  Max liquidation: min(1500, 750) = 750 USDC
  Collateral seized (at $5 SOL): 750 × 1.05 / $5 = 157.5 SOL
  Liquidator incentive: 7.5 SOL value (5% bonus)
  Protocol retains: 750 USDC in reserves
```

---

## 12. References & Resources

### Arcium Documentation
- Arcium Docs: https://docs.arcium.com/
- Arcis Framework: https://github.com/Arcium-Protocol/arcis
- Arcium TypeScript SDK: https://ts.arcium.com/docs

### Solana Development
- Anchor Framework: https://www.anchor-lang.com/
- Solana Docs: https://docs.solana.com/
- Solana Program Library: https://github.com/solana-labs/solana-program-library

### DeFi References
- Aave V3 Architecture: https://docs.aave.com/
- Compound V3 Interest Rates: https://compound.finance/docs/
- Euler Finance Documentation: https://docs.euler.finance/

### Security & Privacy
- Ed25519 Signatures: https://ed25519.cr.yp.to/
- AES-GCM Specification: https://csrc.nist.gov/publications/detail/sp/800-38d/final
- MPC Protocols (Shamir Sharing): https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing

---

## Document Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | Jan 11, 2026 | Architecture Team | Initial production-ready design |
| - | - | - | Final review & validation |

**Status:** ✅ **APPROVED FOR DEVELOPMENT**

---

*Last Updated: January 11, 2026*  
*For ShadowLend Privacy Lending Protocol - Solana Privacy Hack 2026*
