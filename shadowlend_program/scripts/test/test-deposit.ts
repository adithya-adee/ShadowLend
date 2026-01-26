import { Wallet, BN, Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
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
import { getMxeAccount, getArciumProgramInstance, generateComputationOffset, waitForComputationFinalization, checkMxeKeysSet } from "../utils/arcium";
import { getCompDefAccOffset, getCompDefAccAddress, getClusterAccAddress, getComputationAccAddress, getExecutingPoolAccAddress, getMempoolAccAddress, getFeePoolAccAddress, getClockAccAddress, getArciumProgramId, awaitComputationFinalization } from "@arcium-hq/client";
import * as idl from "../../target/idl/shadowlend_program.json";



/**
 * Test deposit instruction
 */
async function testDeposit() {
  try {
    const config = getNetworkConfig();
    logHeader("Test: Deposit Instruction");

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

    if (!deployment.collateralMint) {
      throw new Error("Collateral mint not found in deployment. Run initialize-pool first.");
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    const collateralMint = new PublicKey(deployment.collateralMint);

    logEntry("Program ID", programId.toBase58(), icons.folder);
    logEntry("Pool", poolPda.toBase58(), icons.link);
    logEntry("Collateral Mint", collateralMint.toBase58(), icons.key);

    // Load program
    const program = await loadProgram(provider, programId, idl) as Program;

    // Derive PDAs
    const [userObligation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("obligation"),
        wallet.publicKey.toBuffer(),
        poolPda.toBuffer(),
      ],
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

    logSection("Account Derivation");
    logEntry("User Obligation", userObligation.toBase58(), icons.link);
    logEntry("Collateral Vault", collateralVault.toBase58(), icons.link);
    logEntry("Sign PDA Account", signPdaAccount.toBase58(), icons.link);

    // Get or create user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );

    logEntry("User Token Account", userTokenAccount.toBase58(), icons.key);

    // Check if user has tokens
    try {
      const tokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
      logEntry("Token Balance", tokenAccountInfo.amount.toString(), icons.info);
      
      if (tokenAccountInfo.amount === 0n) {
        logError("User has no tokens to deposit. Please fund the token account first.");
        console.log(chalk.gray(`   To fund your account with devnet USDC:`));
        console.log(chalk.gray(`   1. Use a devnet faucet`));
        console.log(chalk.gray(`   2. Or use: spl-token mint ${collateralMint.toBase58()} 1000000 ${userTokenAccount.toBase58()}`));
        process.exit(1);
      }
    } catch (error: any) {
      if (error.message?.includes("could not find account")) {
        logWarning("User token account does not exist. Creating it...");
        
        // Create associated token account
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userTokenAccount,
          wallet.publicKey,
          collateralMint
        );
        
        const tx = await provider.sendAndConfirm(
          new (await import("@solana/web3.js")).Transaction().add(createAtaIx)
        );
        
        logSuccess(`Token account created: ${tx}`);
        logError("Please fund the token account with test tokens before running deposit.");
        process.exit(1);
      } else {
        throw error;
      }
    }

    // Test parameters
    const depositAmount = new BN(500_000); // 0.5 tokens (assuming 6 decimals)
    const computationOffset = generateComputationOffset();

    // Generate encryption parameters (X25519 keypair for encryption)
    // Generate encryption parameters (X25519 keypair for encryption)
    // We use a persistent keypair to enable state inspection later
    const { getOrCreateX25519Key } = await import("../utils/keys");
    const { publicKey: userPubkeyBytes } = getOrCreateX25519Key();
    const userPubkey = Array.from(userPubkeyBytes);

    // Determine deterministic nonce for encryption (to enable decryption later)
    let userNonce = new BN(0);
    try {
        const acc = await (program.account as any).userObligation.fetch(userObligation);
        userNonce = acc.stateNonce;
        logInfo(`Found existing Obligation. Using stateNonce: ${userNonce.toString()}`);
    } catch (e) {
        logInfo("User Obligation not initialized. Using nonce: 0");
    }

    logSection("Deposit Parameters");
    logEntry("Amount", depositAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);
    logEntry("User Nonce", userNonce.toString(), icons.key);

    // Verify MXE State
    logSection("Verifying MXE State");
    const isMxeReady = await checkMxeKeysSet(provider, programId);
    if (isMxeReady) {
        logEntry("MXE Keys", "Set (Ready)", icons.checkmark);
    } else {
        logEntry("MXE Keys", "Not Set (Not Ready)", icons.cross);
        logWarning("MXE keys are not set. The following transaction will likely fail with MxeKeysNotSet.");
        // We continue anyway to show the error, or you could throw here.
    }

    // Get MXE and Arcium accounts
    const mxeAccount = getMxeAccount(programId);
    const arciumProgram = getArciumProgramInstance(provider);
    
    logEntry("MXE Account", mxeAccount.toBase58(), icons.key);

    // Derive Arcium-related accounts
    const mempoolAccount = getMempoolAccAddress(config.arciumClusterOffset)

    const executingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);

    const computationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset)

    const compDefOffsetBytes = getCompDefAccOffset("deposit");
    const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE();
    const compDefAccount = getCompDefAccAddress(
      programId,
      compDefOffset,
    );

    const clusterAccount = getClusterAccAddress(config.arciumClusterOffset);
    
    // Check if cluster account exists
    const clusterAccountInfo = await provider.connection.getAccountInfo(clusterAccount);
    if (!clusterAccountInfo) {
        logWarning(`Cluster account not found at offset ${config.arciumClusterOffset} (${clusterAccount.toBase58()})`);
        
        // Try offset 0 as fallback
        const fallbackOffset = 0;
        const fallbackClusterAccount = getClusterAccAddress(fallbackOffset);
        const fallbackInfo = await provider.connection.getAccountInfo(fallbackClusterAccount);
        
        if (fallbackInfo) {
            logSuccess(`Found cluster account at offset ${fallbackOffset} (${fallbackClusterAccount.toBase58()})! Switching offset.`);
            // Update config for this run
            config.arciumClusterOffset = fallbackOffset;
            
            // Re-derive dependent accounts with new offset
            // mempoolAccount and executingPool depend on offset? 
            // Checking arcium-hq/client docs/usage -> yes usually.
            // Let's re-derive everything that depends on offset.
            
            logInfo("Re-deriving Arcium accounts with new offset...");
        } else {
             logError("Cluster account not found at offset 0 or 1. Ensure Arcium localnet is running and initialized.");
             // We won't exit here, we'll let the transaction fail so the user sees the on-chain error too, 
             // but the logs above will help debug.
        }
    } else {
        logEntry("Cluster Account", "Exists", icons.checkmark);
    }
    
    // Re-derive in case offset changed (or just to be safe)
    const finalMempoolAccount = getMempoolAccAddress(config.arciumClusterOffset);
    const finalExecutingPool = getExecutingPoolAccAddress(config.arciumClusterOffset);
    const finalComputationAccount = getComputationAccAddress(config.arciumClusterOffset, computationOffset);
    const finalClusterAccount = getClusterAccAddress(config.arciumClusterOffset);

    // Get strictly derived Arcium addresses from SDK
    const poolAccount = getFeePoolAccAddress();
    const clockAccount = getClockAccAddress();
    const arciumProgramId = getArciumProgramId();

    // Check initial vault balance
    logInfo("Verifying initial vault balance...");
    let initialVaultBalance = new BN(0);
    try {
        const vaultInfo = await provider.connection.getTokenAccountBalance(collateralVault);
        initialVaultBalance = new BN(vaultInfo.value.amount);
        logEntry("Initial Vault Balance", initialVaultBalance.toString(), icons.info);
    } catch (e) {
        logInfo("Vault token account likely empty or not created yet.");
    }

    logDivider();
    logInfo("Executing deposit transaction...");
    logInfo("This sends the request to Arcium nodes...");

    // Execute deposit instruction
    let txSig = "";
    try {
      const tx = await program.methods
        .deposit(
          computationOffset,
          depositAmount,
          userPubkey,
          userNonce
        )
        .accounts({
          payer: wallet.publicKey,
          signPdaAccount,
          mxeAccount,
          mempoolAccount: finalMempoolAccount,
          executingPool: finalExecutingPool,
          computationAccount: finalComputationAccount,
          compDefAccount,
          clusterAccount: finalClusterAccount,
          poolAccount,
          clockAccount,
          pool: poolPda,
          userObligation,
          collateralMint, // Added collateralMint
          userTokenAccount,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, // Added associatedTokenProgram
          systemProgram: SystemProgram.programId,
          arciumProgram: arciumProgramId,
        })
        .rpc();

      txSig = tx;
      logSuccess("Transaction submitted!");
      logEntry("Signature", tx, icons.rocket);

      // Log Explorer URL
      logSuccess("Transaction confirmed on-chain!");
      logEntry("Explorer", `https://explorer.solana.com/tx/${tx}?cluster=devnet`, icons.link);

      // Post-transaction vault check (Immediate transfer)
      logInfo("Verifying post-deposit vault balance...");
      const postVaultInfo = await provider.connection.getTokenAccountBalance(collateralVault);
      const postVaultBalance = new BN(postVaultInfo.value.amount);
      logEntry("Post Vault Balance", postVaultBalance.toString(), icons.info);

      const expectedBalance = initialVaultBalance.add(depositAmount);
      if (postVaultBalance.eq(expectedBalance)) {
          logSuccess(`Vault balance increased by ${depositAmount.toString()} (Matches expected).`);
      } else {
          logError(`Vault balance mismatch! Expected: ${expectedBalance.toString()}, Found: ${postVaultBalance.toString()}`);
          throw new Error("Vault balance did not increase correctly in deposit transaction.");
      }



      // Wait for MPC computation to finalize (Polling)
      logDivider();
      logInfo("Polling for computation finalization...");
      console.log(chalk.gray("   This happens off-chain on the Arcium network."));
      console.log(chalk.gray("   You can check the computation status on the Arcium explorer or by monitoring the account below."));

      const computationAccInfo = await provider.connection.getAccountInfo(computationAccount);
      if (computationAccInfo) {
          logEntry("Computation Account", "Created", icons.checkmark);
      } else {
          logEntry("Computation Account", "Waiting for creation...", icons.clock);
      }

      // Fetch initial state for comparison
      logInfo("Fetching initial state nonce...");
      const initialObligationAccount = await (program.account as any).userObligation.fetch(userObligation);
      const initialNonce = initialObligationAccount.stateNonce.toNumber();
      logEntry("Initial State Nonce", initialNonce.toString(), icons.info);

      // Polling for Computation Finalization and State Update
      logDivider();
      logInfo("Polling for state update (callback execution)...");
      process.stdout.write("   Waiting for state_nonce to increment");
      
      const maxRetries = 15; // 15 retries * 2s = 30 seconds max
      let callbackCompleted = false;
      let finalObligationAccount: any = null;
      
      for(let i = 0; i < maxRetries; i++) {
          try {
            // Fetch the obligation account to check for updates
            const currentAccount = await (program.account as any).userObligation.fetch(userObligation);
            const currentNonce = currentAccount.stateNonce.toNumber();

            if (currentNonce > initialNonce) {
                console.log(""); 
                logSuccess(`State updated! Nonce incremented from ${initialNonce} to ${currentNonce}`);
                callbackCompleted = true;
                finalObligationAccount = currentAccount;
                break;
            }
          } catch (e) {
             // connection error or account fetch error
          }
          
          process.stdout.write(".");
          await new Promise(r => setTimeout(r, 2000));
      }
      
      if (!callbackCompleted) {
          console.log("");
          logError("Timeout waiting for state update (30s limit reached).");
          console.log(chalk.gray(`   The callback may have failed or the Arcium node is not processing events.`));
          console.log(chalk.gray(`   Fetching recent transactions history for User Obligation account to show failures...`));
          
          try {
               const signatures = await provider.connection.getSignaturesForAddress(userObligation, { limit: 5 });
               if (signatures.length > 0) {
                   logSection("Recent Transactions on User Obligation");
                   for (const sig of signatures) {
                       const status = sig.err ? chalk.red("FAILED") : chalk.green("SUCCESS");
                       const errMsg = sig.err ? `Error: ${JSON.stringify(sig.err)}` : "";
                       console.log(`   ${status} ${sig.signature} ${chalk.gray(errMsg)}`);
                   }
               } else {
                   logWarning("No transactions found on User Obligation account (Callback never landed).");
               }
          } catch (e) {
              logWarning("Failed to fetch transaction history.");
          }

          throw new Error("Deposit failed to finalize within 30s.");
      } else {
          // Check if encrypted deposit is updated
          if (finalObligationAccount) {
              const encDeposit = finalObligationAccount.encryptedDeposit;
              const isZero = Array.isArray(encDeposit) 
                 ? encDeposit.every((b: number) => b === 0)
                 : Buffer.from(encDeposit).every(b => b === 0);
                 
              if (isZero) {
                  logWarning("Encrypted Deposit is still all zeros despite nonce update!");
              } else {
                  logSuccess("Encrypted key updated with non-zero ciphertext.");
              }
          }
          
          logSuccess("Deposit process completed (verified state update).");
      }
      
      // Fetch and display user obligation state
      logSection("Final State");
      try {
        const obligationAccount = await (program.account as any).userObligation.fetch(userObligation);
        logEntry("User", obligationAccount.user.toBase58(), icons.key);
        logEntry("Pool", obligationAccount.pool.toBase58(), icons.link);
        
        // Handle potentially encrypted fields more gracefully if types differ
        const encDeposit = obligationAccount.encryptedDeposit;
        const encBorrow = obligationAccount.encryptedBorrow;
        
        logEntry("Encrypted Deposit", 
            Array.isArray(encDeposit) || Buffer.isBuffer(encDeposit) 
            ? Buffer.from(encDeposit as any).toString('hex').substring(0, 32) + "..." 
            : String(encDeposit), 
            icons.key
        );
        
        logEntry("Encrypted Borrow", 
            Array.isArray(encBorrow) || Buffer.isBuffer(encBorrow) 
            ? Buffer.from(encBorrow as any).toString('hex').substring(0, 32) + "..." 
            : String(encBorrow), 
            icons.key
        );
        
      } catch (error) {
        logError("Failed to decode obligation account data", error);
        throw error;
      }
      logDivider();

    } catch (error: any) {
      logError("Deposit transaction failed", error);
      if (txSig) {
          logEntry("Failed Transaction Signature", txSig, icons.cross);
      }
      
      if (error.logs) {
        logSection("Transaction Logs");
        error.logs.forEach((logLine: string) => Math.random() > 0 ? console.log(chalk.gray(`   ${logLine}`)) : null);
      }
      
      throw error;
    }

  } catch (error) {
    logError("Deposit test failed", error);
    process.exit(1);
  }
}

// Run the test
testDeposit();
