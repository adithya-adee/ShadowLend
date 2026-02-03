import { PublicKey } from "@solana/web3.js";
import { U64, U128, ArciumX25519PublicKey } from "@/types";

export interface SpendInstructionParams {
  /** The user's wallet public key (payer) */
  user: PublicKey;

  /** The mint address of the token to spend/withdraw (e.g. USDC) */
  borrowMint: PublicKey;

  /** Amount to spend (withdraw to wallet) */
  amount: U64;

  /**
   * User's state nonce for replay protection.
   */
  userNonce: U128;

  /**
   * User's Arcium X25519 Public Key.
   */
  userPublicKey: ArciumX25519PublicKey;
}
