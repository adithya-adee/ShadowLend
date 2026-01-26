import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { getNetworkConfig } from "../utils/config";
import * as fs from "fs";
import * as path from "path";

async function fundTestWallet() {
    const deployment = loadDeployment();
    if (!deployment || !deployment.collateralMint) throw new Error("Deployment/Collateral Mint not found");
    
    // Test Wallet path
    const testWalletPath = path.join(__dirname, "../../test-wallet.json");
    if (!fs.existsSync(testWalletPath)) throw new Error("Test wallet not found");
    
    const secret = JSON.parse(fs.readFileSync(testWalletPath, 'utf-8'));
    const testWallet = Keypair.fromSecretKey(Uint8Array.from(secret));
    
    // Main Wallet (Authority)
    const mainWallet = getWalletKeypair();
    const config = getNetworkConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    
    const mint = new PublicKey(deployment.collateralMint);
    
    console.log(`Minting tokens to ${testWallet.publicKey.toBase58()}...`);
    
    // Get ATA
    const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        testWallet, // Payer (test wallet has SOL)
        mint,
        testWallet.publicKey
    );
    
    console.log(`ATA: ${ata.address.toBase58()}`);
    
    // Get Main Wallet ATA
    const mainAta = await getOrCreateAssociatedTokenAccount(
        connection,
        mainWallet,
        mint,
        mainWallet.publicKey
    );

    console.log(`Main ATA: ${mainAta.address.toBase58()}`);
    console.log(`Balance: ${mainAta.amount}`);

    // Transfer from Main to Test
    const { transfer } = await import("@solana/spl-token");
    const sig = await transfer(
        connection,
        mainWallet, // Payer
        mainAta.address, // Source
        ata.address, // Dest
        mainWallet, // Owner
        500000 // Amount
    );
    
    console.log(`Transferred 500000 tokens. Sig: ${sig}`);
}

fundTestWallet().catch(console.error);
