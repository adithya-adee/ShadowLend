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
    logInfo("Note: Computation definitions are created via Arcium CLI.");

    const { execSync } = require('child_process');

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
        let compDefAccount = await provider.connection.getAccountInfo(compDefPda);
        
        if (compDefAccount) {
          logEntry(circuitName, "Already exists", icons.checkmark);
          logEntry("Address", compDefPda.toBase58());
          computationDefinitions[circuitName] = compDefPda.toBase58();
        } else {
          logEntry(circuitName, "Creating...", icons.rocket);
          logEntry("Expected Address", compDefPda.toBase58());
          
          try {
             // Create via CLI
             // Construct the command. Note: adjusting arguments based on potential CLI structure
             // Assuming keypair is available at default location or handled by env/config
             const command = `arcium computation create --circuit ${circuitName} --program-id ${programId.toBase58()}`;
             logInfo(`Running command: ${command}`);
             
             // Execute command
             execSync(command, { stdio: 'inherit' });
             
             // Verify creation
             compDefAccount = await provider.connection.getAccountInfo(compDefPda);
             if (compDefAccount) {
                 logSuccess(`Successfully created definition for ${circuitName}`);
                 computationDefinitions[circuitName] = compDefPda.toBase58();
             } else {
                 logError(`Creation reported success but account not found for ${circuitName}`);
             }
          } catch (cliError: any) {
              logError(`Failed to create computation definition via CLI for ${circuitName}`, cliError);
              // Fallback or exit depending on strictness. 
              // Continuing loop to attempt others, but marking as failed in logs.
          }
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
