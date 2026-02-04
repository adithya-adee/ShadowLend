import { PublicKey } from "@solana/web3.js";
import { U128, ArciumX25519PublicKey, RescueCiphertext } from "@/types";

export interface BorrowInstructionParams {
  /** The user's wallet public key (payer) */
  user: PublicKey;

  /**
   * Encrypted amount to borrow.
   * This is a 32-byte ciphertext encrypted with the shared secret.
   */
  amount: RescueCiphertext;

  /**
   * User's state nonce for replay protection.
   */
  userNonce: U128;

  /**
   * User's Arcium X25519 Public Key.
   */
  userPublicKey: ArciumX25519PublicKey;
}
