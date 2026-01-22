import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";

/**
 * Network configuration type
 */
export type NetworkConfig = {
  name: "localnet" | "devnet";
  rpcUrl: string;
  arciumClusterOffset: number;
};

/**
 * Network configurations
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  localnet: {
    name: "localnet",
    rpcUrl: "http://127.0.0.1:8899",
    arciumClusterOffset: 0, // Update based on local Arcium setup
  },
  devnet: {
    name: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    arciumClusterOffset: 456, // Current devnet cluster offset
  },
};

/**
 * Get network configuration from environment or default to devnet
 */
export function getNetworkConfig(): NetworkConfig {
  const network = process.env.NETWORK || "devnet";
  const config = NETWORKS[network];
  
  if (!config) {
    throw new Error(
      `Invalid network: ${network}. Valid options: ${Object.keys(NETWORKS).join(", ")}`
    );
  }
  
  return config;
}

/**
 * Create Anchor provider for the specified network
 */
export function createProvider(
  wallet: Wallet,
  config?: NetworkConfig
): AnchorProvider {
  const networkConfig = config || getNetworkConfig();
  const connection = new Connection(networkConfig.rpcUrl, "confirmed");
  
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

/**
 * Load program from IDL
 */
export async function loadProgram(
  provider: AnchorProvider,
  programId: PublicKey,
  idl: any
): Promise<Program> {
  return new Program(idl, provider);
}

/**
 * Utility to confirm transaction with retry
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      );
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Format SOL amount for display
 */
export function formatSOL(lamports: number): string {
  return (lamports / 1e9).toFixed(4);
}

/**
 * Log with timestamp
 */
export function log(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Log error with timestamp
 */
export function logError(message: string, error?: any): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ ${message}`);
  if (error) {
    console.error(error);
  }
}

/**
 * Log success with timestamp
 */
export function logSuccess(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ✅ ${message}`);
}
