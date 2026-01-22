import { Wallet } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createProvider, getNetworkConfig, log, logSuccess, logError } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { createArciumClient } from "../utils/arcium";
import * as idl from "../../target/idl/shadowlend_program.json";

/**
 * Test deposit instruction
 */
async function testDeposit() {
  try {
    const config = getNetworkConfig();
    log(`Testing deposit on ${config.name}...`);

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

    // Test parameters
    const depositAmount = 1_000_000; // 1 token (assuming 6 decimals)
    const computationOffset = BigInt(Date.now());

    // Generate encryption parameters
    const userKeypair = Keypair.generate();
    const userPubkey = Array.from(userKeypair.publicKey.toBytes()).slice(0, 32);
    const userNonce = BigInt(Date.now());

    log(`\n📝 Deposit Parameters:`);
    log(`   Amount: ${depositAmount}`);
    log(`   Computation Offset: ${computationOffset}`);

    // Get MXE account
    const mxeAccount = await arciumClient.getMxeAccount();
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    // TODO: Implement actual deposit transaction
    // This requires:
    // 1. Token account setup
    // 2. Proper account derivation
    // 3. Transaction construction with Arcium integration

    log("\n⚠️  Deposit test implementation pending");
    log("   Required steps:");
    log("   1. Create/get user token account");
    log("   2. Mint test tokens (if needed)");
    log("   3. Call deposit instruction");
    log("   4. Wait for MPC computation");
    log("   5. Verify callback execution");

    logSuccess("\n✅ Deposit test structure validated");
  } catch (error) {
    logError("Deposit test failed", error);
    process.exit(1);
  }
}

// Run the test
testDeposit();
