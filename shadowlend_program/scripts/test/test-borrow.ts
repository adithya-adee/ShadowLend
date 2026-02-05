import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

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
    getMXEPublicKey,
    getLookupTableAddress,
    RescueCipher,
    x25519
} from "@arcium-hq/client";
import { getOrCreateX25519Key } from "../utils/keys";
import { PerformanceTracker } from "../utils/performance";
import * as idl from "../../target/idl/shadowlend_program.json";

const perf = new PerformanceTracker();

/**
 * Main Test Execution Function for Borrow Instruction
 */
async function runBorrowTest() {
    try {
        logHeader("Test: Borrow Instruction");
        perf.start("Total Execution");

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

        perf.start("Account Derivation");
        const [userObligation] = PublicKey.findProgramAddressSync(
            [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
            programId
        );
        const [signPdaAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("ArciumSignerAccount")],
            programId
        );

        // We also derive borrow vault just in case, though usually internal logic handles it
        const [borrowVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("borrow_vault"), poolPda.toBuffer()],
            programId
        );

        logEntry("User Obligation", userObligation.toBase58(), icons.link);
        logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);
        perf.end("Account Derivation");


        const { publicKey: userPubkeyBytes, privateKey: userPrivKeyBytes } = getOrCreateX25519Key();
        const userPubkey = Array.from(userPubkeyBytes);

        // Get nonce
        let userNonce = new BN(0);
        try {
            const acc = await (program.account as any).userObligation.fetch(userObligation);
            userNonce = acc.stateNonce;
            logInfo(`Current Obligation Nonce: ${userNonce.toString()}`);
            
            // Check if collateral exists approx (if encrypted state is non-zero)
            const encState = Buffer.from(acc.encryptedState);
            // First 32 bytes is deposited
            const isDeposited = !encState.slice(0, 32).every(b => b === 0);
            if (!isDeposited) {
                logWarning("Warning: Encrypted Deposit appears to be zero/empty. Borrow might fail due to lack of collateral.");
            } else {
                logEntry("Collateral Status", "Likely Deposited", icons.checkmark);
            }

        } catch (e) {
            logWarning("User Obligation not initialized. Borrow will fail (No Account).");
            throw new Error("User Obligation must exist (Run deposit test first).");
        }
        perf.end("Data Prep");

        // Arcium Checks
        logSection("Arcium Setup");
        const isMxeReady = await checkMxeKeysSet(provider, programId);
        if (!isMxeReady) {
            logWarning("MXE Keys not set! Transaction may fail.");
            throw new Error("MXE Keys must be set to perform shared encryption.");
        } else {
            logEntry("MXE Status", "Ready", icons.checkmark);
        }

        perf.start("Encryption");
        const borrowAmount = new BN(5000); // Actual amount to borrow
        const computationOffset = generateComputationOffset();
        
        // 1. Get Cluster Public Key (Shared Key)
        const mxePublicKey = await getMXEPublicKey(provider, programId);
        if (!mxePublicKey) {
            throw new Error("Failed to fetch MXE Public Key for encryption.");
        }

        // 2. Derive Shared Secret (ECDH: My Priv Key + Cluster Pub Key)
        // If mxePublicKey is already Uint8Array, use it directly.
        const clusterKeyBytes = (mxePublicKey instanceof Uint8Array) ? mxePublicKey : (mxePublicKey as any).toBytes();
        const sharedSecret = x25519.getSharedSecret(userPrivKeyBytes, clusterKeyBytes);

        // 3. Encrypt Amount using RescueCipher (Shared Encryption)
        // Note: We use RescueCipher because user_nonce is u128 (16 bytes), matching Rescue nonce size.
        const cipher = new RescueCipher(sharedSecret);
        const nonceBuffer = userNonce.toArrayLike(Buffer, "le", 16);
        
        // Encrypt [borrowAmount]
        const encryptedChunks = cipher.encrypt([BigInt(borrowAmount.toString())], nonceBuffer);
        
        if (encryptedChunks.length === 0) {
            throw new Error("Encryption failed to produce output.");
        }
        const borrowAmountHash = encryptedChunks[0]; // First 32 bytes

        logEntry("Borrow Amount", borrowAmount.toString(), icons.key);
        logInfo(`Encrypted Borrow Amount (32 bytes): ${Buffer.from(borrowAmountHash).toString('hex').slice(0, 16)}...`);
        perf.end("Encryption");

        // Derive Arcium Accounts
        const mxeAccount = getMxeAccount(programId);
        const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
        const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
        const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
        
        const compDefOffsetBytes = getCompDefAccOffset("borrow");
        const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
        const compDefAccount = getCompDefAccAddress(programId, compDefOffset);
        const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);

        const poolAccount = getFeePoolAccAddress();
        const clockAccount = getClockAccAddress();
        const arciumProgramId = getArciumProgramId();

        // Execute Transaction
        logDivider();
        logInfo("Submitting Borrow Transaction...");
        perf.start("Transaction Submission");

        // Explicit Casts for Anchor
        const compOffsetBN = new BN(computationOffset);
        const amountBuf = Buffer.from(borrowAmountHash);
        const pubkeyBuf = Buffer.from(userPubkey);
        const nonceBN = new BN(userNonce);

        if (amountBuf.length !== 32) throw new Error(`Invalid amount length: ${amountBuf.length}`);
        if (pubkeyBuf.length !== 32) throw new Error(`Invalid pubkey length: ${pubkeyBuf.length}`);

        const txSig = await program.methods
            .borrow(
                compOffsetBN,
                amountBuf as any,
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

        logInfo("Waiting for State Update (Callback)...");
        perf.start("Callback Latency");
        
        const initialNonce = userNonce.toNumber();
        let callbackSuccess = false;
        
        // Polling logic
        const maxRetries = 45;
        process.stdout.write("   Polling State: ");
        for (let i = 0; i < maxRetries; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                if (currentAccount.stateNonce.toNumber() > initialNonce) {
                    process.stdout.write(" DONE\n");
                    logSuccess(`State Updated! Nonce: ${currentAccount.stateNonce}`);
                    callbackSuccess = true;
                    
                    // Verify encrypted state
                    const encState = Buffer.from(currentAccount.encryptedState);
                    // Internal balance is the last 32 bytes of the 96-byte state
                    const encInternal = encState.slice(64, 96);
                    const isNonZero = !encInternal.every(b => b === 0);
                    
                    if (isNonZero) {
                        logEntry("Encrypted Internal Balance", "Updated (Non-Zero)", icons.key);
                    } else {
                        logWarning("Encrypted Internal Balance is ALL ZEROS.");
                    }
                    break;
                }
            } catch (e) { 
                // Only swallow errors if we haven't found the state yet
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
        logSuccess("Borrow Test Completed Successfully");

        program.removeEventListener(eventListener);

    } catch (error) {
        logError("Test Failed", error);
        process.exit(1);
    }
}

// Execute
runBorrowTest();
