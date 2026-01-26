import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, mintTo, getAccount } from "@solana/spl-token";
import { generateKeyPairSync } from "crypto";
import chalk from "chalk";
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
import { getMxeAccount, getArciumProgramInstance, generateComputationOffset, checkMxeKeysSet } from "../utils/arcium";
import { getCompDefAccOffset, getCompDefAccAddress, getClusterAccAddress, getComputationAccAddress, getExecutingPoolAccAddress, getMempoolAccAddress, getFeePoolAccAddress, getClockAccAddress, getArciumProgramId } from "@arcium-hq/client";
import * as idl from "../../target/idl/shadowlend_program.json";

/**
 * Test repay instruction
 * Requires prior Deposit and Borrow
 */
async function testRepay() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Repay Instruction");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    
    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    const provider = createProvider(wallet, config);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId || !deployment.poolAddress || !deployment.borrowMint) {
      throw new Error("Deployment missing. Run setup/initialize scripts.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    const borrowMint = new PublicKey(deployment.borrowMint);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);

    const program = await loadProgram(provider, programId, idl) as Program;

    // Derived Accounts
    const [userObligation] = PublicKey.findProgramAddressSync(
      [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
      programId
    );

    const [borrowVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("borrow_vault"), poolPda.toBuffer()],
      programId
    );

    const [signPdaAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("ArciumSignerAccount")],
        programId
    );

    const userTokenAccount = await getAssociatedTokenAddress(borrowMint, wallet.publicKey);

    // Arcium Setup
    const mxeAccount = getMxeAccount(programId);
    const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
    const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
    const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);
    const poolAccount = getFeePoolAccAddress();
    const clockAccount = getClockAccAddress();
    const arciumProgramId = getArciumProgramId();

    const { getOrCreateX25519Key } = await import("../utils/keys");
    const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
    const userPubkey = Array.from(userPubkeyBytes);
    // Determine deterministic nonce
    let userNonce = new BN(0);
    try {
        const acc = await (program.account as any).userObligation.fetch(userObligation);
        userNonce = acc.stateNonce;
        logInfo(`Using stateNonce: ${userNonce.toString()}`);
    } catch (e) {
        logInfo("User Obligation not initialized. Using nonce: 0");
    }

    // Verify Obligation
    let obligationAccount;
    try {
        obligationAccount = await (program.account as any).userObligation.fetch(userObligation);
    } catch (e) {
        throw new Error("User obligation not found. Run test-deposit and test-borrow first.");
    }

    logSection("Current Status");
    logEntry("Encrypted Deposit", Buffer.from(obligationAccount.encryptedDeposit).toString('hex').substring(0, 16) + "...", icons.info);
    logEntry("Encrypted Borrow", Buffer.from(obligationAccount.encryptedBorrow).toString('hex').substring(0, 16) + "...", icons.info);
    
    // Repay Amount (assuming 500,000 was borrowed)
    const repayAmount = new BN(500_000); // Repay full borrow
    const computationOffset = generateComputationOffset();

    // Ensure User has tokens to repay
    // If borrow failed to transfer, we might need to mint?
    // Let's check balance
    let userBalance = 0n;
    try {
        const bal = await provider.connection.getTokenAccountBalance(userTokenAccount);
        userBalance = BigInt(new BN(bal.value.amount).toString());
    } catch (e) { logWarning("User token account not found/empty"); }
    
    logEntry("User Wallet Balance", userBalance.toString(), icons.key);
    
    if (userBalance < BigInt(repayAmount.toString())) {
        logWarning("User balance insufficient for repay. Borrow transfer might have failed.");
        logInfo("Minting tokens to user to allow repay test...");
        // Mint tokens so we can test repay logic at least
        await mintTo(provider.connection, wallet.payer, borrowMint, userTokenAccount, wallet.payer, 500_000);
        logSuccess("Minted 500,000 tokens to user.");
    }

    logDivider();
    logHeader("Step 1: Repay");
    logEntry("Amount", repayAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);

    const preUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
    const preVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;
    const initialNonce = obligationAccount.stateNonce.toNumber();

    // Comp Def for Repay
    const compDefOffsetBytes = getCompDefAccOffset("repay");
    const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
    const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

    // Call Repay
    let txSig = "";
    try {
        const tx = await program.methods.repay(
            computationOffset,
            repayAmount,
            userPubkey,
            userNonce
        ).accountsPartial({
            payer: wallet.publicKey,
            signPdaAccount,
            mxeAccount,
            mempoolAccount,
            executingPool,
            computationAccount: getComputationAccAddress(config.arciumClusterOffset, computationOffset),
            compDefAccount,
            clusterAccount,
            poolAccount,
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
        }).rpc();

        txSig = tx;
        logSuccess("Repay transaction submitted!");
        logEntry("Signature", tx, icons.rocket);
        
        // Immediate Vault Check
        const postVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;
        const expectedVaultBalance = BigInt(preVaultBalance) + BigInt(repayAmount.toString());
        
        if (postVaultBalance === expectedVaultBalance) {
            logSuccess(`Vault balance increased by ${repayAmount.toString()} (Matches expected).`);
        } else {
             logError(`Vault balance mismatch! Expected: ${expectedVaultBalance}, Found: ${postVaultBalance}`);
             throw new Error("Vault balance did not increase correctly in repay transaction.");
        }
        
    } catch (e: any) {
        if (txSig) logEntry("Failed Transaciton", txSig, icons.cross);
        throw e;
    }

    // Poll for state update
    logInfo("Polling for state update...");
    let success = false;
    for(let i=0; i<90; i++) {
        try {
            const current = await (program.account as any).userObligation.fetch(userObligation);
            if (current.stateNonce.toNumber() > initialNonce) {
                logSuccess("State updated!");
                success = true;
                break;
            }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 2000));
    }

    if (!success) throw new Error("Repay callback timeout.");

    logDivider();
    logHeader("Verification");

    // Check Balances
    const finalUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
    const finalVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;

    logEntry("User Balance Change", `${preUserBalance} -> ${finalUserBalance}`, icons.info);
    logEntry("Vault Balance Change", `${preVaultBalance} -> ${finalVaultBalance}`, icons.info);

    if (preUserBalance - finalUserBalance === BigInt(repayAmount.toString())) {
        logSuccess("User balance decreased correctly.");
    } else {
        logWarning("User balance did not decrease correctly.");
    }

    if (finalVaultBalance - preVaultBalance === BigInt(repayAmount.toString())) {
        logSuccess("Vault balance increased correctly.");
    } else {
        logWarning("Vault balance did not increase correctly.");
    }

    // Check Encrypted Borrow
    const finalObligation = await (program.account as any).userObligation.fetch(userObligation);
    logEntry("New Encrypted Borrow", Buffer.from(finalObligation.encryptedBorrow).toString('hex').substring(0, 16) + "...", icons.key);

  } catch (error: any) {
    logError("Repay test failed", error);
    if (error.logs) {
        error.logs.forEach((l: string) => console.log(chalk.gray(l)));
    }
    process.exit(1);
  }
}

testRepay();
