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
  icons,
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
    logHeader("MXE Status Check");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Cluster Offset", config.arciumClusterOffset.toString(), icons.info);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // Create provider
    const provider = createProvider(wallet, config);
    
    // Load deployment to get program ID
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found. Check .env or deployment.json");
    }
    
    const programId = new PublicKey(deployment.programId);
    logEntry("Program ID", programId.toBase58(), icons.folder);

    // Check MXE initialization
    logSection("Initialization Status");
    logInfo("Checking MXE initialization...");
    
    // Check if the account exists first to avoid errors
    const mxeInitialized = await checkMxeInitialized(provider, programId);

    if (!mxeInitialized) {
      logError("MXE is NOT initialized");
      logDivider();
      logInfo(" To initialize MXE:");
      console.log("     1. Ensure Arcium network is running");
      console.log("     2. Run: arcium mxe initialize");
      process.exit(1);
    }

    const mxeAccount = getMxeAccount(programId);
    logSuccess("MXE is initialized");
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    // Check MXE keys (DKG status)
    logSection("Key Generation (DKG) Status");
    logInfo("Checking MXE keys...");
    
    // We can assume checkMxeKeysSet from utils handles the fetching of keys safely 
    // but verify it doesn't throw if keys are missing (it swallows errors)
    const keysSet = await checkMxeKeysSet(provider, programId, 1, 0);

    if (!keysSet) {
      logError("MXE keys are NOT set (DKG not complete)");
      logDivider();
      logInfo(" DKG is still in progress or failed.");
      console.log("     This means MPC computations will NOT work yet.");
      logDivider();
      logInfo(" To fix:");
      console.log("     - Wait a few minutes and check again");
      console.log("     - Run: arcium mxe heartbeat"); 
      process.exit(1);
    }

    logSuccess("MXE keys are set (DKG complete)");

    // Display MXE details
    logSection("MXE Details Summary");
    logEntry("Cluster Offset", config.arciumClusterOffset.toString(), icons.info);
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);
    logEntry("Program ID", programId.toBase58(), icons.folder);

    // Fetch account data to show size
    try {
      const accountInfo = await provider.connection.getAccountInfo(mxeAccount);
      if (accountInfo) {
        logEntry("Account Data Size", `${accountInfo.data.length} bytes`, icons.folder);
      }
    } catch (error) {
       // Ignore
    }

    logDivider();
    logSuccess("MXE is fully operational!");
    logInfo("Next Steps:");
    console.log("   - Initialize computation definitions");
    console.log("   - Run MPC computations");
    console.log("   - Execute confidential transactions");
    logDivider();

  } catch (error) {
    logError("Failed to check MXE status", error);
    process.exit(1);
  }
}

// Run the script
checkMxe();
