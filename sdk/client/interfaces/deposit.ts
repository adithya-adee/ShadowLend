import { PublicKey } from "@solana/web3.js";
import { U64, U128, ArciumX25519PublicKey } from "@/types";

export interface DepositInstructionParams {
  /** The user's wallet public key (payer) */
  user: PublicKey;

  /** The collateral mint address (e.g. USDC, SOL) */
  collateralMint: PublicKey;

  /** Amount to deposit (in token's atomic units) */
  amount: U64;

  /**
   * User's state nonce for replay protection.
   * Should be 0 for first deposit, or retrieved from existing UserObligation account.
   */
  userNonce: U128;

  /**
   * User's Arcium X25519 Public Key.
   * Used by the MPC cluster to encrypt the output for the user.
   */
  userPublicKey: ArciumX25519PublicKey;

  /**
   * Optional Arcium Cluster Offset. Defaults to ARCIUM_LOCALNET_CLUSTER_OFFSET.
   */
  clusterOffset?: number;
}
