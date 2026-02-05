import { PublicKey } from "@solana/web3.js";
import { U64, U128, ArciumX25519PublicKey } from "@/types";

export interface RepayInstructionParams {
  /** The user's wallet public key (payer) */
  user: PublicKey;

  /** The borrow mint address (token being repaid, e.g. USDC) */
  borrowMint: PublicKey;

  /** Amount to repay (in token's atomic units) */
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
