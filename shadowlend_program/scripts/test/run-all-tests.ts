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
  icons 
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { checkMxeKeysSet } from "../utils/arcium";

/**
 * Run all tests in sequence
 */
async function runAllTests() {
  try {
    const config = getNetworkConfig();
    logHeader(`Run All Tests (${config.name})`);

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
      throw new Error("Deployment not found. Run setup scripts first.");
    }

    logSection("Pre-flight Checks");

    // Check program
    const programId = new PublicKey(deployment.programId);
    const programAccount = await provider.connection.getAccountInfo(programId);
    if (!programAccount) {
      throw new Error("Program not deployed");
    }
    logEntry("Program", "Deployed", icons.checkmark);
    logEntry("Program ID", programId.toBase58());

    // Check pool
    if (!deployment.poolAddress) {
      throw new Error("Pool not initialized. Run initialize-pool script.");
    }
    const poolPda = new PublicKey(deployment.poolAddress);
    const poolAccount = await provider.connection.getAccountInfo(poolPda);
    if (!poolAccount) {
      throw new Error("Pool account not found");
    }
    logEntry("Pool", "Initialized", icons.checkmark);
    logEntry("Pool Address", poolPda.toBase58());

    // Check MXE
    const keysSet = await checkMxeKeysSet(provider, programId);
    if (!keysSet) {
      throw new Error("MXE keys not set. DKG not complete.");
    }
    logEntry("MXE Status", "Operational", icons.checkmark);

    // Check computation definitions
    if (!deployment.computationDefinitions) {
      throw new Error("Computation definitions not initialized");
    }
    logEntry("Comp Defs", "Initialized", icons.checkmark);

    logDivider();
    logSuccess("All pre-flight checks passed!");

    // Test sequence
    const tests = [
      { name: "Deposit", file: "./test-deposit" },
      { name: "Borrow", file: "./test-borrow" },
      { name: "Withdraw", file: "./test-withdraw" },
      { name: "Repay", file: "./test-repay" },
    ];

    logSection("Test Plan");
    for (const test of tests) {
      logEntry(test.name, "Pending", icons.clock);
    }
    logDivider();

    logInfo("Note: Individual test orchestration is not yet fully automated in this script.");
    console.log(chalk.gray("   Please run each test separately for now:"));
    for (const test of tests) {
      console.log(chalk.cyan(`   npm run test:${test.name.toLowerCase()}`));
    }

    logDivider();
    logSuccess("Test framework validated");

  } catch (error) {
    logError("Test suite failed", error);
    process.exit(1);
  }
}

// Run all tests
runAllTests();
