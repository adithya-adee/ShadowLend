
import { 
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddress, 
  createMintToInstruction,
  getAccount
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
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
import { getWalletKeypair, loadDeployment } from "../utils/deployment";

async function mintToTarget() {
  try {
    const targetAddress = process.argv[2];
    if (!targetAddress) {
        throw new Error("Target address is required. Usage: ts-node mint-to-target.ts <PUBKEY>");
    }

    const config = getNetworkConfig();
    logHeader("Mint Tokens to Target");

    // Load Mint Authority Wallet (Localnet Admin)
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    const provider = createProvider(wallet, config);

    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Authority", wallet.publicKey.toBase58(), icons.key);

    // Load Deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.collateralMint) {
        throw new Error("Deployment not found or missing collateral mint.");
    }
    const collateralMint = new PublicKey(deployment.collateralMint);
    logEntry("Mint", collateralMint.toBase58(), icons.link);

    // Target Pubkey
    const targetPubkey = new PublicKey(targetAddress);

    // 1. Get/Create ATA
    logSection("Target Token Account");
    const userAta = await getAssociatedTokenAddress(
      collateralMint,
      targetPubkey
    );
    logEntry("ATA Address", userAta.toBase58(), icons.link);

    let accountExists = false;
    try {
      await getAccount(provider.connection, userAta);
      accountExists = true;
      logSuccess("ATA already exists");
    } catch (e) {
        // ignore
    }

    if (!accountExists) {
        logInfo("Creating ATA for target...");
        const tx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey, // payer (admin pays rent)
                userAta,          // ata
                targetPubkey,     // owner
                collateralMint    // mint
            )
        );
        await provider.sendAndConfirm(tx);
        logSuccess("Created ATA");
    }

    // 2. Mint Tokens
    logSection("Minting Tokens");
    const amountToMint = 5000 * 10 ** 6; // 5000 tokens
    
    const mintTx = new Transaction().add(
        createMintToInstruction(
            collateralMint,
            userAta,
            wallet.publicKey, // authority (admin)
            amountToMint
        )
    );
    const sig = await provider.sendAndConfirm(mintTx);
    logSuccess(`Minted 5000 tokens to ${targetAddress}. Sig: ${sig}`);
    logDivider();

  } catch (error) {
    logError("Failed to mint tokens", error);
    process.exit(1);
  }
}

mintToTarget();
