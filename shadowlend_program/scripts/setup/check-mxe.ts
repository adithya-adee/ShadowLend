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
} from "../utils/arcium";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";

/**
 * Check MXE initialization and key status
 */
async function checkMxe() {
  try {
    const config = getNetworkConfig();
    log(`Checking MXE status on ${config.name}...`);
    log(`Cluster offset: ${config.arciumClusterOffset}\n`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);

    // Create provider
    const provider = createProvider(wallet, config);
    
    // Load deployment to get program ID
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json. Please deploy the program first.");
    }
    
    const programId = new PublicKey(deployment.programId);

    // Check MXE initialization
    log("🔍 Checking MXE initialization...");
    const mxeInitialized = await checkMxeInitialized(provider, programId);

    if (!mxeInitialized) {
      logError("MXE is NOT initialized");
      log("\n💡 To initialize MXE:");
      log("   1. Ensure Arcium network is running");
      log("   2. Run: arcium mxe initialize");
      process.exit(1);
    }

    const mxeAccount = getMxeAccount(programId);
    logSuccess("MXE is initialized");
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    // Check MXE keys (DKG status)
    log("\n🔍 Checking MXE keys (DKG status)...");
    const keysSet = await checkMxeKeysSet(provider, programId);

    if (!keysSet) {
      logError("MXE keys are NOT set (DKG not complete)");
      log("\n⏳ DKG (Distributed Key Generation) is still in progress or failed.");
      log("   This means:");
      log("   - MPC computations will NOT work yet");
      log("   - You need to wait for DKG to complete");
      log("\n💡 To check DKG status:");
      log("   - Wait a few minutes and run this script again");
      log("   - Check Arcium cluster logs for DKG progress");
      process.exit(1);
    }

    logSuccess("MXE keys are set (DKG complete)");

    // Display MXE details
    log("\n📊 MXE Details:");
    log(`   Cluster Offset: ${config.arciumClusterOffset}`);
    log(`   MXE Account: ${mxeAccount.toBase58()}`);
    log(`   Program ID: ${programId.toBase58()}`);
    
    // Fetch account data to show size
    try {
      const accountInfo = await provider.connection.getAccountInfo(mxeAccount);
      if (accountInfo) {
        log(`   Account Data Size: ${accountInfo.data.length} bytes`);
      }
    } catch (error) {
      log("   Could not fetch account details");
    }

    logSuccess("\n✅ MXE is fully operational!");
    log("   You can now:");
    log("   - Initialize computation definitions");
    log("   - Run MPC computations");
    log("   - Execute confidential transactions");
  } catch (error) {
    logError("Failed to check MXE status", error);
    process.exit(1);
  }
}

// Run the script
checkMxe();
