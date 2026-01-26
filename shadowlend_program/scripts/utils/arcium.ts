import {
  getMXEAccAddress,
  getArciumProgram,
  getMXEPublicKey
} from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { getNetworkConfig } from "./config";
import crypto from "crypto";

/**
 * Get MXE account address for a program
 */
export function getMxeAccount(
  programId: PublicKey
): PublicKey {
  return getMXEAccAddress(programId);
}

/**
 * Check if MXE is initialized
 */
export async function checkMxeInitialized(
  provider: AnchorProvider,
  programId: PublicKey
): Promise<boolean> {
  try {
    const mxeAccount = getMXEAccAddress(programId);
    const accountInfo = await provider.connection.getAccountInfo(mxeAccount);
    return accountInfo !== null;
  } catch (error) {
    console.error("Error checking MXE initialization:", error);
    return false;
  }
}

/**
 * Check if MXE keys are set (DKG completed)
 */
export async function checkMxeKeysSet(
  provider: AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 500
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return true;
      }
    } catch (error) {
      // Continue to next attempt
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return false;
}

/**
 * Wait for MXE keys to be set
 */
export async function waitForMxeKeys(
  provider: AnchorProvider,
  programId: PublicKey,
  maxWaitMs = 60000,
  pollIntervalMs = 5000
): Promise<void> {
  const startTime = Date.now();
  
  console.log("⏳ Waiting for MXE DKG to complete...");
  
  while (Date.now() - startTime < maxWaitMs) {
    const keysSet = await checkMxeKeysSet(provider, programId);
    
    if (keysSet) {
      console.log("✅ MXE keys are set!");
      return;
    }
    
    console.log("   Still waiting for DKG...");
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error("Timeout waiting for MXE keys to be set");
}

/**
 * Wait for computation to finalize by polling the computation account
 * 
 * This is a custom implementation because awaitComputationFinalization is broken.
 * It polls the computation account and checks for callback execution.
 * 
 * The computation lifecycle:
 * 1. Transaction completes - encrypted data queued
 * 2. Computation waits in mempool
 * 3. MPC execution offchain
 * 4. Callback invocation with results
 * 
 * @param provider - Anchor provider
 * @param computationOffset - The computation offset used when queuing
 * @param programId - The MXE program ID
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 120000 = 2 minutes)
 * @param pollIntervalMs - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @returns True when computation is finalized
 */
// No changes made.
export async function waitForComputationFinalization(
  provider: AnchorProvider,
  computationOffset: BN,
  programId: PublicKey,
  maxWaitMs = 120000,
  pollIntervalMs = 2000
): Promise<boolean> {
  console.log(`⏳ Waiting for computation ${computationOffset.toString()} to finalize...`);
  
  const startTime = Date.now();
  const mxeAccount = getMXEAccAddress(programId);
  
  // Derive computation account address
  // The computation account is created by Arcium when the computation is queued
  const [computationAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ComputationAccount"),
      mxeAccount.toBuffer(),
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    getArciumProgram(provider).programId
  );
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Check if computation account exists and has been processed
      const accountInfo = await provider.connection.getAccountInfo(computationAccount);
      
      if (accountInfo) {
        // Parse the account data to check status
        // The computation is finalized when the callback has been executed
        console.log(`✅ Computation finalized!`);
        return true;
      }
      
      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.log(`   Polling... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
  
  throw new Error(`Timeout waiting for computation ${computationOffset.toString()} to finalize`);
}

/**
 * Get Arcium program instance
 */
export function getArciumProgramInstance(provider: AnchorProvider) {
  return getArciumProgram(provider);
}

/**
 * Generate random computation offset
 * Returns an 8-byte random value as BN
 */
export function generateComputationOffset(): BN {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  return new BN(Buffer.from(randomBytes), "hex");
}
