import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { 
    TOKEN_PROGRAM_ID, 
    mintTo,
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction, 
    getAccount
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
  icons,
  getExplorerUrl,
  logEvent,
  UserConfidentialStateEvent 
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
    getArciumProgramId,
    getMXEPublicKey,
    x25519
} from "@arcium-hq/client";
import { getOrCreateX25519Key } from "../utils/keys";
import { PerformanceTracker } from "../utils/performance";

import * as idl from "../../target/idl/shadowlend_program.json";

const perf = new PerformanceTracker();

/**
 * Main Test Execution Function for Spend Instruction
 */
async function runSpendTest() {
    try {
        logHeader("Test: Spend Instruction");
        perf.start("Total Execution");

        // --- Configuration & Setup ---
        perf.start("Setup");
        const config = getNetworkConfig();
        const walletKeypair = getWalletKeypair();
        const wallet = new Wallet(walletKeypair);
        const provider = createProvider(wallet, config);

        logSection("Configuration");
        logEntry("Network", config.name, icons.sparkle);
        logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

        // Load Deployment
        const deployment = loadDeployment();
        if (!deployment || !deployment.programId || !deployment.poolAddress || !deployment.borrowMint) {
            throw new Error("Invalid deployment state (missing pool or borrow mint). Please run setup scripts first.");
        }

        const programId = new PublicKey(deployment.programId);
        const poolPda = new PublicKey(deployment.poolAddress);
        const borrowMint = new PublicKey(deployment.borrowMint);

        logEntry("Program ID", programId.toBase58(), icons.folder);
        logEntry("Pool", poolPda.toBase58(), icons.link);
        logEntry("Borrow Mint", borrowMint.toBase58(), icons.key);

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
        const [borrowVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("borrow_vault"), poolPda.toBuffer()],
            programId
        );

        // Destination Token Account
        let recipient = wallet.publicKey;
        if (config.name === "devnet") {
            recipient = new PublicKey("E8NrsJEcvwKbpeutVLFtY7Hf1Nq2iqHK9HW3bPWJ8BBB");
            logInfo(`Devnet Mode: Spending to hardcoded recipient ${recipient.toBase58()}`);
        }

        const destinationTokenAccount = await getAssociatedTokenAddress(borrowMint, recipient);

        logEntry("User Obligation", userObligation.toBase58(), icons.link);
        logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);
        logEntry("Dest Token Acc", destinationTokenAccount.toBase58(), icons.link);
        perf.end("Account Derivation");

        // --- Prepare Transaction Data ---
        const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
        const userPubkey = Array.from(userPubkeyBytes);

        // Get nonce
        let userNonce = new BN(0);
        try {
            const acc = await (program.account as any).userObligation.fetch(userObligation);
            userNonce = acc.stateNonce;
            logInfo(`Current Obligation Nonce: ${userNonce.toString()}`);
            
            // Check Internal Balance (last 32 bytes)
            const encState = Buffer.from(acc.encryptedState);
            const encInternal = encState.slice(64, 96);
            const isNonZero = !encInternal.every(b => b === 0);
            
            if (isNonZero) {
                logEntry("Internal Balance", "Likely Positive", icons.checkmark);
            } else {
                logWarning("Encrypted Internal Balance is ALL ZEROS. Spend will likely FAIL (No funds to spend).");
                logInfo("Hint: Run 'npm run test:borrow' first.");
            }
        } catch (e) {
            logWarning("User Obligation not initialized.");
            throw new Error("User Obligation must exist (Run deposit/borrow tests first).");
        }

        // --- Ensure Destination Account Exists ---
        try {
            await getAccount(provider.connection, destinationTokenAccount);
        } catch (e) {
            logInfo("Creating Destination Token Account...");
            await provider.sendAndConfirm(
                new (await import("@solana/web3.js")).Transaction().add(
                    createAssociatedTokenAccountInstruction(wallet.publicKey, destinationTokenAccount, recipient, borrowMint)
                )
            );
            logSuccess("Destination ATA created.");
        }

        // --- Ensure Vault Has Funds ---
        // For localnet testing, we need to mint tokens to the vault so it can pay out
        const vaultInfo = await provider.connection.getTokenAccountBalance(borrowVault).catch(() => null);
        
        // Sync Native if using Wrapped SOL
        // This ensures that any SOL transferred to the vault is seen as Token Balance
        if (borrowMint.toBase58() === "So11111111111111111111111111111111111111112") {
            logInfo("Detected Wrapped SOL Mint. Syncing Native Balance...");
            try {
                // We need to import createSyncNativeInstruction
                const { createSyncNativeInstruction, NATIVE_MINT } = await import("@solana/spl-token");
                
                const syncTx = new (await import("@solana/web3.js")).Transaction().add(
                    createSyncNativeInstruction(borrowVault)
                );
                
                await provider.sendAndConfirm(syncTx);
                logSuccess("Synced Native Balance for Vault.");
                
                // Re-check balance
                const newVaultInfo = await provider.connection.getTokenAccountBalance(borrowVault).catch(() => null);
                if (newVaultInfo) {
                    logInfo(`Vault Token Balance: ${newVaultInfo.value.uiAmount}`);
                }
            } catch (e) {
                logWarning(`Failed to Sync Native: ${e.message}`);
            }
        }

        if (!vaultInfo || vaultInfo.value.uiAmount < 1000) {
            if (config.name === "devnet") {
                logWarning("Borrow Vault low on funds. Please ensure the vault is funded manually for Devnet testing.");
            } else {
                logWarning("Borrow Vault low on funds. Attempting to fund...");
                try {
                    // Try minting to vault (works if payer has mint authority, which is true for localnet deployment wallet)
                    await mintTo(
                        provider.connection,
                        wallet.payer,
                        borrowMint,
                        borrowVault,
                        wallet.payer,
                        10_000_000 // Fund with 10M units
                    );
                    logSuccess("Funded Borrow Vault successfully.");
                } catch (e) {
                    logWarning(`Failed to fund Borrow Vault: ${e.message}. Spend might fail if vault is empty.`);
                }
            }
        }

        perf.end("Data Prep");

        // --- Arcium Checks ---
        logSection("Arcium Setup");
        const isMxeReady = await checkMxeKeysSet(provider, programId);
        if (!isMxeReady) {
            logWarning("MXE Keys not set! Transaction may fail.");
           // Don't throw, let it try
        } else {
            logEntry("MXE Status", "Ready", icons.checkmark);
        }

        // --- Spend Parameters ---
        // We assume we want to spend a small amount, e.g., 500 units
        // Must be <= Internal Balance
        const spendAmount = new BN(100); 
        const computationOffset = generateComputationOffset();

        logEntry("Spend Amount", spendAmount.toString(), icons.key);

        // Derive Arcium Accounts
        const mxeAccount = getMxeAccount(programId);
        const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
        const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
        const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
        
        const compDefOffsetBytes = getCompDefAccOffset("spend");
        const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
        const compDefAccount = getCompDefAccAddress(programId, compDefOffset);
        const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);

        const poolAccount = getFeePoolAccAddress();
        const clockAccount = getClockAccAddress();
        const arciumProgramId = getArciumProgramId();

        // --- Execute Transaction ---
        logDivider();
        logInfo("Submitting Spend Transaction...");
        perf.start("Transaction Submission");

        // Explicit Casts for Anchor (Generic)
        const compOffsetBN = new BN(computationOffset);
        const amountBN = new BN(spendAmount); // Plaintext u64
        const pubkeyBuf = Buffer.from(userPubkey);
        const nonceBN = new BN(userNonce);

        if (pubkeyBuf.length !== 32) throw new Error(`Invalid pubkey length: ${pubkeyBuf.length}`);

        // Get pre-balance for verification
        const preBalance = await provider.connection.getTokenAccountBalance(destinationTokenAccount)
            .then(b => new BN(b.value.amount))
            .catch(() => new BN(0));

        const txSig = await program.methods
            .spend(
                compOffsetBN,
                amountBN,
                pubkeyBuf as any,
                nonceBN
            )
            .accountsPartial({
                payer: wallet.publicKey,
                signPdaAccount,
                mxeAccount,
                mempoolAccount,
                executingPool,
                computationAccount,
                compDefAccount,
                clusterAccount,
                poolAccount,
                clockAccount,
                pool: poolPda,
                userObligation,
                destinationTokenAccount,
                borrowVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                arciumProgram: arciumProgramId,
            })
            .rpc();

        perf.end("Transaction Submission");
        logSuccess(`Transaction Confirmed: ${txSig}`);
        logEntry("Explorer", getExplorerUrl(txSig, config.name), icons.link);

        // --- Event Listener ---
        const eventListener = program.addEventListener("UserConfidentialState", (event: UserConfidentialStateEvent, slot) => {
            if (userObligation.equals(event.userObligation)) {
                logEvent(event);
            }
        });

        // --- MPC Finalization ---
        logSection("MPC Execution");
        logInfo("Waiting for Arcium Node pickup...");
        
        perf.start("MPC Finalization");
        let finalized = false;
        const maxMpcRetries = 60; // 2 minutes
        const mpcPollInterval = 2000;
        
        process.stdout.write("   Polling Computation Account: ");
        for (let i = 0; i < maxMpcRetries; i++) {
             const acc = await provider.connection.getAccountInfo(computationAccount);
             if (acc) {
                 finalized = true;
                 process.stdout.write(" FOUND\n");
                 break;
             }
             process.stdout.write(".");
             await new Promise(r => setTimeout(r, mpcPollInterval));
        }
        perf.end("MPC Finalization");
        
        if(finalized) {
             logSuccess(`Computation Finalized (Account created at ${computationAccount.toBase58()})`);
        } else {
             throw new Error("Timeout waiting for Arcium Node pickup (Computation Account creation).");
        }

        // --- State Update Verification ---
        logInfo("Waiting for State Update (Callback)...");
        perf.start("Callback Latency");
        
        const initialNonce = userNonce.toNumber();
        let callbackSuccess = false;
        
        // Polling logic
        const maxRetries = 60; // Spend usually involves token transfer so maybe slightly longer
        process.stdout.write("   Polling State: ");
        for (let i = 0; i < maxRetries; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                if (currentAccount.stateNonce.toNumber() > initialNonce) {
                    process.stdout.write(" DONE\n");
                    logSuccess(`State Updated! Nonce: ${currentAccount.stateNonce}`);
                    callbackSuccess = true;
                    
                    // Verify Token Balance Increase
                    const postBalance = await provider.connection.getTokenAccountBalance(destinationTokenAccount)
                        .then(b => new BN(b.value.amount));
                    
                    const diff = postBalance.sub(preBalance);
                    if (diff.eq(spendAmount)) {
                        logEntry("Token Balance", `Increased by ${diff.toString()} (Correct)`, icons.checkmark);
                    } else if (diff.isZero()) {
                        logWarning("Token Balance did NOT increase. Spend logic might have failed (Insufficient internal balance?)");
                    } else {
                         logWarning(`Token Balance changed by ${diff.toString()} (Expected ${spendAmount.toString()})`);
                    }

                    break;
                }
            } catch (e) {
             // ignore
            }
            process.stdout.write(".");
            await new Promise(r => setTimeout(r, 1000));
        }
        perf.end("Callback Latency");

        if (!callbackSuccess) {
            throw new Error("Callback timeout. State nonce did not increment.");
        }

        perf.end("Total Execution");
        logDivider();
        perf.logReport();
        logSuccess("Spend Test Completed Successfully");

        program.removeEventListener(eventListener);

    } catch (error) {
        logError("Test Failed", error);
        process.exit(1);
    }
}

// Execute
runSpendTest();
