
import { 
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddress, 
  createMintToInstruction,
  getAccount,
  TokenAccountNotFoundError,
  createMint,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { PublicKey, Transaction, SystemProgram, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  createProvider,
  getNetworkConfig,
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logInfo,
  icons,
  logDivider
} from "../utils/config";
import { getWalletKeypair, loadDeployment, updateDeployment } from "../utils/deployment";

async function ensureMintsAndAta() {
  try {
    const config = getNetworkConfig();
    logHeader("Setup Localnet Assets");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    const provider = createProvider(wallet, config);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // 1. Ensure Mints Exist
    let deployment = loadDeployment();
    
    // Check Collateral Mint
    let collateralMintPubkey: PublicKey | null = null;
    if (deployment?.collateralMint) {
        try {
            const info = await provider.connection.getAccountInfo(new PublicKey(deployment.collateralMint));
            if (info) {
                if (info.owner.equals(TOKEN_PROGRAM_ID)) {
                   collateralMintPubkey = new PublicKey(deployment.collateralMint);
                   logEntry("Collateral Mint", "Exists", icons.checkmark);
                } else {
                   logEntry("Collateral Mint", "Invalid Owner", icons.cross);
                }
            } else {
                logEntry("Collateral Mint", "Missing on-chain", icons.cross);
            }
        } catch {
             logEntry("Collateral Mint", "Invalid", icons.cross);
        }
    }

    if (!collateralMintPubkey) {
        logInfo("Creating new Collateral Mint...");
        const newMint = await createMint(
            provider.connection,
            walletKeypair,
            wallet.publicKey, // mint authority
            null, // freeze authority
            6 // decimals
        );
        collateralMintPubkey = newMint;
        logSuccess(`Synthesized Collateral Mint: ${newMint.toBase58()}`);
        
        // Update deployment immediately
        updateDeployment({ collateralMint: newMint.toBase58() });
    }

    // Check Borrow Mint (optional for this script but good for completeness)
    let borrowMintPubkey: PublicKey | null = null;
    if (deployment?.borrowMint && deployment.borrowMint !== "So11111111111111111111111111111111111111112") {
         try {
            const info = await provider.connection.getAccountInfo(new PublicKey(deployment.borrowMint));
             if (info && info.owner.equals(TOKEN_PROGRAM_ID)) {
                borrowMintPubkey = new PublicKey(deployment.borrowMint);
            }
        } catch {}
    }
    
    // For borrow mint, if it's missing, let's create one too (simulating wSOL or another token)
    if (!borrowMintPubkey) {
        logInfo("Creating new Borrow Mint...");
        const newMint = await createMint(
            provider.connection,
            walletKeypair,
            wallet.publicKey,
            null,
            9 
        );
        borrowMintPubkey = newMint;
        logSuccess(`Synthesized Borrow Mint: ${newMint.toBase58()}`);
        updateDeployment({ borrowMint: newMint.toBase58() });
    }

    // Refresh deployment
    deployment = loadDeployment();
    const collateralMint = new PublicKey(deployment!.collateralMint!); // asserted by above logic

    // 2. Create ATA
    logSection("User Token Account");
    const userAta = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );
    logEntry("User ATA Address", userAta.toBase58(), icons.link);

    let accountExists = false;
    try {
      await getAccount(provider.connection, userAta);
      accountExists = true;
      logSuccess("ATA already exists");
    } catch (e) {
        // ignore not found
    }

    if (!accountExists) {
        logInfo("Creating ATA...");
        const tx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey, // payer
                userAta,          // ata
                wallet.publicKey, // owner
                collateralMint    // mint
            )
        );
        await provider.sendAndConfirm(tx);
        logSuccess("Created ATA");
    }

    // 3. Mint Tokens
    logSection("Minting Tokens");
    const amountToMint = 5000 * 10 ** 6; // 5000 tokens
    
    try {
        const mintTx = new Transaction().add(
            createMintToInstruction(
                collateralMint,
                userAta,
                wallet.publicKey,
                amountToMint
            )
        );
        const sig = await provider.sendAndConfirm(mintTx);
        logSuccess(`Minted 5000 tokens. Sig: ${sig}`);
    } catch (e) {
        logError("Failed to mint tokens", e);
    }

    // 4. Report Final Balance
    const accountInfo = await getAccount(provider.connection, userAta);
    logSection("Status");
    logEntry("Collateral Mint", collateralMint.toBase58(), icons.key);
    logEntry("Token Balance", accountInfo.amount.toString(), icons.info);
    logDivider();

  } catch (error) {
    logError("Failed to setup localnet assets", error);
    process.exit(1);
  }
}

ensureMintsAndAta();
