/**
 * ShadowLend Configuration
 * 
 * Central configuration for program IDs, network settings, and constants.
 * Compatible with Arcium SDK v0.5.4 and Anchor v0.32.x
 */

import { PublicKey } from "@solana/web3.js";

// ============================================================
// Program Configuration
// ============================================================

export const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");

// ============================================================
// Token Mints (Devnet)
// ============================================================

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// ============================================================
// Arcium Configuration
// ============================================================

export const ARCIUM_CLUSTER_OFFSET = 123; // Devnet cluster offset

// Computation definition names (must match lib.rs)
export const COMP_DEF_NAMES = {
  deposit: "compute_confidential_deposit",
  borrow: "compute_confidential_borrow",
  withdraw: "compute_confidential_withdraw",
  repay: "compute_confidential_repay",
  liquidate: "compute_confidential_liquidate",
  interest: "compute_confidential_interest",
} as const;

// ============================================================
// PDA Seeds
// ============================================================

export const PDA_SEEDS = {
  pool: Buffer.from("pool"),
  vault: Buffer.from("vault"),
  obligation: Buffer.from("obligation"),
  collateral: Buffer.from("collateral"),
  borrow: Buffer.from("borrow"),
  signerAccount: Buffer.from("SignerAccount"),
} as const;

// ============================================================
// Pool Configuration Defaults
// ============================================================

export const DEFAULT_POOL_CONFIG = {
  ltv: 8000,                    // 80%
  liquidationThreshold: 8500,   // 85%
  liquidationBonus: 500,        // 5%
  fixedBorrowRate: 500,         // 5% APY
} as const;

// ============================================================
// Network Configuration
// ============================================================

export const NETWORKS = {
  devnet: {
    rpcUrl: "https://api.devnet.solana.com",
    wsUrl: "wss://api.devnet.solana.com",
    genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWCXL5v8qf",
  },
  localnet: {
    rpcUrl: "http://127.0.0.1:8899",
    wsUrl: "ws://127.0.0.1:8900",
    genesisHash: null, // Varies per validator instance
  },
} as const;

// ============================================================
// Pyth Oracle Configuration (Devnet)
// ============================================================

export const PYTH_CONFIG = {
  receiverProgramId: new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"),
  feeds: {
    SOL_USD: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    USDC_USD: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  },
  maxPriceAge: 30, // seconds
} as const;
