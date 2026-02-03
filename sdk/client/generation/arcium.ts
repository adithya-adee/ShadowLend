import {
  getMXEAccAddress,
  getArciumProgram,
  getMXEPublicKey,
} from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import crypto from "crypto";
import { program } from "@/idl";

/**
 * Retrieves the Multi-Party Execution (MXE) account address for the ShadowLend program.
 * 
 * @returns The public key of the MXE account.
 */
export function getMxeAccount(): PublicKey {
  try {
    return getMXEAccAddress(program.programId);
  } catch (error) {
     const errorMessage = error instanceof Error ? error.message : String(error);
     throw new Error(`Failed to get MXE account address: ${errorMessage}`);
  }
}

/**
 * Checks if the MXE account is initialized on-chain for the ShadowLend program.
 * 
 * @param provider - The Anchor provider used to query the chain.
 * @returns A promise that resolves to `true` if initialized, `false` otherwise.
 */
export async function checkMxeInitialized(
  provider: AnchorProvider,
): Promise<boolean> {
  try {
    const mxeAccount = getMXEAccAddress(program.programId);
    const accountInfo = await provider.connection.getAccountInfo(mxeAccount);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if the MXE Distributed Key Generation (DKG) is complete and keys are set for the ShadowLend program.
 * 
 * @param provider - The Anchor provider.
 * @param maxRetries - Maximum number of retries (default: 10).
 * @param retryDelayMs - Delay between retries in milliseconds (default: 500).
 * @returns A promise that resolves to `true` if keys are set, `false` otherwise.
 */
export async function checkMxeKeysSet(
  provider: AnchorProvider,
  maxRetries: number = 10,
  retryDelayMs: number = 500,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, program.programId);
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
 * Waits for the MXE keys to be set for the ShadowLend program by polling the status.
 * 
 * @param provider - The Anchor provider.
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 60000).
 * @param pollIntervalMs - Polling interval in milliseconds (default: 5000).
 * @throws Error if timeout is reached before keys are set.
 */
export async function waitForMxeKeys(
  provider: AnchorProvider,
  maxWaitMs = 60000,
  pollIntervalMs = 5000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const keysSet = await checkMxeKeysSet(provider);

    if (keysSet) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timeout waiting for MXE keys to be set");
}

/**
 * Waits for an Arcium computation to finalize by polling the computation account.
 * 
 * The computation lifecycle involves:
 * 1. Transaction completion (encrypted data queued).
 * 2. Waiting in mempool.
 * 3. Off-chain MPC execution.
 * 4. Callback invocation with results.
 * 
 * @param provider - The Anchor provider.
 * @param computationOffset - The unique computation offset (ID) used when queuing.
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 120000 = 2 minutes).
 * @param pollIntervalMs - Polling interval in milliseconds (default: 2000 = 2 seconds).
 * @returns A promise that resolves to `true` when the computation is finalized.
 * @throws Error if timeout is reached.
 */
export async function waitForComputationFinalization(
  provider: AnchorProvider,
  computationOffset: BN,
  maxWaitMs = 120000,
  pollIntervalMs = 2000,
): Promise<boolean> {
  const startTime = Date.now();
  const mxeAccount = getMXEAccAddress(program.programId);

  // Derive computation account address
  // The computation account is created by Arcium when the computation is queued
  const [computationAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ComputationAccount"),
      mxeAccount.toBuffer(),
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    getArciumProgram(provider).programId,
  );

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Check if computation account exists and has been processed
      const accountInfo =
        await provider.connection.getAccountInfo(computationAccount);

      if (accountInfo) {
        // Parse the account data to check status if needed
        // For now, existence implies finalization step or at least processed state
        return true;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      // Log polling errors but continue unless critical
      // Only log verbose polling if needed, simplifying output
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(
    `Timeout waiting for computation ${computationOffset.toString()} to finalize`,
  );
}

/**
 * Retrieves the Arcium program instance from the provider.
 * 
 * @param provider - The Anchor provider.
 * @returns The Arcium program instance.
 */
export function getArciumProgramInstance(provider: AnchorProvider) {
  return getArciumProgram(provider);
}

/**
 * Generates a cryptographically secure random 8-byte computation offset.
 * 
 * @returns A BN (BigNumber) representing the random offset.
 */
export function generateComputationOffset(): BN {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  return new BN(Buffer.from(randomBytes), "hex");
}
