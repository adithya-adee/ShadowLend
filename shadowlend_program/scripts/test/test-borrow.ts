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
import { getMxeAccount, getArciumProgramInstance, generateComputationOffset, checkMxeKeysSet, waitForComputationFinalization } from "../utils/arcium";
import { getCompDefAccOffset, getCompDefAccAddress, getClusterAccAddress, getComputationAccAddress, getExecutingPoolAccAddress, getMempoolAccAddress, getFeePoolAccAddress, getClockAccAddress, getArciumProgramId } from "@arcium-hq/client";
import * as idl from "../../target/idl/shadowlend_program.json";

/**
 * Test borrow instruction
 */
async function testBorrow() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Borrow Instruction");

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    
    logSection("Configuration");
    logEntry("Network", config.name, icons.sparkle);
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);

    // Create provider
    const provider = createProvider(wallet, config);

    // Load deployment
    const deployment = loadDeployment();
    if (!deployment || !deployment.programId || !deployment.poolAddress) {
      throw new Error("Deployment not found. Run setup scripts first.");
    }

    if (!deployment.borrowMint) {
      throw new Error("Borrow mint not found in deployment. Run initialize-pool first.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    const borrowMint = new PublicKey(deployment.borrowMint);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);
    logEntry("Borrow Mint", borrowMint.toBase58(), icons.key);

    // Load program
    const program = await loadProgram(provider, programId, idl) as Program;

    // Derive PDAs
    const [userObligation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("obligation"), // Match seed prefix from lib.rs/state.rs
        wallet.publicKey.toBuffer(),
        poolPda.toBuffer(),
      ],
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

    logSection("Account Derivation");
    logEntry("User Obligation", userObligation.toBase58(), icons.link);
    logEntry("Borrow Vault", borrowVault.toBase58(), icons.link);
    logEntry("Sign PDA Account", signPdaAccount.toBase58(), icons.link);

    // Get user token account for receiving borrowed tokens
    const userTokenAccount = await getAssociatedTokenAddress(
      borrowMint,
      wallet.publicKey
    );
    logEntry("User Token Account", userTokenAccount.toBase58(), icons.key);

    // Check if user has deposited collateral (obligation must exist)
    // We will initialize it via deposit if missing/empty in Step 1 below

    // Test parameters
    const borrowAmount = new BN(500_000); // 5000 units
    const computationOffset = generateComputationOffset();

    // Use persistent X25519 keypair for Arcium context
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

    // Verify MXE State
    const isMxeReady = await checkMxeKeysSet(provider, programId);
    if (!isMxeReady) {
        logWarning("MXE keys are not set. Transaction may fail.");
    }

    // Get MXE and Arcium accounts
    const mxeAccount = getMxeAccount(programId);
    // const arciumProgram = getArciumProgramInstance(provider); // Unused
    
    // Arcium accounts
    const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
    const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
    const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
    const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);

    // Comp Def for Borrow
    const compDefOffsetBytes = getCompDefAccOffset("borrow");
    const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
    const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

    // System accounts
    const poolAccount = getFeePoolAccAddress();
    const clockAccount = getClockAccAddress();
    const arciumProgramId = getArciumProgramId();

    // Setup for checking balance change (moved up)
    let initialBalance = 0n;
    try {
        const tokenInfo = await provider.connection.getTokenAccountBalance(userTokenAccount);
        initialBalance = BigInt(new BN(tokenInfo.value.amount).toString());
    } catch (e) {
        // Token account might not exist yet
        try {
            const createAtaIx = (await import("@solana/spl-token")).createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                userTokenAccount,
                wallet.publicKey,
                borrowMint
            );
            await provider.sendAndConfirm(new (await import("@solana/web3.js")).Transaction().add(createAtaIx));
            logInfo("Created User ATA for borrow mint.");
        } catch(err) {
            // Might exist or failed
        }
    }
    logEntry("Initial Borrow Token Balance", initialBalance.toString(), icons.info);


    // --- EXECUTE DEPOSIT FIRST ---
    logDivider();
    logHeader("Step 1: Deposit Collateral");
    const depositAmount = new BN(2_000_000); // 2M tokens to support multiple 500k borrows
    const depositComputationOffset = generateComputationOffset();
    
    // Check if user has tokens for deposit
    if (!deployment.collateralMint) throw new Error("Collateral mint missing");
    const collateralMint = new PublicKey(deployment.collateralMint);
    const [collateralVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), poolPda.toBuffer()],
        programId
    );
     // User collateral ATA
    const userCollateralAccount = await getAssociatedTokenAddress(collateralMint, wallet.publicKey);

    // Load Admin Wallet (for funding)
    const adminPath = require("path").join(process.env.HOME || "", ".config/solana/id.json");
    const { loadKeypair } = require("../utils/deployment");
    let adminWallet;
    try {
        adminWallet = loadKeypair(adminPath);
        logEntry("Admin Wallet", adminWallet.publicKey.toBase58(), icons.key);
    } catch (e) {
        logWarning("Could not load Admin Wallet. Funding might fail if User/Vault needs tokens.");
        // Fallback to wallet if admin not found (though unlikely to work for minting)
        adminWallet = wallet.payer; 
    }

    // Helper to fund account
    const fundAccount = async (targetAta: PublicKey, targetAmount: bigint, mint: PublicKey) => {
        try {
            const currentObj = await getAccount(provider.connection, targetAta);
            if (currentObj.amount >= targetAmount) {
                // logInfo(`Account ${targetAta.toBase58()} has sufficient funds (${currentObj.amount}).`);
                return; 
            }
            
            const shortfall = targetAmount - currentObj.amount;
            logInfo(`Funding ${targetAta.toBase58()} with ${shortfall} tokens...`);
            
            // Handle Native Mint (wSOL)
            if (mint.toBase58() === "So11111111111111111111111111111111111111112") {
                 logInfo("Detected Native Mint (wSOL). transfering SOL and syncing...");
                 const solShortfall = shortfall; // 1:1 for wSOL
                 
                 // Transfer SOL to the ATA
                 const tx = new (await import("@solana/web3.js")).Transaction().add(
                     SystemProgram.transfer({
                         fromPubkey: adminWallet.publicKey,
                         toPubkey: targetAta,
                         lamports: Number(solShortfall)
                     }),
                     (await import("@solana/spl-token")).createSyncNativeInstruction(targetAta)
                 );
                 
                 await provider.sendAndConfirm(tx, [adminWallet]);
                 logSuccess("Funded wSOL successfully.");
                 return;
            }

            // Regular SPL Token Logic
            // 1. Check Admin Balance
            const adminAta = await getAssociatedTokenAddress(mint, adminWallet.publicKey);
            let adminBalance = 0n;
            try {
                const adminAcc = await getAccount(provider.connection, adminAta);
                adminBalance = adminAcc.amount;
            } catch(e) {
                // Admin ATA missing, create it
                 await provider.sendAndConfirm(new (await import("@solana/web3.js")).Transaction().add(
                    createAssociatedTokenAccountInstruction(adminWallet.publicKey, adminAta, adminWallet.publicKey, mint)
                ), [adminWallet]);
            }
            
            // 2. Mint to Admin if needed (Admin is likely Mint Authority)
            if (adminBalance < shortfall) {
                logInfo("Admin lacks tokens. Minting to Admin...");
                try {
                     await mintTo(provider.connection, adminWallet, mint, adminAta, adminWallet, Number(shortfall + 10_000_000n)); // Mint extra
                } catch(e) {
                     logWarning(`Failed to mint to admin: ${e}`);
                }
            }
            
            // 3. Transfer to Target
            const { transfer } = await import("@solana/spl-token");
            await transfer(
                provider.connection,
                adminWallet, // Payer
                adminAta, // Source
                targetAta, // Dest
                adminWallet, // Owner
                Number(shortfall)
            );
            logSuccess("Funding complete.");
            
        } catch (e) {
            logError("Funding failed", e);
            throw e;
        }
    };

    // Ensure User Collateral ATA exists
    try {
        await getAccount(provider.connection, userCollateralAccount);
    } catch {
        logInfo("Creating User Collateral ATA...");
        await provider.sendAndConfirm(new (await import("@solana/web3.js")).Transaction().add(
             createAssociatedTokenAccountInstruction(wallet.publicKey, userCollateralAccount, wallet.publicKey, collateralMint)
        ));
    }
    
    // Fund User
    await fundAccount(userCollateralAccount, BigInt(depositAmount.toString()), collateralMint);
    
    logInfo(`Depositing ${depositAmount.toString()}...`);
    
    // Deposit TX
    await program.methods.deposit(
        depositComputationOffset,
        depositAmount,
        userPubkey, 
        userNonce
    ).accountsPartial({
        payer: wallet.publicKey,
        signPdaAccount,
        mxeAccount,
        mempoolAccount,
        executingPool,
        computationAccount: getComputationAccAddress(config.arciumClusterOffset, depositComputationOffset),
        compDefAccount: getCompDefAccAddress(programId, Buffer.from(getCompDefAccOffset("deposit")).readUInt32LE()),
        clusterAccount,
        poolAccount,
        clockAccount,
        pool: poolPda,
        userObligation,
        collateralMint,
        userTokenAccount: userCollateralAccount,
        collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        arciumProgram: arciumProgramId,
    }).rpc();
    
    logSuccess("Deposit submitted. Transaction confirmed.");
    logInfo("Polling for deposit finalization (callback)...");

    const maxDepositRetries = 90;
    let depositFinalized = false;
    
    for (let i = 0; i < maxDepositRetries; i++) {
        try {
            const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
            // Check if encrypted deposit is populated (non-zero)
            const encDep = currentAccount.encryptedDeposit;
            const isNonZero = !Buffer.from(encDep).every(b => b === 0);
            
            if (isNonZero) {
                 console.log("");
                 logSuccess("Deposit state updated (Encrypted Deposit verified)!");
                 depositFinalized = true;
                 break;
            }
        } catch (e) {
            // Account might not exist yet instantly after tx or query error
        }
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!depositFinalized) {
        logError("Timeout waiting for deposit callback.");
        throw new Error("Deposit failed to finalize.");
    }

    logSuccess("Deposit finalized. Proceeding to borrow...");


    // --- EXECUTE BORROW ---
    logDivider();
    logHeader("Step 2: Borrow");

    logSection("Borrow Parameters");
    logEntry("Amount", borrowAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);
    logEntry("User Nonce", userNonce.toString(), icons.key);


    // FUND BORROW VAULT IF EMPTY
    try {
        const mintInfo = await (await import("@solana/spl-token")).getMint(provider.connection, borrowMint);
        logEntry("Mint Decimals", mintInfo.decimals.toString(), icons.info);

        const targetVaultBalance = 10_000_000_000n; 
        
        // Ensure Vault ATA exists (It should, from init_pool)
        // Fund it
        await fundAccount(borrowVault, targetVaultBalance, borrowMint);

    } catch (e) {
        logError("Failed to fund vault", e);
    }


    // Capture pre-transaction balances
    const preBorrowVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;
    const preCollateralVaultBalance = (await getAccount(provider.connection, collateralVault)).amount;
    const preUserTokenBalance = initialBalance; // Captured earlier

    logDivider();
    logInfo("Executing borrow transaction...");
    logEntry("Pre-Borrow Vault Balance", preBorrowVaultBalance.toString(), icons.info);
    logEntry("Pre-Collateral Vault Balance", preCollateralVaultBalance.toString(), icons.info);

    // Fetch initial state nonce
    const initialObligationState = await (program.account as any).userObligation.fetch(userObligation);
    const initialNonce = initialObligationState.stateNonce.toNumber();
    logEntry("Initial State Nonce", initialNonce.toString(), icons.info);

    try {
        const tx = await program.methods
            .borrow(
                computationOffset,
                borrowAmount,
                userPubkey,
                userNonce
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
                borrowMint,
                userTokenAccount, // This is borrow token account
                borrowVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                arciumProgram: arciumProgramId,
            })
            .rpc();
        
        logSuccess("Transaction submitted!");
        logEntry("Signature", tx, icons.rocket);
        logEntry("Explorer", `https://explorer.solana.com/tx/${tx}?cluster=devnet`, icons.link);

        // Polling loop
        logDivider();
        logInfo("Polling for state update...");
        
        const maxRetries = 90; 
        let success = false;
        
        // Capture initial state for comparison
        const initialEncryptedBorrow = initialObligationState.encryptedBorrow;
        const initialEncStr = Buffer.from(initialEncryptedBorrow).toString('hex');
        
        for(let i=0; i<maxRetries; i++) {
            try {
                const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
                const currentNonce = currentAccount.stateNonce.toNumber();
                
                // Compare updated encrypted borrow
                const currentEncryptedBorrow = currentAccount.encryptedBorrow;
                const currentEncStr = Buffer.from(currentEncryptedBorrow).toString('hex');

                if (currentNonce > initialNonce) {
                    console.log("");
                    logSuccess("State updated!");
                    logEntry("Old Encrypted Borrow", initialEncStr.substring(0, 16) + "...", icons.cross);
                    logEntry("New Encrypted Borrow", currentEncStr.substring(0, 16) + "...", icons.checkmark);
                    success = true;
                    break;
                }
            } catch(e) {}
            process.stdout.write(".");
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!success) {
            logError("Timeout waiting for state update.");
            try {
                const signatures = await provider.connection.getSignaturesForAddress(userObligation, { limit: 5 });
                signatures.forEach(sig => console.log(`Sig: ${sig.signature} ${sig.err ? "ERR" : "OK"}`));
            } catch (e) {}

        } else {
            logDivider();
            logHeader("Verification");
            
            // Check Final Balances
            const finalTokenInfo = await provider.connection.getTokenAccountBalance(userTokenAccount);
            const finalBalance = BigInt(new BN(finalTokenInfo.value.amount).toString());
            
            const postBorrowVaultBalance = (await getAccount(provider.connection, borrowVault)).amount;
            const postCollateralVaultBalance = (await getAccount(provider.connection, collateralVault)).amount;

            logEntry("User Token Address", userTokenAccount.toBase58(), icons.key);
            logEntry("Vault Token Address", borrowVault.toBase58(), icons.key);
            logEntry("Borrow Mint", borrowMint.toBase58(), icons.key);
            
            logEntry("Pre-Borrow Balance (User)", preUserTokenBalance.toString(), icons.info);
            logEntry("Final Balance (User)", finalBalance.toString(), icons.key);
            
            logEntry("Pre-Borrow Vault Balance", preBorrowVaultBalance.toString(), icons.info);
            logEntry("Final Vault Balance", postBorrowVaultBalance.toString(), icons.key);
            
            logEntry("Pre-Collateral Vault Balance", preCollateralVaultBalance.toString(), icons.info);
            logEntry("Final Collateral Vault Balance", postCollateralVaultBalance.toString(), icons.key);
            
            const userBalanceIncreased = finalBalance > preUserTokenBalance;
            const vaultBalanceDecreased = postBorrowVaultBalance < preBorrowVaultBalance;
            const collateralVaultIncreased = postCollateralVaultBalance > preCollateralVaultBalance;

            if (userBalanceIncreased && vaultBalanceDecreased) {
                logSuccess(`Balance increased by ${finalBalance - preUserTokenBalance} (Expected: ${borrowAmount})`);
                logSuccess(`Vault Balance decreased by ${preBorrowVaultBalance - postBorrowVaultBalance}`);
            } else {
                logWarning("Balances did not change as expected!");
                logEntry("User Balance Increased?", userBalanceIncreased ? "YES" : "NO", userBalanceIncreased ? icons.checkmark : icons.cross);
                logEntry("Vault Balance Decreased?", vaultBalanceDecreased ? "YES" : "NO", vaultBalanceDecreased ? icons.checkmark : icons.cross);
                
                logEntry("Result", "Transaction likely Rejected by LTV Health Check", icons.warning); 
                logInfo(`Collateral: ~${BigInt(depositAmount.toString())} | Requested Borrow: ${borrowAmount}`);
            }

            if (collateralVaultIncreased) {
                 logInfo("Collateral Vault increased (Unexpected for pure borrow, but verified).");
            } else {
                 logInfo("Collateral Vault balance unchanged (Expected).");
            }

            // Check Encrypted State
            const account = await (program.account as any).userObligation.fetch(userObligation);
            
            const poolAccount = await (program.account as any).pool.fetch(poolPda);
            logEntry("LTV BPS", poolAccount.ltvBps.toString(), icons.info);
            
            const encBorrow = account.encryptedBorrow;
            console.log("Encrypted Borrow (Hex):", Buffer.from(encBorrow).toString('hex'));
            
            const isZero = Buffer.from(encBorrow).every(b => b === 0);
            if (isZero) {
                logWarning("Encrypted Borrow is ALL ZEROS.");
            } else {
                logSuccess("Encrypted Borrow updated with non-zero ciphertext.");
            }
        }

    } catch (error: any) {
        logError("Borrow transaction failed", error);
        if (error.logs) {
            logSection("Logs");
            error.logs.forEach((l: string) => console.log(chalk.gray(l)));
        }
        throw error;
    }

  } catch (error) {
    logError("Borrow test failed", error);
    process.exit(1);
  }
}

// Run the test
testBorrow();
