import { Wallet, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createProvider, getNetworkConfig, loadProgram, logHeader, logEntry, icons } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import * as idl from "../../target/idl/shadowlend_program.json";

async function checkState() {
    const config = getNetworkConfig();
    const wallet = new Wallet(getWalletKeypair());
    const provider = createProvider(wallet, config);
    const deployment = loadDeployment();
    
    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    const program = await loadProgram(provider, programId, idl) as Program;

    const [userObligation] = PublicKey.findProgramAddressSync(
        [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
        programId
    );

    logHeader("Checking User Obligation State");
    logEntry("Obligation Address", userObligation.toBase58(), icons.link);

    try {
        const account = await (program.account as any).userObligation.fetch(userObligation);
        logEntry("State Nonce", account.stateNonce.toString(), icons.info);
        
        const encDeposit = account.encryptedDeposit;
        const encBorrow = account.encryptedBorrow;

        const depositHex = Buffer.from(encDeposit).toString('hex');
        const borrowHex = Buffer.from(encBorrow).toString('hex');

        logEntry("Encrypted Deposit (First 32 bytes)", depositHex.substring(0, 64), icons.key);
        
        const isDepositZero = Buffer.from(encDeposit).every(b => b === 0);
        if (isDepositZero) {
            console.log("⚠️  WARNING: Encrypted Deposit is ALL ZEROS. No collateral found.");
        } else {
            console.log("✅  Encrypted Deposit is present.");
        }

        logEntry("Encrypted Borrow (First 32 bytes)", borrowHex.substring(0, 64), icons.key);

    } catch (e: any) {
        if (e.message.includes("Account does not exist")) {
            console.log("❌  User Obligation account does not exist.");
        } else {
            console.log("❌  Error fetching account:", e);
        }
    }
}

checkState();
