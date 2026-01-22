# ShadowLend Scripts

Modular scripts for deploying, testing, and managing the ShadowLend protocol on both devnet and localnet.

## Directory Structure

```
scripts/
├── utils/              # Shared utilities
│   ├── config.ts       # Network configuration
│   ├── deployment.ts   # Deployment state management
│   ├── arcium.ts       # Arcium-specific utilities
│   └── index.ts        # Exports
├── setup/              # Setup and initialization scripts
│   ├── initialize-pool.ts
│   ├── initialize-comp-defs.ts
│   └── check-mxe.ts
└── test/               # Test scripts
    ├── test-deposit.ts
    ├── test-borrow.ts
    ├── test-withdraw.ts
    ├── test-repay.ts
    └── run-all-tests.ts
```

## Environment Setup

### Network Selection

Set the `NETWORK` environment variable to choose between devnet and localnet:

```bash
# For devnet (default)
export NETWORK=devnet

# For localnet
export NETWORK=localnet
```

### Wallet Configuration

By default, scripts use `~/.config/solana/id.json`. To use a different wallet:

```bash
export WALLET_PATH=/path/to/your/keypair.json
```

## Setup Scripts

### 1. Check MXE Status

Verify that Arcium MXE is initialized and DKG is complete:

```bash
npm run setup:check-mxe
```

This will check:
- MXE initialization status
- DKG (Distributed Key Generation) completion
- Cluster configuration

### 2. Initialize Pool

Create the lending pool with configuration parameters:

```bash
npm run setup:init-pool
```

This creates:
- Pool account (PDA)
- Collateral vault (PDA)
- Borrow vault (PDA)

Default configuration:
- LTV: 75% (7500 bps)
- Liquidation Threshold: 80% (8000 bps)

### 3. Initialize Computation Definitions

Initialize Arcium computation definitions for all circuits:

```bash
npm run setup:init-comp-defs
```

This initializes computation definitions for:
- `deposit` circuit
- `withdraw` circuit
- `borrow` circuit
- `repay` circuit

## Test Scripts

### Run All Tests

Execute the complete test suite:

```bash
npm run test:all
```

### Individual Tests

Run specific instruction tests:

```bash
# Test deposit
npm run test:deposit

# Test borrow
npm run test:borrow

# Test withdraw
npm run test:withdraw

# Test repay
npm run test:repay
```

## Deployment Workflow

### Devnet Deployment

```bash
# 1. Set network to devnet
export NETWORK=devnet

# 2. Build and deploy program
anchor build
anchor deploy

# 3. Check MXE status
npm run setup:check-mxe

# 4. Initialize pool
npm run setup:init-pool

# 5. Initialize computation definitions
npm run setup:init-comp-defs

# 6. Run tests
npm run test:all
```

### Localnet Deployment

```bash
# 1. Start local Solana validator
solana-test-validator

# 2. Start local Arcium network (in separate terminal)
# Follow Arcium localnet setup instructions

# 3. Set network to localnet
export NETWORK=localnet

# 4. Build and deploy program
anchor build
anchor deploy --provider.cluster localnet

# 5. Initialize MXE (if needed)
# Follow Arcium MXE initialization instructions

# 6. Check MXE status
npm run setup:check-mxe

# 7. Initialize pool
npm run setup:init-pool

# 8. Initialize computation definitions
npm run setup:init-comp-defs

# 9. Run tests
npm run test:all
```

## Deployment State

Deployment information is stored in `deployment.json`:

```json
{
  "network": "devnet",
  "programId": "BzVVANvwPQgyQ7F4zxkaJ9gjrwKQEoponS7sMbHLCHU",
  "poolAddress": "...",
  "collateralVault": "...",
  "borrowVault": "...",
  "mxeAccount": "...",
  "computationDefinitions": {
    "deposit": "...",
    "withdraw": "...",
    "borrow": "...",
    "repay": "..."
  },
  "timestamp": "2026-01-23T05:00:00.000Z"
}
```

## Network Configuration

Network settings are defined in `scripts/utils/config.ts`:

```typescript
export const NETWORKS = {
  localnet: {
    name: "localnet",
    rpcUrl: "http://127.0.0.1:8899",
    arciumClusterOffset: 0,
  },
  devnet: {
    name: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    arciumClusterOffset: 456,
  },
};
```

Update `arciumClusterOffset` based on your Arcium cluster configuration.

## Troubleshooting

### MXE Keys Not Set

If `check-mxe` reports that keys are not set:
- DKG is still in progress
- Wait a few minutes and check again
- Verify Arcium cluster is running properly

### Pool Already Initialized

If pool initialization fails with "already in use":
- Pool is already initialized
- Check `deployment.json` for pool address
- Use existing pool or create new deployment

### Computation Definition Errors

If computation definition initialization fails:
- Ensure MXE is initialized and keys are set
- Verify circuit names match encrypted-ixs
- Check Arcium SDK version compatibility

## Development

### Adding New Tests

1. Create test file in `scripts/test/`
2. Import utilities from `../utils`
3. Add npm script to `package.json`
4. Update test runner if needed

### Modifying Network Config

Edit `scripts/utils/config.ts` to:
- Add new networks
- Update RPC endpoints
- Change Arcium cluster offsets

## Best Practices

1. **Always check MXE status** before running tests
2. **Use environment variables** for network selection
3. **Keep deployment.json** in version control (gitignored)
4. **Run tests sequentially** to avoid state conflicts
5. **Monitor Arcium cluster** for computation status
