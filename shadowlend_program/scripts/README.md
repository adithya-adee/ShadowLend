# ShadowLend Scripts

This directory contains TypeScript scripts for deploying and managing the ShadowLend protocol.

## Prerequisites

Make sure you have:
1. Anchor CLI installed
2. Solana CLI configured with a keypair
3. The program built (`anchor build`)

## Installation

From the `shadowlend_program` directory:

```bash
yarn install
```

## Available Scripts

### 1. Initialize Pool

Creates a new lending pool with:
- Test collateral mint (simulating wSOL)
- Test borrow mint (simulating USDC)
- Collateral and borrow vaults
- Default risk parameters (80% LTV, 85% liquidation threshold)

```bash
# For localnet
anchor localnet &  # Start local validator
ANCHOR_PROVIDER_URL=http://localhost:8899 npx ts-node scripts/initialize-pool.ts

# For devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/initialize-pool.ts
```

### 2. Initialize Computation Definitions

Registers all 6 Arcium MXE circuits (must be run ONCE before any operations):

```bash
npx ts-node scripts/init-comp-defs.ts
```

## Default Pool Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| LTV | 80% (8000 bps) | Maximum borrowing power |
| Liquidation Threshold | 85% (8500 bps) | HF < 1.0 triggers liquidation |
| Liquidation Bonus | 5% (500 bps) | Liquidator profit incentive |
| Fixed Borrow Rate | 5% APY (500 bps) | Interest rate for borrowers |

## PDA Derivations (Multi-Pool Support)

```
Pool:            [b"pool", collateral_mint, borrow_mint]
Collateral Vault: [b"vault", collateral_mint, borrow_mint, b"collateral"]
Borrow Vault:    [b"vault", collateral_mint, borrow_mint, b"borrow"]
User Obligation: [b"obligation", user, pool]
```

This design enables multiple pools with different borrow assets for the same collateral (e.g., SOL→USDC and SOL→USDT).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANCHOR_WALLET` | Path to keypair | `~/.config/solana/id.json` |
| `ANCHOR_PROVIDER_URL` | RPC endpoint | From Anchor.toml |
