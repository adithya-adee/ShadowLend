import { Wallet, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createInitializeAccountInstruction, getMinimumBalanceForRentExemptAccount } from "@solana/spl-token";
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
  logWarning,
  icons
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";

/**
 * Initialize token vaults for the lending pool
 */
async function initializeVaults() {
  try {
    const config = getNetworkConfig();
    logHeader("Initialize Pool Vaults");

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
      throw new Error("Program ID not found in deployment.json");
    }
    if (!deployment.poolAddress) {
      throw new Error("Pool address not found in deployment.json. Run setup:init-pool first.");
    }
    if (!deployment.collateralMint || !deployment.borrowMint) {
      throw new Error("Token mints not found in deployment.json");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    const collateralMint = new PublicKey(deployment.collateralMint);
    const borrowMint = new PublicKey(deployment.borrowMint);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);
    logEntry("Collateral Mint", collateralMint.toBase58(), icons.key);
    logEntry("Borrow Mint", borrowMint.toBase58(), icons.key);

    // Derive vault PDAs
    const [collateralVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), poolPda.toBuffer()],
      programId
    );

    const [borrowVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("borrow_vault"), poolPda.toBuffer()],
      programId
    );

    logSection("Vault Accounts");
    logEntry("Collateral Vault", collateralVault.toBase58(), icons.link);
    logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);

    // Check if vaults already exist
    const collateralVaultInfo = await provider.connection.getAccountInfo(collateralVault);
    const borrowVaultInfo = await provider.connection.getAccountInfo(borrowVault);

    if (collateralVaultInfo) {
      logEntry("Collateral Vault", "Already initialized", icons.checkmark);
    } else {
      logInfo("Initializing collateral vault...");
      
      // Get rent exemption
      const rentExemption = await getMinimumBalanceForRentExemptAccount(provider.connection);
      
      // Create account instruction
      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: collateralVault,
        lamports: rentExemption,
        space: 165, // Token account size
        programId: TOKEN_PROGRAM_ID,
      });

      // Initialize token account instruction
      const initAccountIx = createInitializeAccountInstruction(
        collateralVault,
        collateralMint,
        collateralVault, // Owner is the PDA itself
        TOKEN_PROGRAM_ID
      );

      // Send transaction
      const tx = await provider.sendAndConfirm(
        new Transaction().add(createAccountIx, initAccountIx),
        [walletKeypair]
      );

      logSuccess("Collateral vault initialized!");
      logEntry("Transaction", tx, icons.rocket);
    }

    if (borrowVaultInfo) {
      logEntry("Borrow Vault", "Already initialized", icons.checkmark);
    } else {
      logInfo("Initializing borrow vault...");
      
      // Get rent exemption
      const rentExemption = await getMinimumBalanceForRentExemptAccount(provider.connection);
      
      // Create account instruction
      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: borrowVault,
        lamports: rentExemption,
        space: 165, // Token account size
        programId: TOKEN_PROGRAM_ID,
      });

      // Initialize token account instruction
      const initAccountIx = createInitializeAccountInstruction(
        borrowVault,
        borrowMint,
        borrowVault, // Owner is the PDA itself
        TOKEN_PROGRAM_ID
      );

      // Send transaction
      const tx = await provider.sendAndConfirm(
        new Transaction().add(createAccountIx, initAccountIx),
        [walletKeypair]
      );

      logSuccess("Borrow vault initialized!");
      logEntry("Transaction", tx, icons.rocket);
    }

    logSection("Summary");
    logSuccess("All vaults are initialized!");
    logEntry("Collateral Vault", collateralVault.toBase58(), icons.checkmark);
    logEntry("Borrow Vault", borrowVault.toBase58(), icons.checkmark);
    logDivider();

  } catch (error) {
    logError("Failed to initialize vaults", error);
    process.exit(1);
  }
}

// Run the script
initializeVaults();
