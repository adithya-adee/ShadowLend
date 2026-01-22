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

    // Check if pool already exists
    const poolAccount = await provider.connection.getAccountInfo(poolPda);
    if (poolAccount) {
      logSuccess("Pool already initialized!");
      log(`Pool address: ${poolPda.toBase58()}`);
      return;
    }

    // Derive vault PDAs
    const [collateralVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), poolPda.toBuffer()],
      programId
    );

    const [borrowVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("borrow_vault"), poolPda.toBuffer()],
      programId
    );

    log(`Collateral Vault: ${collateralVault.toBase58()}`);
    log(`Borrow Vault: ${borrowVault.toBase58()}`);

    // Pool configuration
    const ltvBps = 7500; // 75% LTV
    const liquidationThreshold = 8000; // 80% liquidation threshold

    log(`Initializing pool with LTV: ${ltvBps / 100}%, Liquidation: ${liquidationThreshold / 100}%`);

    // Initialize pool
    const tx = await program.methods
      .initializePool(ltvBps, liquidationThreshold)
      .accounts({
        pool: poolPda,
        collateralVault,
        borrowVault,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .rpc();

    log(`Transaction signature: ${tx}`);
    await provider.connection.confirmTransaction(tx, "confirmed");

    // Update deployment state
    updateDeployment({
      poolAddress: poolPda.toBase58(),
      collateralVault: collateralVault.toBase58(),
      borrowVault: borrowVault.toBase58(),
    });

    logSuccess("Pool initialized successfully!");
    log(`Pool: ${poolPda.toBase58()}`);
    log(`Collateral Vault: ${collateralVault.toBase58()}`);
    log(`Borrow Vault: ${borrowVault.toBase58()}`);
  } catch (error) {
    logError("Failed to initialize pool", error);
    process.exit(1);
  }
}

// Run the script
initializePool();
