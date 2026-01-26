import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
import { generateKeyPairSync } from "crypto";
import chalk from "chalk";
import { 
  createProvider, 
  getNetworkConfig, 
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
import { getMxeAccount, checkMxeKeysSet } from "../utils/arcium";
import { getCompDefAccOffset, getCompDefAccAddress, getClusterAccAddress, getComputationAccAddress, getExecutingPoolAccAddress, getMempoolAccAddress, getFeePoolAccAddress, getClockAccAddress, getArciumProgramId } from "@arcium-hq/client";
import { generateComputationOffset } from "../utils/arcium";

/**
 * Test repay instruction
 */
async function testRepay() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Repay Instruction");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    
    // Create provider
    const provider = createProvider(wallet, config);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId || !deployment.poolAddress) {
      throw new Error("Deployment not found. Run initialize-pool first.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    
    // Initialize Program
    const idl = require("../../target/idl/shadowlend_program.json");
    const program = new Program(idl, provider);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);

    // Derive user obligation PDA
    const [userObligation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("obligation"),
        wallet.publicKey.toBuffer(),
        poolPda.toBuffer(),
      ],
      programId
    );

    const [signPdaAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("ArciumSignerAccount")],
        programId
    );

    logEntry("User Obligation", userObligation.toBase58(), icons.link);

    // Check if user has debt
    let initialObligationState;
    try {
        initialObligationState = await (program.account as any).userObligation.fetch(userObligation);
    } catch (e) {
        logError("User obligation not found. Borrow first.");
        process.exit(1);
    }
    const initialNonce = initialObligationState.stateNonce.toNumber();

    // Fetch Pool to get Mint
    const poolAccount = await (program.account as any).pool.fetch(poolPda);
    const borrowMint = poolAccount.borrowMint;
    
    // Get user token account (associated with borrow mint)
    const userTokenAccount = await getAssociatedTokenAddress(
        borrowMint,
        wallet.publicKey
    );
    
    // Get Borrow Vault
    const [borrowVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("borrow_vault"), poolPda.toBuffer()],
        programId
    );

    // Test parameters
    const repayAmount = new BN(100_000); // 0.1 token
    const computationOffset = generateComputationOffset();

    logSection("Repay Parameters");
    logEntry("Amount", repayAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);

    // Generate valid X25519 keypair for Arcium context
    const { publicKey: x25519PubDer } = generateKeyPairSync("x25519", {
        publicKeyEncoding: { format: "der", type: "spki" },
        privateKeyEncoding: { format: "der", type: "pkcs8" }
    });
    const x25519PubBytes = x25519PubDer as Buffer; 
    const userPubkey = Array.from(x25519PubBytes.subarray(x25519PubBytes.length - 32));
    const userNonce = new BN(Date.now()).mul(new BN(1000000)); // u128

    // Arcium Accounts
    const mxeAccount = getMxeAccount(programId);
    
    const clusterOffset = (config as any).arciumClusterOffset || 0; 

    const mempoolAccount = getMempoolAccAddress(clusterOffset);
    const executingPool = getExecutingPoolAccAddress(clusterOffset);
    const computationAccount = getComputationAccAddress(clusterOffset, computationOffset);
    let clusterAccount = getClusterAccAddress(clusterOffset);

    // Check if cluster account exists
    const clusterAccountInfo = await provider.connection.getAccountInfo(clusterAccount);
    let finalClusterOffset = clusterOffset;

    if (!clusterAccountInfo) {
        logWarning(`Cluster account not found at offset ${clusterOffset}. Checking offset 0...`);
        const fallbackOffset = 0;
        const fallbackClusterAccount = getClusterAccAddress(fallbackOffset);
        const fallbackInfo = await provider.connection.getAccountInfo(fallbackClusterAccount);
        
        if (fallbackInfo) {
            logSuccess(`Found cluster account at offset ${fallbackOffset}! Switching offset.`);
            finalClusterOffset = fallbackOffset;
            clusterAccount = fallbackClusterAccount;
        } else {
             logError("Cluster account not found at offset 0 or 1. Ensure Arcium localnet is running.");
        }
    } else {
        logEntry("Cluster Account", "Exists", icons.checkmark);
    }

    // Re-derive based on final offset
    const finalMempoolAccount = getMempoolAccAddress(finalClusterOffset);
    const finalExecutingPool = getExecutingPoolAccAddress(finalClusterOffset);
    const finalComputationAccount = getComputationAccAddress(finalClusterOffset, computationOffset);

    // Comp Def for Repay
    const compDefOffsetBytes = getCompDefAccOffset("repay");
    const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
    const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

    // System accounts
    const poolAccountArcium = getFeePoolAccAddress();
    const clockAccount = getClockAccAddress();
    const arciumProgramId = getArciumProgramId();

    // Check balances
    let initialTokenBalance = 0n;
    try {
        const info = await getAccount(provider.connection, userTokenAccount);
        initialTokenBalance = info.amount;
        logEntry("User Token Balance (Pre)", initialTokenBalance.toString(), icons.info);
        
        if (initialTokenBalance < BigInt(repayAmount.toString())) {
             logError(`Insufficient balance! Need ${repayAmount}, have ${initialTokenBalance}. Run test-borrow first.`);
             return;
        }

    } catch(e) {
        logError("User Token Account not found. Run test-borrow first.");
        return;
    }
    
    const initialVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;
    logEntry("Vault Balance (Pre)", initialVaultBalance.toString(), icons.info);

    logDivider();
    logInfo("Executing repay transaction...");

    try {
        const tx = await program.methods
            .repay(
                computationOffset,
                repayAmount,
                userPubkey,
                userNonce
            )
            .accountsPartial({
                payer: wallet.publicKey,
                signPdaAccount,
                mxeAccount,
                mempoolAccount: finalMempoolAccount,
                executingPool: finalExecutingPool,
                computationAccount: finalComputationAccount,
                compDefAccount,
                clusterAccount: clusterAccount,
                poolAccount: poolAccountArcium,
                clockAccount,
                pool: poolPda,
                userObligation,
                borrowMint,
                userTokenAccount,
                borrowVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                arciumProgram: arciumProgramId,
            })
            .rpc();

        logSuccess("Transaction submitted!");
        logEntry("Signature", tx, icons.rocket);

        // Immediate check: Balance should have decreased
        await new Promise(r => setTimeout(r, 2000));
        const midTokenInfo = await getAccount(provider.connection, userTokenAccount);
        if (midTokenInfo.amount < initialTokenBalance) {
             logSuccess(`Tokens transferred successfully (Balance: ${midTokenInfo.amount})`);
        } else {
             logWarning("Token balance did not decrease immediately! Check logic.");
        }

        // Polling loop for state update
        logDivider();
        logInfo("Polling for state update...");
        
        const maxRetries = 90; 
        let success = false;
        
        for(let i=0; i<maxRetries; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                const currentNonce = currentAccount.stateNonce.toNumber();
                
                if (currentNonce > initialNonce) {
                    console.log("");
                    logSuccess("State updated!");
                    success = true;
                    break;
                }
            } catch(e) {}
            process.stdout.write(".");
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!success) {
            logError("Timeout waiting for state update.");
        } else {
            logDivider();
            logHeader("Verification");
            
            // final balance check
            const finalTokenInfo = await getAccount(provider.connection, userTokenAccount);
            const finalBalance = finalTokenInfo.amount;
            
            logEntry("Final Balance (User)", finalBalance.toString(), icons.key);
            
            // Check Encrypted State
            logSuccess("Encrypted Borrow updated.");
        }

    } catch (error: any) {
        logError("Repay transaction failed", error);
        if (error.logs) {
            logSection("Logs");
            error.logs.forEach((l: string) => console.log(chalk.gray(l)));
        }
        throw error;
    }

  } catch (error) {
    logError("Repay test failed", error);
    process.exit(1);
  }
}

// Run the test
testRepay();
