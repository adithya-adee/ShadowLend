/**
 * ShadowLend Arcium Utilities
 * 
 * Functions for interacting with Arcium MXE, encryption, and computations.
 * Compatible with Arcium SDK v0.6.2
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import {
  getArciumEnv,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getMXEPublicKey,
  awaitComputationFinalization,
  RescueCipher,
  x25519,
  buildFinalizeCompDefTx,
} from "@arcium-hq/client";
import { ARCIUM_CLUSTER_OFFSET, COMP_DEF_NAMES } from "./config";

// ============================================================
// Types
// ============================================================

export interface EncryptionContext {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  cipher: RescueCipher;
  mxePublicKey: Uint8Array;
}

export interface ArciumAccountsConfig {
  programId: PublicKey;
  computationOffset: BN;
  compDefName: keyof typeof COMP_DEF_NAMES;
}

export interface ArciumAccounts {
  computationAccount: PublicKey;
  clusterAccount: PublicKey;
  mxeAccount: PublicKey;
  mempoolAccount: PublicKey;
  executingPool: PublicKey;
  compDefAccount: PublicKey;
}

// ============================================================
// Initialization
// ============================================================

/**
 * Ensures Arcium environment is properly configured.
 * Sets the cluster offset explicitly.
 */
export function initializeArciumEnv(clusterOffset: number = ARCIUM_CLUSTER_OFFSET): void {
  const env = getArciumEnv();
  env.arciumClusterOffset = clusterOffset;
}

/**
 * Gets the Arcium environment, ensuring it's initialized.
 */
export function getConfiguredArciumEnv() {
  initializeArciumEnv();
  return getArciumEnv();
}

// ============================================================
// Encryption
// ============================================================

/**
 * Fetches MXE public key with retry logic for network issues.
 */
export async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 1000
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`   Attempt ${attempt} failed to fetch MXE public key`);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts`);
}

/**
 * Creates encryption context for confidential transactions.
 * Uses x25519 Diffie-Hellman key exchange with MXE.
 */
export async function createEncryptionContext(
  provider: anchor.AnchorProvider,
  programId: PublicKey
): Promise<EncryptionContext> {
  const mxePublicKey = await getMXEPublicKeyWithRetry(provider, programId);

  // Generate x25519 key pair for Diffie-Hellman key exchange
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  // Derive shared secret with MXE
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);

  // Initialize RescueCipher with shared secret
  const cipher = new RescueCipher(sharedSecret);

  return { privateKey, publicKey, cipher, mxePublicKey };
}

/**
 * Encrypts a single u64 value for submission to Arcium MXE.
 * Returns a 32-byte ciphertext array.
 */
export function encryptU64(
  cipher: RescueCipher,
  value: bigint,
  nonce: Uint8Array
): Uint8Array {
  const ciphertext = cipher.encrypt([value], nonce);
  return new Uint8Array(ciphertext[0]);
}

/**
 * Encrypts multiple values at once.
 */
export function encryptValues(
  cipher: RescueCipher,
  values: bigint[],
  nonce: Uint8Array
): Uint8Array[] {
  const ciphertexts = cipher.encrypt(values, nonce);
  return ciphertexts.map((ct) => new Uint8Array(ct));
}

/**
 * Converts a 16-byte nonce to u128 BN format.
 */
export function nonceToU128(nonce: Uint8Array): BN {
  let result = new BN(0);
  for (let i = 0; i < 16; i++) {
    result = result.or(new BN(nonce[i]).shln(i * 8));
  }
  return result;
}

/**
 * Generates a random computation offset.
 */
export function generateComputationOffset(): BN {
  return new BN(randomBytes(8));
}

/**
 * Generates a random 16-byte nonce.
 */
export function generateNonce(): Uint8Array {
  return randomBytes(16);
}

// ============================================================
// Account Derivation
// ============================================================

/**
 * Gets all Arcium-related accounts needed for a computation.
 * 
 * NOTE: compDefAccount uses OUR program ID as seed because Arcium's
 * InitComputationDefinition validates the PDA using the calling program's ID.
 */
export function getArciumAccounts(config: ArciumAccountsConfig): ArciumAccounts {
  const { programId, computationOffset, compDefName } = config;
  const clusterOffset = ARCIUM_CLUSTER_OFFSET;

  const compDefOffsetBuffer = getCompDefAccOffset(COMP_DEF_NAMES[compDefName]);
  const compDefOffsetNum = Buffer.from(compDefOffsetBuffer).readUInt32LE();

  return {
    computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
    clusterAccount: getClusterAccAddress(clusterOffset),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(clusterOffset),
    executingPool: getExecutingPoolAccAddress(clusterOffset),
    // Use OUR program ID as seed (Arcium program validates with calling program ID)
    compDefAccount: getCompDefAccAddress(programId, compDefOffsetNum),
  };
}

/**
 * Gets the computation definition PDA for a specific instruction.
 * Uses our program ID as seed (consistent with Arcium's InitComputationDefinition)
 */
export function getCompDefPda(
  programId: PublicKey,
  compDefName: keyof typeof COMP_DEF_NAMES
): PublicKey {
  const offset = getCompDefAccOffset(COMP_DEF_NAMES[compDefName]);
  const offsetNum = Buffer.from(offset).readUInt32LE();

  return getCompDefAccAddress(programId, offsetNum);
}

// ============================================================
// Computation Lifecycle
// ============================================================

/**
 * Waits for an Arcium computation to be finalized.
 * Returns the callback transaction signature.
 */
export async function waitForComputation(
  provider: anchor.AnchorProvider,
  computationOffset: BN,
  programId: PublicKey,
  commitment: "confirmed" | "finalized" = "confirmed",
  timeoutMs: number = 120000
): Promise<string> {
  return awaitComputationFinalization(
    provider,
    computationOffset,
    programId,
    commitment
  );
}

/**
 * Builds a finalize computation definition transaction.
 */
export async function buildFinalizeCompDefTransaction(
  provider: anchor.AnchorProvider,
  compDefName: keyof typeof COMP_DEF_NAMES,
  programId: PublicKey
) {
  const offset = getCompDefAccOffset(COMP_DEF_NAMES[compDefName]);
  const offsetNum = Buffer.from(offset).readUInt32LE();

  return buildFinalizeCompDefTx(provider, offsetNum, programId);
}

// ============================================================
// Re-exports
// ============================================================

export {
  getArciumEnv,
  getMXEAccAddress,
  getArciumProgramId,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
};
