import { PublicKey } from "@solana/web3.js";
import { U64, U128, ArciumX25519PublicKey } from "@/types";

export interface WithdrawInstructionParams {
  /** The user's wallet public key (payer) */
  user: PublicKey;

  /** The collateral mint address (token being withdrawn, e.g. SOL) */
  collateralMint: PublicKey;

  /** Amount to withdraw */
  amount: U64;

  /**
   * User's state nonce for replay protection.
   */
  userNonce: U128;

  /**
   * User's Arcium X25519 Public Key.
   */
  userPublicKey: ArciumX25519PublicKey;

  /**
   * Optional Arcium Cluster Offset. Defaults to ARCIUM_LOCALNET_CLUSTER_OFFSET.
   */
  clusterOffset?: number;
}
