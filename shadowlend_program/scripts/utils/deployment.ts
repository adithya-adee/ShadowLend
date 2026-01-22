import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Deployment state interface
 */
export interface DeploymentState {
  network: string;
  programId: string;
  poolAddress?: string;
  collateralVault?: string;
  borrowVault?: string;
  mxeAccount?: string;
  computationDefinitions?: {
    deposit?: string;
    withdraw?: string;
    borrow?: string;
    repay?: string;
  };
  timestamp: string;
}

const DEPLOYMENT_FILE = path.join(__dirname, "../../deployment.json");

/**
 * Load deployment state from file
 */
export function loadDeployment(): DeploymentState | null {
  try {
    if (fs.existsSync(DEPLOYMENT_FILE)) {
      const data = fs.readFileSync(DEPLOYMENT_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("Failed to load deployment state:", error);
  }
  return null;
}

/**
 * Save deployment state to file
 */
export function saveDeployment(state: DeploymentState): void {
  try {
    fs.writeFileSync(
      DEPLOYMENT_FILE,
      JSON.stringify(state, null, 2),
      "utf-8"
    );
    console.log("✅ Deployment state saved to deployment.json");
  } catch (error) {
    console.error("Failed to save deployment state:", error);
    throw error;
  }
}

/**
 * Update deployment state with partial data
 */
export function updateDeployment(
  updates: Partial<DeploymentState>
): DeploymentState {
  const current = loadDeployment() || {
    network: "devnet",
    programId: "",
    timestamp: new Date().toISOString(),
  };
  
  const updated = {
    ...current,
    ...updates,
    timestamp: new Date().toISOString(),
  };
  
  saveDeployment(updated);
  return updated;
}

/**
 * Load keypair from file
 */
export function loadKeypair(filepath: string): Keypair {
  try {
    const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (error) {
    throw new Error(`Failed to load keypair from ${filepath}: ${error}`);
  }
}

/**
 * Get wallet keypair from environment or default location
 */
export function getWalletKeypair(): Keypair {
  const walletPath =
    process.env.WALLET_PATH ||
    path.join(process.env.HOME || "", ".config/solana/id.json");
  
  return loadKeypair(walletPath);
}
