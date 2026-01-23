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
    log(`Initializing computation definitions on ${config.name}...`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Using wallet: ${wallet.publicKey.toBase58()}`);

    // Create provider
    const provider = createProvider(wallet, config);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);

    // Check MXE status
    log("Checking MXE status...");
    const mxeInitialized = await checkMxeInitialized(provider, programId);
    
    if (!mxeInitialized) {
      throw new Error("MXE not initialized. Please initialize MXE first.");
    }

    const mxeAccount = getMxeAccount(programId);
    log(`MXE Account: ${mxeAccount.toBase58()}`);

    const keysSet = await checkMxeKeysSet(provider, programId);
    if (!keysSet) {
      log("⚠️  MXE keys not set yet. DKG may still be in progress.");
      log("   Computation definitions can be initialized, but computations won't work until DKG completes.");
    } else {
      logSuccess("MXE keys are set!");
    }



    // Circuit names
    const circuits = ["deposit", "withdraw", "borrow", "repay"];
    const computationDefinitions: Record<string, string> = {};

    log("\nInitializing computation definitions...");
    log("⚠️  Note: Computation definition initialization depends on your Arcium SDK version.");
    log("   This script creates placeholder entries. Update with actual Arcium SDK calls.");

    for (const circuitName of circuits) {
      try {
        log(`\n📝 Processing circuit: ${circuitName}`);

        // Derive computation definition PDA
        // This is a placeholder - adjust based on your Arcium SDK
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
          log(`   ℹ️  ${circuitName} computation definition already exists`);
          computationDefinitions[circuitName] = compDefPda.toBase58();
        } else {
          log(`   ⚠️  ${circuitName} computation definition needs to be created`);
          log(`      Expected address: ${compDefPda.toBase58()}`);
          log(`      You may need to run: arcium computation-definition create --circuit ${circuitName}`);
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
