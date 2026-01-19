/**
 * ShadowLend Common Utilities
 * 
 * Shared helper functions for scripts.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  Connection, 
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import "dotenv/config";
import { PROGRAM_ID, NETWORKS } from "./config";

// ============================================================
// Logging Utilities
// ============================================================

export const icons = {
  rocket: "🚀",
  key: "🔑",
  link: "🔗",
  folder: "📁",
  file: "📄",
  checkmark: "✔",
  cross: "✖",
  arrow: "→",
  dot: "•",
  sparkle: "✨",
  warning: "⚠",
  info: "🌐",
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

export function logError(message: string): void {
  console.log();
  console.error(chalk.redBright(`  ${icons.cross} `) + chalk.red.bold(message));
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

// ============================================================
// File System
// ============================================================

/**
 * Loads a keypair from a JSON file.
 */
export function loadKeypair(filepath: string): Keypair {
  const resolvedPath = filepath.startsWith("~")
    ? filepath.replace("~", process.env.HOME!)
    : filepath;
  const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/**
 * Gets the default wallet path.
 */
export function getDefaultWalletPath(): string {
  return process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
}

/**
 * Loads the default wallet keypair.
 */
export function loadDefaultWallet(): Keypair {
  return loadKeypair(getDefaultWalletPath());
}

/**
 * Loads deployment info from deployment.json.
 */
export function loadDeployment(basePath: string = "."): any {
  const deploymentPath = path.join(basePath, "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`deployment.json not found at ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
}

/**
 * Saves deployment info to deployment.json.
 */
export function saveDeployment(basePath: string, info: Record<string, any>): void {
  const deploymentPath = path.join(basePath, "deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(info, null, 2));
  console.log(`📄 Deployment info saved to: ${deploymentPath}`);
}

// ============================================================
// Program Loading
// ============================================================

/**
 * Loads the program IDL from the target directory.
 */
export function loadIdl(basePath: string = "."): any {
  const idlPath = path.join(basePath, "target/idl/shadowlend_program.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' first.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

/**
 * Creates a program instance from the IDL.
 */
export function createProgram(
  provider: anchor.AnchorProvider,
  basePath: string = "."
): Program<any> {
  const idl = loadIdl(basePath);
  return new Program(idl, provider);
}

// ============================================================
// Provider Setup
// ============================================================

/**
 * Sets up the Anchor provider from environment.
 * Sets defaults for Devnet if not specified.
 */
export function setupProvider(): anchor.AnchorProvider {
  // Always force Devnet URL from config
  const rpcUrl = NETWORKS.devnet.rpcUrl;
  const connection = new Connection(rpcUrl, "confirmed");
  
  const walletPath = process.env.ANCHOR_WALLET || process.env.HOME + "/.config/solana/id.json";
  const wallet = new anchor.Wallet(loadKeypair(walletPath));

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  
  anchor.setProvider(provider);
  return provider;
}

/**
 * Creates a provider for a specific network.
 */
export function createProvider(
  network: "devnet" | "localnet",
  wallet: Keypair
): anchor.AnchorProvider {
  const config = NETWORKS[network];
  const connection = new Connection(config.rpcUrl, "confirmed");
  const walletAdapter = new anchor.Wallet(wallet);
  return new anchor.AnchorProvider(connection, walletAdapter, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

// ============================================================
// Network Utilities
// ============================================================

/**
 * Detects the current network from genesis hash.
 */
export async function detectNetwork(connection: Connection): Promise<"devnet" | "localnet" | "unknown"> {
  try {
    const genesisHash = await connection.getGenesisHash();
    if (genesisHash === NETWORKS.devnet.genesisHash) {
      return "devnet";
    }
    return "localnet";
  } catch {
    return "unknown";
  }
}

/**
 * Checks and displays wallet balance.
 */
export async function checkBalance(
  connection: Connection,
  pubkey: PublicKey,
  requiredSol: number = 0.1
): Promise<number> {
  const balance = await connection.getBalance(pubkey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  
  console.log(`💳 Balance: ${solBalance.toFixed(4)} SOL`);
  
  if (solBalance < requiredSol) {
    throw new Error(
      `Insufficient balance. Need at least ${requiredSol} SOL.\n` +
      `Run: solana airdrop ${requiredSol * 2} --url devnet`
    );
  }
  
  return solBalance;
}

/**
 * Waits for a transaction to be confirmed.
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: "confirmed" | "finalized" = "confirmed"
): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );
}

// ============================================================
// Formatting
// ============================================================

/**
 * Formats a public key for display.
 */
export function formatPubkey(pubkey: PublicKey, length: number = 8): string {
  const str = pubkey.toBase58();
  return str.length > length * 2 + 3
    ? `${str.slice(0, length)}...${str.slice(-length)}`
    : str;
}

/**
 * Formats a transaction signature for display.
 */
export function formatSignature(signature: string, length: number = 16): string {
  return signature.slice(0, length) + "...";
}

/**
 * Prints a section header.
 */
export function printHeader(title: string): void {
  console.log("\n" + "═".repeat(60));
  console.log(`       ${title}`);
  console.log("═".repeat(60));
}

/**
 * Prints a section separator.
 */
export function printSeparator(title: string): void {
  console.log("\n" + "-".repeat(40));
  console.log(title);
  console.log("-".repeat(40));
}

// ============================================================
// Error Handling
// ============================================================

/**
 * Checks if an error indicates the account already exists.
 */
export function isAlreadyInitializedError(error: any): boolean {
  const message = error?.message || "";
  const logs = error?.logs || [];
  
  return (
    message.includes("already in use") ||
    logs.some((l: string) => l.includes("already in use"))
  );
}

/**
 * Extracts error code from Anchor error.
 */
export function getAnchorErrorCode(error: any): number | null {
  if (error?.error?.errorCode?.number) {
    return error.error.errorCode.number;
  }
  return null;
}

/**
 * Logs the last N lines from transaction logs.
 */
export function logTransactionError(error: any, lines: number = 15): void {
  console.error("Transaction failed:", error.message);
  if (error.logs) {
    console.error(`Last ${lines} logs:`);
    error.logs.slice(-lines).forEach((log: string) => {
      console.error(`  ${log}`);
    });
  }
}

// ============================================================
// Timing
// ============================================================

/**
 * Sleeps for the specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}
