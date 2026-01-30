import { Wallet, Program, BN } from "@coral-xyz/anchor";
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

async function runWithdrawTest() {
    try {
        logHeader("Test: Withdraw Instruction");
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

        const deployment = loadDeployment();
        if (!deployment.poolAddress || !deployment.collateralMint) {
            throw new Error("Invalid deployment state (missing pool or collateral mint).");
        }

        const programId = new PublicKey(deployment.programId);
        const poolPda = new PublicKey(deployment.poolAddress);
        const collateralMint = new PublicKey(deployment.collateralMint);

        logEntry("Program ID", programId.toBase58(), icons.folder);
        logEntry("Pool", poolPda.toBase58(), icons.link);
        logEntry("Collateral Mint", collateralMint.toBase58(), icons.key);

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
        const [collateralVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("collateral_vault"), poolPda.toBuffer()],
            programId
        );
        
        // DESTINATION for Withdraw: User's Collateral ATA
        const userTokenAccount = await getAssociatedTokenAddress(collateralMint, wallet.publicKey);

        logEntry("User Obligation", userObligation.toBase58(), icons.link);
        logEntry("Collateral Vault", collateralVault.toBase58(), icons.link);
        logEntry("Dest Token Acc", userTokenAccount.toBase58(), icons.link);
        perf.end("Account Derivation");

        // --- Prepare Data ---
        const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
        const userPubkey = Array.from(userPubkeyBytes);
        
        let userNonce = new BN(0);
        try {
            const acc = await (program.account as any).userObligation.fetch(userObligation);
            userNonce = acc.stateNonce;
            logInfo(`Current Obligation Nonce: ${userNonce.toString()}`);
            
            // Check Encrypted Deposit (First 32 bytes)
            const encState = Buffer.from(acc.encryptedState);
            const encDeposit = encState.slice(0, 32); 
            const isNonZero = !encDeposit.every(b => b === 0);
            
            if (isNonZero) {
                logEntry("Encrypted Deposit", "Likely Positive", icons.checkmark);
            } else {
                logWarning("Encrypted Deposit is ALL ZEROS. Withdraw might fail or be rejected by circuit.");
            }
        } catch (e) {
            logError("User Obligation Not Found", "Must run Deposit first");
            throw new Error("Run 'npm run test:deposit' first.");
        }

        // --- Ensure Dest ATA Exists ---
        try {
            await getAccount(provider.connection, userTokenAccount);
        } catch (e) {
            logInfo("Creating Destination Token Account...");
             await provider.sendAndConfirm(
                new (await import("@solana/web3.js")).Transaction().add(
                    createAssociatedTokenAccountInstruction(wallet.publicKey, userTokenAccount, wallet.publicKey, collateralMint)
                )
            );
        }

        // --- Arcium Setup ---
        logSection("Arcium Setup");
        await checkMxeKeysSet(provider, programId);
        const computationOffset = generateComputationOffset();

        const withdrawAmount = new BN(100); 
        logEntry("Withdraw Amount", withdrawAmount.toString(), icons.key);

        // --- EXECUTE TRANSACTION ---
        logDivider();
        logInfo("Submitting Withdraw Transaction...");
        perf.start("Transaction Submission");
        
        const preBalance = await getAccount(provider.connection, userTokenAccount)
            .then(a => new BN(a.amount.toString()))
            .catch(() => new BN(0));

        const compOffsetBN = new BN(computationOffset);
        const amountBN = new BN(withdrawAmount);
        const pubkeyBuf = Buffer.from(userPubkey);
        const nonceBN = new BN(userNonce);

        const mxeAccount = getMxeAccount(programId);
        const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
        const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
        const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
        const compDefAccount = getCompDefAccAddress(programId, Buffer.from(getCompDefAccOffset("withdraw")).readUInt32LE());
        const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);
        const poolAccount = getFeePoolAccAddress();
        const clockAccount = getClockAccAddress();
        const arciumProgramId = getArciumProgramId();

        const txSig = await program.methods
            .withdraw(
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
                userTokenAccount,   // Destination
                collateralVault,    // Source
                collateralMint,     // Constraint / Init logic usually handled by ATA check, but needed for Anchor constraints usually
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                arciumProgram: arciumProgramId,
            })
            .rpc();

        perf.end("Transaction Submission");
        logSuccess(`Transaction Confirmed: ${txSig}`);
        logEntry("Explorer", `https://explorer.solana.com/tx/${txSig}?cluster=devnet`, icons.link);

        // --- Verification ---
        logSection("Verification");
        
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

        logInfo("Waiting for State Update...");
        const initialNonce = userNonce.toNumber();
        let callbackSuccess = false;
        process.stdout.write("   Polling State: ");
        for (let i = 0; i < 90; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                if (currentAccount.stateNonce.toNumber() > initialNonce) {
                    process.stdout.write(" DONE\n");
                    logSuccess(`State Updated! Nonce: ${currentAccount.stateNonce}`);
                    
                    // Verify Balance Increase
                    const postBalance = await getAccount(provider.connection, userTokenAccount)
                        .then(a => new BN(a.amount.toString()));
                    
                    const diff = postBalance.sub(preBalance);
                    if (diff.eq(withdrawAmount)) {
                        logEntry("Token Balance", `Increased by ${diff} (Correct)`, icons.checkmark);
                    } else if (diff.isZero()) {
                        logWarning("Token Balance did not change. Withdraw likely rejected by circuit check.");
                    } else {
                        logWarning(`Token Balance changed by ${diff} (Expected ${withdrawAmount})`);
                    }

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
        logSuccess("Withdraw Test Completed Successfully");

    } catch (e) {
        logError("Test Failed", e);
        process.exit(1);
    }
}

runWithdrawTest();
