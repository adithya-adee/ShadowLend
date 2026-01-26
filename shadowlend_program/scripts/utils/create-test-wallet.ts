import { Keypair, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
import { getWalletKeypair } from "../utils/deployment";
import { getNetworkConfig } from "../utils/config";
import * as fs from "fs";
import * as path from "path";

async function createTestWallet() {
    // 1. Generate new keypair
    const newKeypair = Keypair.generate();
    const newWalletPath = path.join(__dirname, "../../test-wallet.json");
    
    // Save to file
    fs.writeFileSync(newWalletPath, JSON.stringify(Array.from(newKeypair.secretKey)));
    console.log(`Created new test wallet: ${newKeypair.publicKey.toBase58()}`);
    console.log(`Saved to: ${newWalletPath}`);

    // 2. Fund it from main wallet
    const mainWallet = getWalletKeypair();
    const config = getNetworkConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");

    const amount = 0.1 * LAMPORTS_PER_SOL;
    
    console.log(`Funding from main wallet: ${mainWallet.publicKey.toBase58()}...`);
    
    // Check main wallet balance
    const balance = await connection.getBalance(mainWallet.publicKey);
    console.log(`Main wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < amount) {
        throw new Error("Insufficient funds in main wallet.");
    }

    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: newKeypair.publicKey,
            lamports: amount,
        })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [mainWallet]);
    console.log(`Funded test wallet. Signature: ${sig}`);
}

createTestWallet().catch(console.error);
