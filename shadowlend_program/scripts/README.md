# ShadowLend Deployment Scripts

Production-ready TypeScript scripts for deploying and managing the ShadowLend protocol.

## Prerequisites

1. **Solana CLI** configured with a keypair
   ```bash
   solana config get  # Check current config
   ```

2. **Anchor CLI** installed
   ```bash
   anchor --version  # Should be 0.32.1
   ```

3. **Program built**
   ```bash
   anchor build
   ```

4. **Node dependencies installed**
   ```bash
   cd shadowlend_program
   npm install
   ```

## Deployment Scripts

### 1. Deploy to Devnet (Full Setup)

Master script that deploys everything:

```bash
# Ensure you have SOL for deployment
solana airdrop 2 --url devnet

# Deploy
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/deploy-devnet.ts
```

This script:
1. ✅ Initializes all 6 Arcium computation definitions
2. ✅ Creates test collateral mint (9 decimals, like SOL)
3. ✅ Creates test borrow mint (6 decimals, like USDC)
4. ✅ Initializes lending pool with vaults
5. ✅ Funds borrow vault with 1M test USDC
6. ✅ Saves deployment info to `deployment.json`

**Options:**
- `--skip-mints` - Use existing mints from `deployment.json`
- `--skip-comp-defs` - Skip computation definition initialization

### 2. Setup User for Testing

Creates token accounts and mints test tokens for a user:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/setup-user.ts
```

This script:
- Creates associated token accounts for user
- Mints 100 collateral tokens (for depositing)
- Mints 10,000 borrow tokens (for repay testing)

### 3. Verify Deployment

Checks all accounts are correctly initialized:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/verify-deployment.ts
```

### 4. Initialize Pool Only

If you need to initialize just the pool:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/initialize-pool.ts
```

### 5. Initialize Computation Definitions Only

If you need to register Arcium circuits separately:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/init-comp-defs.ts
```

## NPM Scripts

Quick commands from `package.json`:

```bash
npm run deploy      # Full devnet deployment
npm run setup-user  # Setup user accounts
npm run verify      # Verify deployment
npm run init-pool   # Initialize pool only
npm run init-comp   # Initialize comp defs only
```

## Deployment Output

After successful deployment, `deployment.json` contains:

```json
{
  "programId": "6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3",
  "poolPda": "...",
  "collateralMint": "...",
  "borrowMint": "...",
  "collateralVault": "...",
  "borrowVault": "...",
  "admin": "...",
  "deployedAt": "2026-01-15T...",
  "network": "devnet"
}
```

## Default Pool Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| LTV | 80% (8000 bps) | Maximum borrowing power |
| Liquidation Threshold | 85% (8500 bps) | HF < 1.0 triggers liquidation |
| Liquidation Bonus | 5% (500 bps) | Liquidator profit incentive |
| Fixed Borrow Rate | 5% APY (500 bps) | Interest rate for borrowers |
| Collateral Decimals | 9 | Like SOL |
| Borrow Decimals | 6 | Like USDC |

## PDA Derivations

```
Pool:             ["pool", collateral_mint, borrow_mint]
Collateral Vault: ["vault", collateral_mint, borrow_mint, "collateral"]
Borrow Vault:     ["vault", collateral_mint, borrow_mint, "borrow"]
User Obligation:  ["obligation", user, pool]
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANCHOR_WALLET` | Path to keypair | `~/.config/solana/id.json` |
| `ANCHOR_PROVIDER_URL` | RPC endpoint | From Anchor.toml |

## Troubleshooting

### "Insufficient balance"
```bash
solana airdrop 2 --url devnet
```

### "IDL not found"
```bash
anchor build
```

### "Account already in use"
The script handles this gracefully and skips already-initialized accounts.

### "Transaction simulation failed"
Check RPC rate limits. Try again or use a different RPC endpoint.

## Admin Address

The deploying wallet becomes the pool admin:
```bash
solana address  # Shows your admin address
```

Current admin: `CgZvVbh6ARRP142kJkFHa1p2748chn3N9a8N4knRT9fy`
