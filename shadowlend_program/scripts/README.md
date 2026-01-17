# ShadowLend Scripts

Scripts for deploying and testing the ShadowLend protocol.

## Compatibility

- **Arcium SDK**: v0.5.4
- **Anchor**: v0.32.x
- **@solana/web3.js**: v1.x

## Structure

```
scripts/
├── lib/                  # Shared library modules
│   ├── index.ts         # Re-exports all modules
│   ├── config.ts        # Program IDs, network config, constants
│   ├── pda.ts           # PDA derivation utilities
│   ├── arcium.ts        # Arcium MXE & encryption utilities
│   └── utils.ts         # Common helper functions
├── deploy.ts            # Main deployment script
├── test-devnet.ts       # Devnet integration tests
├── verify-deployment.ts # Deployment verification
└── README.md
```

## Quick Start

```bash
# Install dependencies
npm install

# Build program
anchor build

# Deploy to devnet
npm run deploy

# Run tests
npm run test:devnet

# Verify deployment
npm run verify
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run deploy` | Deploy to devnet with full initialization |
| `npm run deploy:skip-comp` | Deploy, skip computation definitions |
| `npm run deploy:local` | Deploy to localnet |
| `npm run test:devnet` | Run deposit/borrow tests on devnet |
| `npm run verify` | Verify deployment is valid |

## Environment Variables

- `ANCHOR_PROVIDER_URL`: RPC URL (default: devnet)
- `ANCHOR_WALLET`: Path to keypair (~/.config/solana/id.json)
- `ARCIUM_CLUSTER_OFFSET`: Arcium cluster (devnet: 123)

## Callback Server

For large computation outputs (>1KB), implement a callback server:

```
POST /callback

Body: mempool_id | comp_def_offset | tx_sig | data_sig | pub_key | data
```

See [Arcium docs](https://docs.arcium.com/developers/callback-server) for details.
