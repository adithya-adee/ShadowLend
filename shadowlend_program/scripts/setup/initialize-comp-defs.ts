import { Wallet, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
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
  icons,
  loadProgram,
} from "../utils/config";
import {
  getMxeAccount,
  checkMxeInitialized,
  checkMxeKeysSet,
  getArciumProgramInstance,
} from "../utils/arcium";
import { getWalletKeypair, loadDeployment, updateDeployment } from "../utils/deployment";
import { getCompDefAccOffset, getCompDefAccAddress, uploadCircuit, buildFinalizeCompDefTx } from "@arcium-hq/client";

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
      throw new Error("Program ID not found. Check .env or deployment.json");
    }
    const programId = new PublicKey(deployment.programId);
    logEntry("Program ID", programId.toBase58(), icons.folder);

    // Load Program
    const idl = require("../../target/idl/shadowlend_program.json");
    const program = await loadProgram(provider, programId, idl);

    // Check MXE status
    logSection("MXE Status");
    logInfo("Verifying MXE initialization...");
    const mxeInitialized = await checkMxeInitialized(provider, programId);
    
    if (!mxeInitialized) {
      throw new Error("MXE not initialized. Please initialize MXE first.");
    }

    const mxeAccount = getMxeAccount(programId);
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    // Circuit configuration
    const circuits = [
      { name: "deposit", method: "initDepositCompDef" },
      { name: "withdraw", method: "initWithdrawCompDef" },
      { name: "borrow", method: "initBorrowCompDef" },
      { name: "repay", method: "initRepayCompDef" },
    ];
    
    const computationDefinitions: Record<string, string> = {};

    logSection("Initializing Definitions");
    const arciumProgram = getArciumProgramInstance(provider);

    for (const circuit of circuits) {
      const circuitName = circuit.name;
      try {
        logDivider();
        logInfo(`Processing circuit: ${circuitName}`);

        const compDefOffsetBytes = getCompDefAccOffset(circuitName);
        const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();

        const compDefPda = getCompDefAccAddress(
          programId,
          compDefOffset,
        );

        // Check if computation definition already exists
        const compDefAccount = await provider.connection.getAccountInfo(compDefPda);
        
        if (compDefAccount) {
          logEntry(circuitName, "Already exists", icons.checkmark);
          logEntry("Address", compDefPda.toBase58());
          computationDefinitions[circuitName] = compDefPda.toBase58();
        } else {
          logEntry(circuitName, "Creating...", icons.rocket);
          logEntry("Expected Address", compDefPda.toBase58());
          
          // Call the specific instruction
          const method = (program.methods as any)[circuit.method];
          if (!method) {
             throw new Error(`Method ${circuit.method} not found in program`);
          }

          const tx = await method()
            .accounts({
              authority: wallet.publicKey,
              mxeAccount: mxeAccount,
              compDefAccount: compDefPda,
              arciumProgram: arciumProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
            
          logSuccess(`Created ${circuitName} definition`);
          logEntry("Transaction", tx, icons.link);
          await provider.connection.confirmTransaction(tx, "confirmed");
        }

        // --- Upload and Finalize Circuit ---
        // This ensures the circuit code is available on the Arcium network
        
        logInfo(`Uploading and finalizing circuit for ${circuitName}...`);

        const buildDir = path.join(__dirname, "../../build");
        const arcisPath = path.join(buildDir, `${circuitName}.arcis`);

        if (!fs.existsSync(arcisPath)) {
            throw new Error(`Compiled circuit file not found for ${circuitName}. Ensure 'build/${circuitName}.arcis' exists.`);
        }

        const circuitData = fs.readFileSync(arcisPath);

        // Upload circuit
        // Note: uploadCircuit handles checking if it's already uploaded for this nonce/offset
        try {
          await uploadCircuit(
              provider,
              circuitName,
              programId, // Use ShadowLend Program ID as the MXE User/Requester context
              circuitData,
              true // logging
          );
          logSuccess(`Circuit uploaded.`);
        } catch (e: any) {
             if (e.message && e.message.includes("already")) {
                 logInfo("Circuit upload skipped (already uploaded).");
             } else {
                 logWarning(`Upload step message: ${e.message}`);
             }
        }

        // Finalize computation definition
        // This marks the definition as ready for use
        try {
            // We manually call the instruction because the SDK helper might not handle
            // the specific Program ID context correctly for the PDA derivation.
            
            // Note: The 'mxeProgram' argument in finalizeComputationDefinition usually refers to the 
            // program that owns the computation definition (the Requester), which is ShadowLend.
            // We pass programId (ShadowLend) instead of arciumProgram.programId.
            const tx = await arciumProgram.methods
              .finalizeComputationDefinition(compDefOffset, programId)
              .accounts({
                signer: wallet.publicKey,
                // compDefAcc, compDefRaw should be derived by Anchor from args
              })
              .rpc();

            logSuccess(`Finalized ${circuitName}`);
            logEntry("Finalize Tx", tx, icons.rocket);
            await provider.connection.confirmTransaction(tx, "confirmed");

        } catch (e: any) {
            if (e.message && (e.message.includes("already finalized") || e.message.includes("Definition already completed"))) {
                logEntry("Status", "Already Finalized", icons.checkmark);
            } else {
                 console.log(chalk.yellow(`   Could not verify finalization (might be already done): ${e.message}`));
            }
        }

        computationDefinitions[circuitName] = compDefPda.toBase58();
      } catch (error: any) {
        logError(`   Failed to process ${circuitName}`, error);
        // Continue with other circuits but log error
      }
    }

    // Update deployment state
    updateDeployment({
      mxeAccount: mxeAccount.toBase58(),
      computationDefinitions,
    });

    logSection("Initialization Summary");
    logSuccess("Computation definitions processing complete!");
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
