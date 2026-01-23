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
 * Logging Utilities
 */
export const icons = {
  rocket: "🚀",
  key: "🔑",
  link: "🔗",
  folder: "📁",
  checkmark: "✔",
  cross: "✖",
  arrow: "→",
  dot: "•",
  sparkle: "✨",
  warning: "⚠",
  info: "🛈",
  clock: "⏱",
};

export function logHeader(title: string): void {
  console.log();
  console.log(
    chalk.magentaBright(`  ${icons.sparkle} `) +
      chalk.bold.white(title)
  );
  console.log(chalk.gray(`  ${"─".repeat(45)}`));
  console.log();
}

export function logSection(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(`  ${icons.dot} ${title}`));
  console.log(chalk.gray(`  ${"─".repeat(45)}`));
}

export function logEntry(label: string, value: string, icon?: string): void {
  const iconStr = icon !== undefined ? `${icon} ` : "   ";
  console.log(
    chalk.gray(`  ${iconStr}`) +
      chalk.white(`${label}: `) +
      chalk.yellowBright(value)
  );
}

export function logSuccess(message: string): void {
  console.log();
  console.log(
    chalk.greenBright(`  ${icons.checkmark} `) + chalk.green.bold(message)
  );
}

export function logError(message: string, error?: any): void {
  console.log();
  console.error(chalk.redBright(`  ${icons.cross} `) + chalk.red.bold(message));
  
  if (error) {
    if (error instanceof Error) {
        console.log(chalk.gray(`    ${error.message}`));
        if (error.stack) {
            console.log(chalk.gray(error.stack));
        }
    } else {
        console.log(chalk.gray(`    ${String(error)}`));
    }
  }
}

export function logWarning(message: string): void {
  console.log(
    chalk.yellowBright(`  ${icons.warning} `) + chalk.yellow(message)
  );
}

export function logInfo(message: string): void {
  console.log(chalk.blueBright(`  ${icons.info} `) + chalk.blue(message));
}

export function logDivider(): void {
  console.log();
}

// Legacy support (to be deprecated or mapped)
export function log(message: string, ...args: any[]): void {
   console.log(chalk.gray(`  ${message}`), ...args);
}
export function logField(label: string, value: string): void {
    logEntry(label, value);
}
