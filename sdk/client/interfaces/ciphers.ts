import { PublicKey } from "@solana/web3.js";
import {
  ArciumX25519Keypair,
  ArciumX25519PublicKey,
  RescueCiphertext,
  U128,
} from "@/types";

/**
 * Generic interface for encryption/decryption providers.
 * @typeParam T - The type of data being encrypted/decrypted.
 */
export interface ConfidentialClient<T> {
  /**
   * Encrypts the provided data.
   * @param data - The data to encrypt.
   * @param nonce - Optional nonce to use for encryption. If omitted, uses and increments internal state.
   * @returns A Promise resolving to the ciphertext.
   */
  encrypt(data: T, nonce?: bigint | number | U128): Promise<RescueCiphertext>;

  /**
   * Decrypts the provided ciphertext.
   * @param ciphertext - The ciphertext to decrypt.
   * @param nonce - Optional nonce to use for decryption. If omitted, uses internal state.
   * @returns A Promise resolving to the original data.
   */
  decrypt(
    ciphertext: RescueCiphertext,
    nonce?: bigint | number | U128,
  ): Promise<T>;
}

/**
 * Interface for managing confidential keys and state.
 */
export interface ConfidentialKeyManager {
  /**
   * Derives deterministic keys from a wallet signature or seed.
   * @param seed - The seed (32 bytes) usually derived from a signature.
   */
  initializeFromSeed(seed: Uint8Array): Promise<void>;

  /**
   * Gets the public key for the current session.
   */
  getPublicKey(): ArciumX25519PublicKey;

  /**
   * Gets the current nonce for the next operation.
   */
  getCurrentNonce(): bigint;

  /**
   * Increments the internal nonce.
   */
  incrementNonce(): void;
}
