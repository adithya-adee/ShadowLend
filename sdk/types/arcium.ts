import { Bytes, U128, U64 } from "@/types/common";
import { BN } from "@coral-xyz/anchor";
import crypto from "crypto";

/**
 * Represents the offset of a computation in the Arcium network.
 */
export type ComputationOffset = U64;

/**
 * Arcium X25519 Public Key (32 bytes).
 */
export type ArciumX25519PublicKey = Bytes & {
  _brand: "ArciumX25519PublicKey";
  length: 32;
};

/**
 * Arcium X25519 Secret Key (32 bytes).
 */
export type ArciumX25519SecretKey = Bytes & {
  _brand: "ArciumX25519SecretKey";
  length: 32;
};

/**
 * Keypair containing Arcium X25519 public and secret keys.
 */
export interface ArciumX25519Keypair {
  publicKey: ArciumX25519PublicKey;
  secretKey: ArciumX25519SecretKey;
}

/**
 * Encrypted ciphertext using Rescue cipher (32 bytes).
 */
export type RescueCiphertext = Bytes & {
  _brand: "RescueCiphertext";
  length: 32;
};

/**
 * Nonce used in Arcium encryption/decryption.
 */
export type ArciumX25519Nonce = U128;

/**
 * Shared secret derived from ECDH (32 bytes).
 */
export type RescueCipherSharedSecret = Bytes & {
  _brand: "RescueCipherSharedSecret";
  length: 32;
};

// --- Helper Functions ---

/**
 * Validates and casts a byte array to ArciumX25519PublicKey.
 * @throws Error if length is not 32.
 */
export const toArciumX25519PublicKey = (
  bytes: Uint8Array,
): ArciumX25519PublicKey => {
  if (bytes.length !== 32)
    throw new Error(
      `Invalid length for ArciumX25519PublicKey: ${bytes.length}`,
    );
  return bytes as ArciumX25519PublicKey;
};

/**
 * Validates and casts a byte array to ArciumX25519SecretKey.
 * @throws Error if length is not 32.
 */
export const toArciumX25519SecretKey = (
  bytes: Uint8Array,
): ArciumX25519SecretKey => {
  if (bytes.length !== 32)
    throw new Error(
      `Invalid length for ArciumX25519SecretKey: ${bytes.length}`,
    );
  return bytes as ArciumX25519SecretKey;
};

/**
 * Generates a random Arcium X25519 Keypair (Mock implementation for type safety).
 *
 * @remarks
 * This currently generates random bytes and does NOT enforce X25519 curve properties.
 * Use for testing or placeholder purposes.
 */
export const generateArciumX25519Keypair = (): ArciumX25519Keypair => {
  const pk = new Uint8Array(32);
  const sk = new Uint8Array(32);
  // Use crypto for random bytes
  const randomBytes = crypto.randomBytes(64);
  pk.set(randomBytes.subarray(0, 32));
  sk.set(randomBytes.subarray(32, 64));

  return {
    publicKey: pk as ArciumX25519PublicKey,
    secretKey: sk as ArciumX25519SecretKey,
  };
};

/**
 * Validates and casts a byte array to RescueCiphertext.
 * @throws Error if length is not 32.
 */
export const toRescueCiphertext = (bytes: Uint8Array): RescueCiphertext => {
  if (bytes.length !== 32)
    throw new Error(`Invalid length for RescueCiphertext: ${bytes.length}`);
  return bytes as RescueCiphertext;
};

/**
 * Converts bytes or number/BN to ArciumX25519Nonce (U128).
 */
export const toArciumX25519Nonce = (
  val: number | BN | Uint8Array,
): ArciumX25519Nonce => {
  if (val instanceof Uint8Array) {
    return new BN(val) as ArciumX25519Nonce;
  }
  return new BN(val) as ArciumX25519Nonce;
};
