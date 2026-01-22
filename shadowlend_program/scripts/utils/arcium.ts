import { ArciumClient } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getNetworkConfig } from "./config";

/**
 * Create Arcium client for the current network
 */
export function createArciumClient(provider: AnchorProvider): ArciumClient {
  const config = getNetworkConfig();
  
  return new ArciumClient({
    provider,
    clusterOffset: config.arciumClusterOffset,
  });
}

/**
 * Get MXE account address
 */
export async function getMxeAccount(
  arciumClient: ArciumClient
): Promise<PublicKey> {
  const mxeAccount = await arciumClient.getMxeAccount();
  return mxeAccount;
}

/**
 * Check if MXE is initialized
 */
export async function checkMxeInitialized(
  arciumClient: ArciumClient
): Promise<boolean> {
  try {
    const mxeAccount = await arciumClient.getMxeAccount();
    const accountInfo = await arciumClient.provider.connection.getAccountInfo(
      mxeAccount
    );
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Check if MXE keys are set (DKG completed)
 */
export async function checkMxeKeysSet(
  arciumClient: ArciumClient
): Promise<boolean> {
  try {
    const mxeAccount = await arciumClient.getMxeAccount();
    const mxeData = await arciumClient.program.account.mxe.fetch(mxeAccount);
    
    // Check if public key is set (not all zeros)
    const pubkey = (mxeData as any).publicKey;
    if (!pubkey) return false;
    
    const isZero = pubkey.every((byte: number) => byte === 0);
    return !isZero;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for MXE keys to be set
 */
export async function waitForMxeKeys(
  arciumClient: ArciumClient,
  maxWaitMs = 60000,
  pollIntervalMs = 5000
): Promise<void> {
  const startTime = Date.now();
  
  console.log("⏳ Waiting for MXE DKG to complete...");
  
  while (Date.now() - startTime < maxWaitMs) {
    const keysSet = await checkMxeKeysSet(arciumClient);
    
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
 * Get computation definition account address
 */
export function getComputationDefAccount(
  programId: PublicKey,
  circuitName: string
): PublicKey {
  const [compDefAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("computation_definition"),
      Buffer.from(circuitName),
      programId.toBuffer(),
    ],
    new PublicKey("ArciumMXEProgramId11111111111111111111111") // Replace with actual Arcium program ID
  );
  
  return compDefAccount;
}
