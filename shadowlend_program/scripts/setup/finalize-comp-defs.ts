
import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
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
  icons
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { 
  getCompDefAccOffset, 
  buildFinalizeCompDefTx
} from "@arcium-hq/client";

/**
 * Finalize Arcium computation definitions for all circuits
 * This sets the status to Completed, enabling computations.
 */
async function finalizeComputationDefinitions() {
  try {
    const config = getNetworkConfig();
    logHeader("Finalize Computation Definitions");

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

    // Circuit configuration
    const circuits = ["deposit", "withdraw", "borrow", "repay"];

    logSection("Finalizing Definitions");

    for (const circuitName of circuits) {
      try {
        logDivider();
        logInfo(`Finalizing circuit: ${circuitName}`);

        const compDefOffsetBytes = getCompDefAccOffset(circuitName);
        const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();

        // Finalize transaction
        const finalizeTx = await buildFinalizeCompDefTx(
            provider,
            compDefOffset,
            programId 
        );
        
        const txSig = await provider.sendAndConfirm(finalizeTx);
        logSuccess(`Finalized ${circuitName}`);
        logEntry("Transaction", txSig, icons.link);

      } catch (error: any) {
        // Check if error is "already finalized" or similar
        if (error.message && (error.message.includes("custom program error: 0x1") || error.message.includes("Constraint"))) {
             logEntry(circuitName, "Already finalized or failed constraints", icons.checkmark);
        } else {
             logError(`   Failed to finalize ${circuitName}`, error);
        }
      }
    }

    logSection("Finalization Summary");
    logSuccess("Finalization attempts complete!");
    logDivider();

  } catch (error) {
    logError("Failed to finalize computation definitions", error);
    process.exit(1);
  }
}

// Run the script
finalizeComputationDefinitions();
