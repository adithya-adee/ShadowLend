import { PublicKey } from "@solana/web3.js";

// Arcium Cluster Constants

/**
 * Offset for the Arcium Devnet cluster.
 */
export const ARCIUM_DEVNET_CLUSTER_OFFSET = 456;

/**
 * Offset for the Arcium Localnet cluster.
 */
export const ARCIUM_LOCALNET_CLUSTER_OFFSET = 0;

// Seed Constants

/**
 * PDA Seeds used by the ShadowLend program.
 */
export const SEEDS = {
  /** Seed for User Obligation account */
  USER_OBLIGATION: Buffer.from("obligation"),
  /** Seed for Collateral Vault account */
  COLLATERAL_VAULT: Buffer.from("collateral_vault"),
  /** Seed for Arcium Signer account (legacy/internal) */
  ARCIUM_SIGNER: Buffer.from("ArciumSignerAccount"),
  /** Seed for Pool V2 state account */
  POOL_V2: Buffer.from("pool_v2"),
  /** Seed for Borrow Vault account */
  BORROW_VAULT: Buffer.from("borrow_vault"),
};

// Program Constants

/**
 * The program ID of the Arcium protocol on Devnet.
 */
export const ARCIUM_PROGRAM_ID_DEVNET = new PublicKey(
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
);
