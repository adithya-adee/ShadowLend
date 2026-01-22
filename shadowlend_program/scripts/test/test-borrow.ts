import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createProvider, getNetworkConfig, log, logSuccess, logError } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { createArciumClient } from "../utils/arcium";

/**
 * Test borrow instruction
 */
async function testBorrow() {
  try {
    const config = getNetworkConfig();
    log(`Testing borrow on ${config.name}...`);

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

    // Check if user has deposited collateral
    const obligationAccount = await provider.connection.getAccountInfo(userObligation);
    if (!obligationAccount) {
      logError("User obligation not found. Deposit collateral first.");
      process.exit(1);
    }

    // Test parameters
    const borrowAmount = 500_000; // 0.5 token (assuming 6 decimals)
    const computationOffset = BigInt(Date.now());

    log(`\n📝 Borrow Parameters:`);
    log(`   Amount: ${borrowAmount}`);
    log(`   Computation Offset: ${computationOffset}`);

    // Get MXE account
    const mxeAccount = await arciumClient.getMxeAccount();
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    log("\n⚠️  Borrow test implementation pending");
    log("   Required steps:");
    log("   1. Verify user has sufficient collateral");
    log("   2. Call borrow instruction");
    log("   3. Wait for MPC health check");
    log("   4. Verify approval/rejection");
    log("   5. Check token transfer (if approved)");

    logSuccess("\n✅ Borrow test structure validated");
  } catch (error) {
    logError("Borrow test failed", error);
    process.exit(1);
  }
}

// Run the test
testBorrow();
