import { Wallet, BN, Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
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
import { getMxeAccount, getArciumProgramInstance, generateComputationOffset, waitForComputationFinalization } from "../utils/arcium";
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
    const depositAmount = new BN(100_000); // 0.1 tokens (assuming 6 decimals)
    const computationOffset = generateComputationOffset();

    // Generate encryption parameters (X25519 keypair for encryption)
    const userKeypair = Keypair.generate();
    const userPubkey = Array.from(userKeypair.publicKey.toBytes()).slice(0, 32);
    // Convert to BN for proper serialization (u128 in Rust)
    const userNonce = new BN(Date.now()).mul(new BN(1000000));

    logSection("Deposit Parameters");
    logEntry("Amount", depositAmount.toString(), icons.arrow);
    logEntry("Computation Offset", computationOffset.toString(), icons.clock);
    logEntry("User Nonce", userNonce.toString(), icons.key);

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

    // Get strictly derived Arcium addresses from SDK
    const poolAccount = getFeePoolAccAddress();
    const clockAccount = getClockAccAddress();
    const arciumProgramId = getArciumProgramId();

    logDivider();
    logInfo("Executing deposit transaction...");
    logInfo("This sends the request to Arcium nodes...");

    // Execute deposit instruction
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
          mempoolAccount,
          executingPool,
          computationAccount,
          compDefAccount,
          clusterAccount,
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

      logSuccess("Transaction submitted!");
      logEntry("Signature", tx, icons.rocket);

      // Log Explorer URL
      logSuccess("Transaction confirmed on-chain!");
      logEntry("Explorer", `https://explorer.solana.com/tx/${tx}?cluster=devnet`, icons.link);

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

      // Polling for Compuation Finalization and Obligation Creation
      // The Arcium network will execute the request and callback to our program.
      // Our program's callback instruction creates/updates the UserObligation account.
      
      const maxRetries = 60; // Wait up to ~2 minutes
      let obligationFound = false;
      
      process.stdout.write("   Waiting for obligation account creation");
      
      for(let i = 0; i < maxRetries; i++) {
          const obligationAccountInfo = await provider.connection.getAccountInfo(userObligation);
          
          if (obligationAccountInfo) {
              console.log(""); // Newline
              logEntry("User Obligation", "Created successfully", icons.checkmark);
              obligationFound = true;
              break;
          }
          
          process.stdout.write(".");
          await new Promise(r => setTimeout(r, 2000));
      }
      
      if (!obligationFound) {
          console.log("");
          logWarning("User obligation account was not found after waiting.");
          console.log(chalk.gray("   This might mean the Arcium computation failed or is still processing."));
          console.log(chalk.gray(`   Check the Arcium Explorer for computation: ${computationAccount.toBase58()}`));
      } else {
          logSuccess("Deposit completed and verified successfully!");
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
      }
      logDivider();

    } catch (error: any) {
      logError("Deposit transaction failed", error);
      
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
