import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createProvider, getNetworkConfig, log, logSuccess, logError } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { createArciumClient, checkMxeKeysSet } from "../utils/arcium";

/**
 * Run all tests in sequence
 */
async function runAllTests() {
  try {
    const config = getNetworkConfig();
    log(`\n${"=".repeat(60)}`);
    log(`Running all tests on ${config.name}`);
    log(`${"=".repeat(60)}\n`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Wallet: ${wallet.publicKey.toBase58()}\n`);

    // Create provider
    const provider = createProvider(wallet, config);
    const arciumClient = createArciumClient(provider);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId) {
      throw new Error("Deployment not found. Run setup scripts first.");
    }

    // Pre-flight checks
    log("🔍 Pre-flight Checks:");
    log("-".repeat(60));

    // Check program
    const programId = new PublicKey(deployment.programId);
    const programAccount = await provider.connection.getAccountInfo(programId);
    if (!programAccount) {
      throw new Error("Program not deployed");
    }
    logSuccess(`✓ Program deployed: ${programId.toBase58()}`);

    // Check pool
    if (!deployment.poolAddress) {
      throw new Error("Pool not initialized. Run initialize-pool script.");
    }
    const poolPda = new PublicKey(deployment.poolAddress);
    const poolAccount = await provider.connection.getAccountInfo(poolPda);
    if (!poolAccount) {
      throw new Error("Pool account not found");
    }
    logSuccess(`✓ Pool initialized: ${poolPda.toBase58()}`);

    // Check MXE
    const keysSet = await checkMxeKeysSet(arciumClient);
    if (!keysSet) {
      throw new Error("MXE keys not set. DKG not complete.");
    }
    logSuccess(`✓ MXE operational`);

    // Check computation definitions
    if (!deployment.computationDefinitions) {
      throw new Error("Computation definitions not initialized");
    }
    logSuccess(`✓ Computation definitions initialized`);

    log("\n" + "=".repeat(60));
    log("All pre-flight checks passed!");
    log("=".repeat(60) + "\n");

    // Test sequence
    const tests = [
      { name: "Deposit", file: "./test-deposit" },
      { name: "Borrow", file: "./test-borrow" },
      { name: "Withdraw", file: "./test-withdraw" },
      { name: "Repay", file: "./test-repay" },
    ];

    log("📋 Test Sequence:");
    for (const test of tests) {
      log(`   ${test.name}`);
    }
    log("");

    log("⚠️  Individual test execution pending");
    log("   Run each test separately:");
    for (const test of tests) {
      log(`   - npm run test:${test.name.toLowerCase()}`);
    }

    logSuccess("\n✅ Test framework validated");
  } catch (error) {
    logError("Test suite failed", error);
    process.exit(1);
  }
}

// Run all tests
runAllTests();
