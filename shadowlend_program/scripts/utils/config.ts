import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import chalk from "chalk";

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
 * Log with timestamp and color
 */
export function log(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(chalk.gray(`[${timestamp}]`), message, ...args);
}

/**
 * Log info message with blue color
 */
export function logInfo(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(chalk.gray(`[${timestamp}]`), chalk.blue(`ℹ ${message}`), ...args);
}

/**
 * Log warning with yellow color
 */
export function logWarning(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(chalk.gray(`[${timestamp}]`), chalk.yellow(`⚠️  ${message}`), ...args);
}

/**
 * Log error with red color and timestamp
 */
export function logError(message: string, error?: any): void {
  const timestamp = new Date().toISOString();
  console.error(chalk.gray(`[${timestamp}]`), chalk.red(`❌ ${message}`));
  if (error) {
    console.error(chalk.red(error));
  }
}

/**
 * Log success with green color and timestamp
 */
export function logSuccess(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(chalk.gray(`[${timestamp}]`), chalk.green(`✅ ${message}`));
}

/**
 * Log step/section header with cyan color
 */
export function logHeader(message: string): void {
  console.log(chalk.cyan.bold(`\n${'='.repeat(60)}`));
  console.log(chalk.cyan.bold(`  ${message}`));
  console.log(chalk.cyan.bold(`${'='.repeat(60)}\n`));
}

/**
 * Log data field with label
 */
export function logField(label: string, value: string): void {
  console.log(chalk.gray(`   ${label}:`), chalk.white(value));
}
