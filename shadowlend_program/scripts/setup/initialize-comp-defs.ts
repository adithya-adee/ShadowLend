import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  createProvider,
  getNetworkConfig,
  log,
  logSuccess,
  logError,
} from "../utils/config";
import {
  createArciumClient,
  getMxeAccount,
  checkMxeInitialized,
  checkMxeKeysSet,
} from "../utils/arcium";
import { getWalletKeypair, loadDeployment, updateDeployment } from "../utils/deployment";

/**
 * Initialize Arcium computation definitions for all circuits
 */
async function initializeComputationDefinitions() {
  try {
    const config = getNetworkConfig();
    log(`Initializing computation definitions on ${config.name}...`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Using wallet: ${wallet.publicKey.toBase58()}`);

    // Create provider and Arcium client
    const provider = createProvider(wallet, config);
    const arciumClient = createArciumClient(provider);

    // Check MXE status
    log("Checking MXE status...");
    const mxeInitialized = await checkMxeInitialized(arciumClient);
    
    if (!mxeInitialized) {
      throw new Error("MXE not initialized. Please initialize MXE first.");
    }

    const mxeAccount = await getMxeAccount(arciumClient);
    log(`MXE Account: ${mxeAccount.toBase58()}`);

    const keysSet = await checkMxeKeysSet(arciumClient);
    if (!keysSet) {
      log("⚠️  MXE keys not set yet. DKG may still be in progress.");
      log("   Computation definitions can be initialized, but computations won't work until DKG completes.");
    } else {
      logSuccess("MXE keys are set!");
    }

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);

    // Circuit names
    const circuits = ["deposit", "withdraw", "borrow", "repay"];
    const computationDefinitions: Record<string, string> = {};

    log("\nInitializing computation definitions...");

    for (const circuitName of circuits) {
      try {
        log(`\n📝 Processing circuit: ${circuitName}`);

        // Initialize computation definition using Arcium client
        // Note: The actual implementation depends on Arcium SDK version
        // This is a placeholder - adjust based on your Arcium SDK
        const compDefTx = await arciumClient.initializeComputationDefinition({
          circuitName,
          programId,
        });

        log(`   Transaction: ${compDefTx}`);
        await provider.connection.confirmTransaction(compDefTx, "confirmed");

        // Get computation definition address
        const compDefAddress = arciumClient.getComputationDefinitionAddress(
          circuitName,
          programId
        );

        computationDefinitions[circuitName] = compDefAddress.toBase58();
        logSuccess(`   ${circuitName} computation definition initialized`);
      } catch (error: any) {
        if (error.message?.includes("already in use")) {
          log(`   ℹ️  ${circuitName} computation definition already exists`);
          const compDefAddress = arciumClient.getComputationDefinitionAddress(
            circuitName,
            programId
          );
          computationDefinitions[circuitName] = compDefAddress.toBase58();
        } else {
          throw error;
        }
      }
    }

    // Update deployment state
    updateDeployment({
      mxeAccount: mxeAccount.toBase58(),
      computationDefinitions,
    });

    logSuccess("\n✅ All computation definitions initialized!");
    log("\nComputation Definitions:");
    for (const [name, address] of Object.entries(computationDefinitions)) {
      log(`  ${name}: ${address}`);
    }
  } catch (error) {
    logError("Failed to initialize computation definitions", error);
    process.exit(1);
  }
}

// Run the script
initializeComputationDefinitions();
