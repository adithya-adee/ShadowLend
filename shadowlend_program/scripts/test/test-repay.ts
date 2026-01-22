import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createProvider, getNetworkConfig, log, logSuccess, logError } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { createArciumClient } from "../utils/arcium";

/**
 * Test repay instruction
 */
async function testRepay() {
  try {
    const config = getNetworkConfig();
    log(`Testing repay on ${config.name}...`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Using wallet: ${wallet.publicKey.toBase58()}`);

    // Create provider
    const provider = createProvider(wallet, config);
    const arciumClient = createArciumClient(provider);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId || !deployment.poolAddress) {
      throw new Error("Deployment not found. Run initialize-pool first.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);

    log(`Program ID: ${programId.toBase58()}`);
    log(`Pool: ${poolPda.toBase58()}`);

    // Derive user obligation PDA
    const [userObligation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_obligation"),
        wallet.publicKey.toBuffer(),
        poolPda.toBuffer(),
      ],
      programId
    );

    log(`User Obligation: ${userObligation.toBase58()}`);

    // Check if user has debt
    const obligationAccount = await provider.connection.getAccountInfo(userObligation);
    if (!obligationAccount) {
      logError("User obligation not found. Borrow first.");
      process.exit(1);
    }

    // Test parameters
    const repayAmount = 100_000; // 0.1 token (assuming 6 decimals)
    const computationOffset = BigInt(Date.now());

    log(`\n📝 Repay Parameters:`);
    log(`   Amount: ${repayAmount}`);
    log(`   Computation Offset: ${computationOffset}`);

    // Get MXE account
    const mxeAccount = await arciumClient.getMxeAccount();
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    log("\n⚠️  Repay test implementation pending");
    log("   Required steps:");
    log("   1. Verify user has debt to repay");
    log("   2. Ensure user has tokens for repayment");
    log("   3. Call repay instruction");
    log("   4. Wait for MPC computation");
    log("   5. Verify debt reduction");
    log("   6. Check token transfer to borrow vault");

    logSuccess("\n✅ Repay test structure validated");
  } catch (error) {
    logError("Repay test failed", error);
    process.exit(1);
  }
}

// Run the test
testRepay();
