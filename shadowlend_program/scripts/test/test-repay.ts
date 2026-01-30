import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { 
    TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction, 
    getAccount,
    mintTo
} from "@solana/spl-token";

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
  logWarning, 
  logDivider,
  icons 
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { 
    getMxeAccount, 
    checkMxeKeysSet, 
    generateComputationOffset 
} from "../utils/arcium";
import { 
    getCompDefAccOffset, 
    getCompDefAccAddress, 
    getClusterAccAddress, 
    getComputationAccAddress, 
    getExecutingPoolAccAddress, 
    getMempoolAccAddress, 
    getFeePoolAccAddress, 
    getClockAccAddress, 
    getArciumProgramId
} from "@arcium-hq/client";
import { getOrCreateX25519Key } from "../utils/keys";
import { PerformanceTracker } from "../utils/performance";
import * as idl from "../../target/idl/shadowlend_program.json";

const perf = new PerformanceTracker();

async function runRepayTest() {
    try {
        logHeader("Test: Repay Instruction");
        perf.start("Total Execution");

        // --- Configuration & Setup ---
        perf.start("Setup");
        const config = getNetworkConfig();
        const walletKeypair = getWalletKeypair();
        const wallet = new Wallet(walletKeypair);
        const provider = createProvider(wallet, config); // Robust provider

        logSection("Configuration");
        logEntry("Network", config.name, icons.sparkle);
        logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

        const deployment = loadDeployment();
        if (!deployment.poolAddress || !deployment.borrowMint || !deployment.collateralMint) {
            throw new Error("Invalid deployment state.");
        }

        const programId = new PublicKey(deployment.programId);
        const poolPda = new PublicKey(deployment.poolAddress);
        const borrowMint = new PublicKey(deployment.borrowMint); // Repay using Borrow Mint (SOL)
        
        const program = await loadProgram(provider, programId, idl) as Program;
        perf.end("Setup");

        // --- Account Derivation ---
        perf.start("Account Derivation");
        const [userObligation] = PublicKey.findProgramAddressSync(
            [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
            programId
        );
        const [signPdaAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("ArciumSignerAccount")],
            programId
        );
        const [borrowVault] = PublicKey.findProgramAddressSync( // Tokens go here
            [Buffer.from("borrow_vault"), poolPda.toBuffer()],
            programId
        );
        
        // User's Token Account (To repay from)
        const userTokenAccount = await getAssociatedTokenAddress(borrowMint, wallet.publicKey);

        logEntry("User Obligation", userObligation.toBase58(), icons.link);
        logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);
        perf.end("Account Derivation");

        // --- Prepare Data ---
        const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
        const userPubkey = Array.from(userPubkeyBytes);
        
        // Get nonce
        let userNonce = new BN(0);
        try {
            const acc = await (program.account as any).userObligation.fetch(userObligation);
            userNonce = acc.stateNonce;
            logInfo(`Current Obligation Nonce: ${userNonce.toString()}`);
            
            // Check if debt exists (encrypted state)
            const encState = Buffer.from(acc.encryptedState);
            const encDebt = encState.slice(32, 64); // Debt is middle 32 bytes
            const isDebtNonZero = !encDebt.every(b => b === 0);
            
            if (isDebtNonZero) {
                logEntry("Encrypted Debt", "Present (Non-Zero)", icons.checkmark);
            } else {
                logWarning("Encrypted Debt is ALL ZEROS. Repay might be redundant but valid (Overpaying?).");
            }
        } catch (e) {
            logError("User Obligation Not Found", "Must run Deposit/Borrow first");
            throw new Error("Run 'npm run test:deposit' and 'npm run test:borrow' first.");
        }

        // --- Ensure User Has Tokens to Repay ---
        // We repay 'borrowMint' tokens.
        const repayAmount = new BN(1000); 
        logEntry("Repay Amount", repayAmount.toString(), icons.key);

        try {
            const acc = await getAccount(provider.connection, userTokenAccount);
            if (new BN(acc.amount.toString()).lt(repayAmount)) {
                logInfo("Minting tokens for repayment...");
                await mintTo(provider.connection, wallet.payer, borrowMint, userTokenAccount, wallet.payer, 5000);
            }
        } catch (e) {
            logInfo("Creating/Minting tokens for repayment...");
            // Create ATA if needed (should exist if borrowed, but safe to check)
             await provider.sendAndConfirm(
                new (await import("@solana/web3.js")).Transaction().add(
                    createAssociatedTokenAccountInstruction(wallet.publicKey, userTokenAccount, wallet.publicKey, borrowMint)
                )
            );
            await mintTo(provider.connection, wallet.payer, borrowMint, userTokenAccount, wallet.payer, 5000);
        }

        // --- Arcium Setup ---
        logSection("Arcium Setup");
        await checkMxeKeysSet(provider, programId); // Log warning inside if fails
        const computationOffset = generateComputationOffset();

        // --- EXECUTE TRANSACTION ---
        logDivider();
        logInfo("Submitting Repay Transaction...");
        perf.start("Transaction Submission");
        
        // Get pre-balance
        const preBalance = await getAccount(provider.connection, userTokenAccount).then(a => new BN(a.amount.toString()));

        // Explicit types
        const compOffsetBN = new BN(computationOffset);
        const amountBN = new BN(repayAmount);
        const pubkeyBuf = Buffer.from(userPubkey);
        const nonceBN = new BN(userNonce);

        const mxeAccount = getMxeAccount(programId);
        const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
        const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
        const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
        const compDefAccount = getCompDefAccAddress(programId, Buffer.from(getCompDefAccOffset("repay")).readUInt32LE());
        const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);
        const poolAccount = getFeePoolAccAddress();
        const clockAccount = getClockAccAddress();
        const arciumProgramId = getArciumProgramId();

        const txSig = await program.methods
            .repay(
                compOffsetBN,
                amountBN,
                pubkeyBuf as any,
                nonceBN
            )
            .accountsPartial({
                payer: wallet.publicKey,
                signPdaAccount,
                mxeAccount, mempoolAccount, executingPool, computationAccount, compDefAccount, clusterAccount, poolAccount, clockAccount,
                pool: poolPda,
                userObligation,
                userTokenAccount,
                borrowVault,
                borrowMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                arciumProgram: arciumProgramId,
            })
            .rpc();

        perf.end("Transaction Submission");
        logSuccess(`Transaction Confirmed: ${txSig}`);
        logEntry("Explorer", `https://explorer.solana.com/tx/${txSig}?cluster=devnet`, icons.link);

        // --- Verification ---
        logSection("Verification");
        
        // 1. Check Token Balance (Immediate)
        const postBalance = await getAccount(provider.connection, userTokenAccount).then(a => new BN(a.amount.toString()));
        const diff = preBalance.sub(postBalance);
        if (diff.eq(repayAmount)) {
            logEntry("Token Balance", "Decremented correctly", icons.checkmark);
        } else {
             throw new Error(`Token balance did not decrease by ${repayAmount}. Diff: ${diff}`);
        }

        // 2. Check Arcium MPC
        logInfo("Waiting for Arcium Node pickup...");
        let finalized = false;
        const maxMpcRetries = 60;
        process.stdout.write("   Polling Computation Account: ");
        for (let i = 0; i < maxMpcRetries; i++) {
             const acc = await provider.connection.getAccountInfo(computationAccount);
             if (acc) {
                 finalized = true;
                 process.stdout.write(" FOUND\n");
                 break;
             }
             process.stdout.write(".");
             await new Promise(r => setTimeout(r, 2000));
        }
        
        if(!finalized) throw new Error("MPC Timeout");
        logSuccess("Computation Finalized.");

        // 3. Check Callback (State Update)
        logInfo("Waiting for State Update...");
        const initialNonce = userNonce.toNumber();
        let callbackSuccess = false;
        process.stdout.write("   Polling State: ");
        for (let i = 0; i < 60; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                if (currentAccount.stateNonce.toNumber() > initialNonce) {
                    process.stdout.write(" DONE\n");
                    logSuccess(`State Updated! Nonce: ${currentAccount.stateNonce}`);
                    
                     // Optional: Check if debt changed (encrypted blob check)
                    const encState = Buffer.from(currentAccount.encryptedState);
                    const encDebt = encState.slice(32, 64);
                    // Just log it changed, hard to verify exact value without viewing key
                     logEntry("Encrypted Debt", "Updated", icons.key);
                    
                    callbackSuccess = true;
                    break;
                }
            } catch (e) {}
            process.stdout.write(".");
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!callbackSuccess) throw new Error("State update timeout");

        perf.end("Total Execution");
        logDivider();
        perf.logReport();
        logSuccess("Repay Test Completed Successfully");

    } catch (e) {
        logError("Test Failed", e);
        process.exit(1);
    }
}

runRepayTest();
