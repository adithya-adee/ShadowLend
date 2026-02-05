import { Wallet, BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
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
    generateComputationOffset,
    getArciumProgramInstance,
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
} from "@arcium-hq/client";
import { getOrCreateX25519Key } from "../utils/keys";
import * as idl from "../../target/idl/shadowlend_program.json";
import { PerformanceTracker } from "../utils/performance";

const perf = new PerformanceTracker();

/**
 * Main Test Execution Function
 */
async function runDepositTest() {
    try {
        logHeader("Test: Deposit Instruction");
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
        if (!deployment || !deployment.programId || !deployment.poolAddress || !deployment.collateralMint) {
            throw new Error("Invalid deployment state. Please run setup scripts first.");
        }

        const programId = new PublicKey(deployment.programId);
        const poolPda = new PublicKey(deployment.poolAddress);
        const collateralMint = new PublicKey(deployment.collateralMint);

        logEntry("Program ID", programId.toBase58(), icons.folder);
        logEntry("Pool", poolPda.toBase58(), icons.link);

        const program = await loadProgram(provider, programId, idl) as Program;
        perf.end("Setup");

        // --- Account Derivation ---
        perf.start("Account Derivation");
        const [userObligation] = PublicKey.findProgramAddressSync(
            [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
            programId
        );
        const [collateralVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("collateral_vault"), poolPda.toBuffer()],
            programId
        );
        const [signPdaAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("ArciumSignerAccount")],
            programId
        );

        const userTokenAccount = await getAssociatedTokenAddress(collateralMint, wallet.publicKey);
        perf.end("Account Derivation");

        // --- Token Account Checks ---
        try {
            const tokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
            logEntry("Token Balance", tokenAccountInfo.amount.toString(), icons.info);
            
            if (tokenAccountInfo.amount === 0n) {
                logWarning("User token balance is 0. Please fund account.");
                 throw new Error("Insufficient funds for deposit test.");
            }
        } catch (error: any) {
             if (error.message?.includes("could not find account") || error instanceof Error && error.message.includes("TokenAccountNotFoundError") ) {
                logWarning("Creating associated token account...");
                const createTx = await provider.sendAndConfirm(
                    new (await import("@solana/web3.js")).Transaction().add(
                        createAssociatedTokenAccountInstruction(wallet.publicKey, userTokenAccount, wallet.publicKey, collateralMint)
                    )
                );
                logSuccess(`Created ATA: ${createTx}`);
                throw new Error("Created empty token account. Please fund it before retrying.");
             }
             throw error;
        }

        // --- Prepare Transaction Data ---
        perf.start("Data Prep");
        const depositAmount = new BN(500_000); 
        const computationOffset = generateComputationOffset();
        const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
        const userPubkey = Array.from(userPubkeyBytes);

        // Get nonce
        let userNonce = new BN(0);
        try {
            const acc = await (program.account as any).userObligation.fetch(userObligation);
            userNonce = acc.stateNonce;
            logInfo(`Existing Obligation Nonce: ${userNonce.toString()}`);
        } catch (e) {
            logInfo("New Obligation (Nonce 0)");
        }
        perf.end("Data Prep");

        // --- Arcium Checks ---
        logSection("Arcium Setup");
        const isMxeReady = await checkMxeKeysSet(provider, programId);
        if (!isMxeReady) {
            logWarning("MXE Keys not set! Transaction may fail.");
        } else {
            logEntry("MXE Status", "Ready", icons.checkmark);
        }

        // Derive Arcium Accounts
        const mxeAccount = getMxeAccount(programId);
        const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
        const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
        const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
        const compDefOffsetBytes = getCompDefAccOffset("deposit");
        const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
        const compDefAccount = getCompDefAccAddress(programId, compDefOffset);
        
        // Handle Cluster Address (with fallback check logic if needed, simplified here for professionalism)
        // Usually, the offset is correct.
        const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);

        const poolAccount = getFeePoolAccAddress();
        const clockAccount = getClockAccAddress();
        const arciumProgramId = getArciumProgramId();

        // --- Pre-check Vault ---
        const initialVaultBalance = await provider.connection.getTokenAccountBalance(collateralVault)
            .then(b => new BN(b.value.amount))
            .catch(() => new BN(0));

        // --- Execute Transaction ---
        logDivider();
        logInfo("Submitting Deposit Transaction...");
        perf.start("Transaction Submission");
        
        const txSig = await program.methods
            .deposit(computationOffset, depositAmount, userPubkey, userNonce)
            .accounts({
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
                collateralMint,
                userTokenAccount,
                collateralVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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

        // --- Immediate Verification ---
        perf.start("Vault Verification");
        const postVaultBalance = await provider.connection.getTokenAccountBalance(collateralVault)
            .then(b => new BN(b.value.amount));
        
        if (postVaultBalance.sub(initialVaultBalance).eq(depositAmount)) {
            logEntry("Vault Balance", "Verified Increment", icons.checkmark);
        } else {
            throw new Error(`Vault balance mismatch. Expected +${depositAmount}, got +${postVaultBalance.sub(initialVaultBalance)}`);
        }
        perf.end("Vault Verification");

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
        // Waiting for the callback transaction to land on Solana
        logInfo("Waiting for State Update (Callback)...");
        perf.start("Callback Latency");
        
        const initialNonce = userNonce.toNumber();
        let callbackSuccess = false;
        
        // Polling logic
        const maxRetries = 30;
        process.stdout.write("   Polling State: ");
        for (let i = 0; i < maxRetries; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                if (currentAccount.stateNonce.toNumber() > initialNonce) {
                    process.stdout.write(" DONE\n");
                    logSuccess(`State Updated! Nonce: ${currentAccount.stateNonce}`);
                    callbackSuccess = true;
                    break;
                }
            } catch (e) { /* ignore fetch errors */ }
            process.stdout.write(".");
            await new Promise(r => setTimeout(r, 1000));
        }
        perf.end("Callback Latency");

        if (!callbackSuccess) {
            throw new Error("Callback timeout. State nonce did not increment.");
        }

        // --- Final Encrypted State Check ---
        const finalObligation = await (program.account as any).userObligation.fetch(userObligation);
        const encBytes = Buffer.from(finalObligation.encryptedState);
        const isNonZero = encBytes.slice(0, 32).some(b => b !== 0); // Check first 32 bytes (encrypted deposit)
        
        if (isNonZero) {
            logEntry("Encrypted State", "Updated (Non-Zero)", icons.key);
        } else {
             logWarning("Encrypted State is all zeros (Expected non-zero ciphertext).");
        }

        perf.end("Total Execution");
        logDivider();
        perf.logReport();
        logSuccess("Deposit Test Completed Successfully");
        
        program.removeEventListener(eventListener);

    } catch (error) {
        logError("Test Failed", error);
        process.exit(1);
    }
}

// Execute
runDepositTest();
