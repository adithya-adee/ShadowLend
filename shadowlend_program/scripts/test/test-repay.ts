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
  logWarning, 
  logDivider,
  icons 
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { getMxeAccount } from "../utils/arcium";

/**
 * Test repay instruction
 */
async function testRepay() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Repay Instruction");

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
    if (!deployment || !deployment.programId || !deployment.poolAddress) {
      throw new Error("Deployment not found. Run initialize-pool first.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);

    // Derive user obligation PDA
    const [userObligation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_obligation"),
        wallet.publicKey.toBuffer(),
        poolPda.toBuffer(),
      ],
      programId
    );

    logEntry("User Obligation", userObligation.toBase58(), icons.link);

    // Check if user has debt
    const obligationAccount = await provider.connection.getAccountInfo(userObligation);
    if (!obligationAccount) {
      logError("User obligation not found. Borrow first.");
      process.exit(1);
    }

    // Test parameters
    const repayAmount = 100_000; // 0.1 token (assuming 6 decimals)
    const computationOffset = BigInt(Date.now());

    logSection("Repay Parameters");
    logEntry("Amount", repayAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);

    // Get MXE account
    const mxeAccount = getMxeAccount(programId);
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    logDivider();
    logWarning("Repay test execution pending implementation");
    logInfo("Required Steps:");
    console.log("   1. Verify user has debt to repay");
    console.log("   2. Ensure user has tokens for repayment");
    console.log("   3. Call repay instruction");
    console.log("   4. Wait for MPC computation");
    console.log("   5. Verify debt reduction");
    console.log("   6. Check token transfer to borrow vault");

    logDivider();
    logSuccess("Repay test structure validated");

  } catch (error) {
    logError("Repay test failed", error);
    process.exit(1);
  }
}

// Run the test
testRepay();
