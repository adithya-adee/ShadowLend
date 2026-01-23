import { Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createProvider,
  getNetworkConfig,
  loadProgram,
  log,
  logSuccess,
  logError,
} from "../utils/config";
import {
  getWalletKeypair,
  loadDeployment,
  updateDeployment,
} from "../utils/deployment";
import * as idl from "../../target/idl/shadowlend_program.json";

/**
 * Initialize the lending pool
 */
async function initializePool() {
  try {
    const config = getNetworkConfig();
    log(`Initializing pool on ${config.name}...`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Using wallet: ${wallet.publicKey.toBase58()}`);

    // Create provider and load program
    const provider = createProvider(wallet, config);
    const deployment = loadDeployment();
    
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);
    const program = await loadProgram(provider, programId, idl);

    // Derive pool PDA
    const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      programId
    );

    log(`Pool PDA: ${poolPda.toBase58()}`);

    // Pool configuration
    const ltvBps = 7500; // 75% LTV
    const liquidationThreshold = 8000; // 80% liquidation threshold

    // Token mints - using common devnet tokens
    // For production, these should be configurable
    const collateralMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // USDC devnet
    const borrowMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL

    log(`Collateral Mint (USDC): ${collateralMint.toBase58()}`);
    log(`Borrow Mint (SOL): ${borrowMint.toBase58()}`);
    log(`Initializing pool with LTV: ${ltvBps / 100}%, Liquidation: ${liquidationThreshold / 100}%`);

    // Initialize pool
    const tx = await program.methods
      .initializePool(ltvBps, liquidationThreshold)
      .accounts({
        authority: wallet.publicKey,
        pool: poolPda,
        collateralMint,
        borrowMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    log(`Transaction signature: ${tx}`);
    await provider.connection.confirmTransaction(tx, "confirmed");

    // Update deployment state
    updateDeployment({
      poolAddress: poolPda.toBase58(),
      collateralMint: collateralMint.toBase58(),
      borrowMint: borrowMint.toBase58(),
    });

    logSuccess("Pool initialized successfully!");
    log(`Pool: ${poolPda.toBase58()}`);
    log(`Collateral Mint: ${collateralMint.toBase58()}`);
    log(`Borrow Mint: ${borrowMint.toBase58()}`);
  } catch (error) {
    logError("Failed to initialize pool", error);
    process.exit(1);
  }
}

// Run the script
initializePool();
