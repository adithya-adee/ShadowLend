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
 * Test withdraw instruction
 */
async function testWithdraw() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Withdraw Instruction");

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

    // Check if user has collateral
    const obligationAccount = await provider.connection.getAccountInfo(userObligation);
    if (!obligationAccount) {
      logError("User obligation not found. Deposit collateral first.");
      process.exit(1);
    }

    // Test parameters
    const withdrawAmount = 200_000; // 0.2 token (assuming 6 decimals)
    const computationOffset = BigInt(Date.now());

    logSection("Withdraw Parameters");
    logEntry("Amount", withdrawAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);

    // Get MXE account
    const mxeAccount = getMxeAccount(programId);
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    logDivider();
    logWarning("Withdraw test execution pending implementation");
    logInfo("Required Steps:");
    console.log("   1. Verify user has sufficient collateral");
    console.log("   2. Call withdraw instruction");
    console.log("   3. Wait for MPC health check");
    console.log("   4. Verify approval/rejection");
    console.log("   5. Check token transfer (if approved)");
    console.log("   6. Verify health factor maintained");

    logDivider();
    logSuccess("Withdraw test structure validated");

  } catch (error) {
    logError("Withdraw test failed", error);
    process.exit(1);
  }
}

// Run the test
testWithdraw();
