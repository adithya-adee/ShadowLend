import { Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createProvider,
  getNetworkConfig,
  loadProgram,
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logInfo,
  logDivider,
  icons
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
    logHeader("Initialize Lending Pool");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // Create provider and load program
    const provider = createProvider(wallet, config);
    const deployment = loadDeployment();
    
    if (!deployment || !deployment.programId) {
      throw new Error("Program ID not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);
    
    logSection("Program Details");
    logEntry("Program ID", programId.toBase58(), icons.folder);

    const program = await loadProgram(provider, programId, idl);

    // Derive pool PDA
    const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_v2")],
      programId
    );

    logEntry("Pool PDA", poolPda.toBase58(), icons.link);

    // Pool configuration
    const ltvBps = 7500; // 75% LTV
    const liquidationThreshold = 8000; // 80% liquidation threshold

    // Token mints
    let collateralMint: PublicKey;
    let borrowMint: PublicKey;

    // Prefer ENV, then Deployment, then generic defaults
    if (process.env.COLLATERAL_MINT && process.env.BORROW_MINT) {
         collateralMint = new PublicKey(process.env.COLLATERAL_MINT);
         borrowMint = new PublicKey(process.env.BORROW_MINT);
         logInfo("Using mints from .env");
    } else if (deployment.collateralMint && deployment.borrowMint) {
        collateralMint = new PublicKey(deployment.collateralMint);
        borrowMint = new PublicKey(deployment.borrowMint);
        logInfo("Using mints from deployment.json");
    } else {
        collateralMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // USDC devnet
        borrowMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
        logInfo("Using default Devnet mints");
    }

    logSection("Pool Parameters");
    logEntry("Collateral Mint (USDC)", collateralMint.toBase58(), icons.key);
    logEntry("Borrow Mint (SOL)", borrowMint.toBase58(), icons.key);
    logEntry("LTV", `${ltvBps / 100}%`, icons.info);
    logEntry("Liquidation Threshold", `${liquidationThreshold / 100}%`, icons.warning);

    // Check if pool already exists
    const poolAccount = await provider.connection.getAccountInfo(poolPda);
    
    if (poolAccount) {

      const [collateralPda, collateralBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), poolPda.toBuffer()],
        programId
      );

      const [borrowPda, borrowBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("borrow_vault"), poolPda.toBuffer()],
        programId
      );

      const borrowVault = await provider.connection.getAccountInfo(borrowPda);

      if (borrowVault) {
        logEntry("Borrow Vault", borrowPda.toBase58(), icons.checkmark);
      } else {
        logEntry("Borrow Vault", borrowPda.toBase58(), icons.cross);
      }

      const collateralVault = await provider.connection.getAccountInfo(collateralPda);

      if (collateralVault) {
        logEntry("Collateral Vault", collateralPda.toBase58(), icons.checkmark);
      } else {
        logEntry("Collateral Vault", collateralPda.toBase58(), icons.cross);
      }

      logEntry("Status", "Already Initialized", icons.checkmark);
      logInfo("Pool already exists, skipping initialization.");
    } else {
      logDivider();
      logInfo("Initializing pool...");

      // Derive vault PDAs
      const [collateralVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), poolPda.toBuffer()],
        programId
      );
      const [borrowVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("borrow_vault"), poolPda.toBuffer()],
        programId
      );

      // Check for orphaned vaults (Partial state)
      const cVaultInfo = await provider.connection.getAccountInfo(collateralVault);
      const bVaultInfo = await provider.connection.getAccountInfo(borrowVault);

      if (cVaultInfo || bVaultInfo) {
          logError("Cannot initialize pool: Vault accounts already exist!");
          logEntry("Collateral Vault", cVaultInfo ? "Exists" : "Missing", cVaultInfo ? icons.warning : icons.cross);
          logEntry("Borrow Vault", bVaultInfo ? "Exists" : "Missing", bVaultInfo ? icons.warning : icons.cross);
          logInfo("Tip: Expected Pool PDA was missing, but Vaults were found. This implies a previous 'ClosePool' did not close vaults.");
          throw new Error("State Mismatch: Vaults match Pool Seeds but Pool is missing.");
      }

      logEntry("Collateral Vault", collateralVault.toBase58(), icons.link);
      logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);

      // Initialize pool (this will also create the vaults)
      const tx = await program.methods
        .initializePool(ltvBps, liquidationThreshold)
        .accounts({
          authority: wallet.publicKey,
          pool: poolPda,
          collateralMint,
          borrowMint,
          collateralVault,
          borrowVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      logSuccess("Pool initialized successfully!");
      logEntry("Transaction", tx, icons.rocket);
      
      await provider.connection.confirmTransaction(tx, "confirmed");
    }

    // Update deployment state
    updateDeployment({
      poolAddress: poolPda.toBase58(),
      collateralMint: collateralMint.toBase58(),
      borrowMint: borrowMint.toBase58(),
    });

    logSection("Deployment Updated");
    logEntry("Pool Address", poolPda.toBase58(), icons.checkmark);
    logDivider();

  } catch (error) {
    logError("Failed to initialize pool", error);
    process.exit(1);
  }
}

// Run the script
initializePool();
