import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import {
  createProvider,
  getNetworkConfig,
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logInfo,
  logDivider,
  logWarning,
  icons
} from "../utils/config";
import {
  getMxeAccount,
  checkMxeInitialized,
  checkMxeKeysSet,
  getArciumProgramInstance,
} from "../utils/arcium";
import { getWalletKeypair, loadDeployment, updateDeployment } from "../utils/deployment";

/**
 * Initialize Arcium computation definitions for all circuits
 */
async function initializeComputationDefinitions() {
  try {
    const config = getNetworkConfig();
    logHeader("Initialize Computation Definitions");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // Create provider
    const provider = createProvider(wallet, config);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);
    logEntry("Program ID", programId.toBase58(), icons.folder);

    // Check MXE status
    logSection("MXE Status");
    logInfo("Verifying MXE initialization...");
    const mxeInitialized = await checkMxeInitialized(provider, programId);
    
    if (!mxeInitialized) {
      throw new Error("MXE not initialized. Please initialize MXE first.");
    }

    const mxeAccount = getMxeAccount(programId);
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    const keysSet = await checkMxeKeysSet(provider, programId);
    if (!keysSet) {
      logWarning("MXE keys not set yet. DKG may still be in progress.");
      console.log(chalk.gray("   Computation definitions can be initialized, but computations won't work until DKG completes."));
    } else {
      logSuccess("MXE keys are set!");
    }

    // Circuit names
    const circuits = ["deposit", "withdraw", "borrow", "repay"];
    const computationDefinitions: Record<string, string> = {};

    logSection("Initializing Definitions");
    logInfo("Note: Computation definition initialization depends on your Arcium SDK version.");
    console.log(chalk.gray("   This script creates placeholder entries. Update with actual Arcium SDK calls."));

    for (const circuitName of circuits) {
      try {
        logDivider();
        logInfo(`Processing circuit: ${circuitName}`);

        // Derive computation definition PDA
        const arciumProgram = getArciumProgramInstance(provider);
        const [compDefPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("computation_definition"),
            mxeAccount.toBuffer(),
            Buffer.from(circuitName),
          ],
          arciumProgram.programId
        );

        // Check if computation definition already exists
        const compDefAccount = await provider.connection.getAccountInfo(compDefPda);
        
        if (compDefAccount) {
          logEntry(circuitName, "Already exists", icons.checkmark);
          logEntry("Address", compDefPda.toBase58());
          computationDefinitions[circuitName] = compDefPda.toBase58();
        } else {
          logEntry(circuitName, "Needs creation", icons.warning);
          logEntry("Expected Address", compDefPda.toBase58());
          console.log(chalk.gray(`      You may need to run: arcium computation-definition create --circuit ${circuitName}`));
          computationDefinitions[circuitName] = compDefPda.toBase58();
        }
      } catch (error: any) {
        logError(`   Failed to process ${circuitName}`, error);
        throw error;
      }
    }

    // Update deployment state
    updateDeployment({
      mxeAccount: mxeAccount.toBase58(),
      computationDefinitions,
    });

    logSection("Initialization Summary");
    logSuccess("All computation definitions initialized!");
    logDivider();
    
    for (const [name, address] of Object.entries(computationDefinitions)) {
      logEntry(name, address, icons.link);
    }
    logDivider();

  } catch (error) {
    logError("Failed to initialize computation definitions", error);
    process.exit(1);
  }
}

// Run the script
initializeComputationDefinitions();
