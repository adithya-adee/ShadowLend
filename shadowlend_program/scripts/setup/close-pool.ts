import { Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createProvider,
  getNetworkConfig,
  loadProgram,
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logInfo,
  logDivider,
  icons
} from "../utils/config";
import {
  getWalletKeypair,
  loadDeployment,
  updateDeployment,
} from "../utils/deployment";
import * as idl from "../../target/idl/shadowlend_program.json";

/**
 * Close the lending pool
 */
async function closePool() {
  try {
    const config = getNetworkConfig();
    logHeader("Close Lending Pool");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // Create provider and load program
    const provider = createProvider(wallet, config);
    const deployment = loadDeployment();
    
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);
    
    logSection("Program Details");
    logEntry("Program ID", programId.toBase58(), icons.folder);

    const program = await loadProgram(provider, programId, idl);

    // Derive pool PDA
    const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      programId
    );

    logEntry("Pool PDA", poolPda.toBase58(), icons.link);

    // Check if pool exists
    const poolAccount = await provider.connection.getAccountInfo(poolPda);
    
    if (!poolAccount) {
      logEntry("Status", "Not Initialized", icons.warning);
      logInfo("Pool does not exist, nothing to close.");
    } else {
      logDivider();
      logInfo("Closing pool...");

      // Close pool
      const tx = await program.methods
        .closePool()
        .accounts({
          authority: wallet.publicKey,
          pool: poolPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      logSuccess("Pool closed successfully!");
      logEntry("Transaction", tx, icons.rocket);
      
      await provider.connection.confirmTransaction(tx, "confirmed");
      
      // Update deployment state to remove pool address
      updateDeployment({
        poolAddress: "",
      });

      logSection("Deployment Updated");
      logEntry("Pool Address", "Removed", icons.checkmark);
    }

    logDivider();

  } catch (error) {
    logError("Failed to close pool", error);
    process.exit(1);
  }
}

// Run the script
closePool();
