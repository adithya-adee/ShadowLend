import { Wallet } from "@coral-xyz/anchor";
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
import { getWalletKeypair } from "../utils/deployment";

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

    // Create provider and Arcium client
    const provider = createProvider(wallet, config);
    const arciumClient = createArciumClient(provider);

    // Check MXE initialization
    log("🔍 Checking MXE initialization...");
    const mxeInitialized = await checkMxeInitialized(arciumClient);

    if (!mxeInitialized) {
      logError("MXE is NOT initialized");
      log("\n💡 To initialize MXE:");
      log("   1. Ensure Arcium network is running");
      log("   2. Run: arcium mxe initialize");
      process.exit(1);
    }

    const mxeAccount = await getMxeAccount(arciumClient);
    logSuccess("MXE is initialized");
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    // Check MXE keys (DKG status)
    log("\n🔍 Checking MXE keys (DKG status)...");
    const keysSet = await checkMxeKeysSet(arciumClient);

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

    // Fetch and display MXE data
    try {
      const mxeData = await arciumClient.program.account.mxe.fetch(mxeAccount);
      log("\n📊 MXE Details:");
      log(`   Cluster Offset: ${config.arciumClusterOffset}`);
      log(`   Public Key: ${Buffer.from((mxeData as any).publicKey).toString("hex").substring(0, 32)}...`);
    } catch (error) {
      log("\n⚠️  Could not fetch MXE details (this is normal for some SDK versions)");
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
