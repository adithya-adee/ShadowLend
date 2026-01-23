import { Wallet, BN, Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
import { createProvider, getNetworkConfig, loadProgram, log, logSuccess, logError } from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { getMxeAccount, getArciumProgramInstance, generateComputationOffset, waitForComputationFinalization } from "../utils/arcium";
import * as idl from "../../target/idl/shadowlend_program.json";

const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

/**
 * Test deposit instruction
 */
async function testDeposit() {
  try {
    const config = getNetworkConfig();
    log(`Testing deposit on ${config.name}...`);

    // Load wallet
    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    log(`Using wallet: ${wallet.publicKey.toBase58()}`);

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

    log(`Program ID: ${programId.toBase58()}`);
    log(`Pool: ${poolPda.toBase58()}`);
    log(`Collateral Mint: ${collateralMint.toBase58()}`);

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

    log(`User Obligation: ${userObligation.toBase58()}`);
    log(`Collateral Vault: ${collateralVault.toBase58()}`);

    // Get or create user token account
    const userTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );

    log(`User Token Account: ${userTokenAccount.toBase58()}`);

    // Check if user has tokens
    try {
      const tokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
      log(`User token balance: ${tokenAccountInfo.amount.toString()}`);
      
      if (tokenAccountInfo.amount === 0n) {
        logError("User has no tokens to deposit. Please fund the token account first.");
        log(`\nTo fund your account with devnet USDC, you can:`);
        log(`1. Use a devnet faucet`);
        log(`2. Or use: spl-token mint ${collateralMint.toBase58()} 1000000 ${userTokenAccount.toBase58()}`);
        process.exit(1);
      }
    } catch (error: any) {
      if (error.message?.includes("could not find account")) {
        logError("User token account does not exist. Creating it...");
        
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

    log(`\n📝 Deposit Parameters:`);
    log(`   Amount: ${depositAmount.toString()}`);
    log(`   Computation Offset: ${computationOffset.toString()}`);
    log(`   User Nonce: ${userNonce.toString()}`);

    // Get MXE and Arcium accounts
    const mxeAccount = getMxeAccount(programId);
    const arciumProgram = getArciumProgramInstance(provider);
    
    log(`   MXE Account: ${mxeAccount.toBase58()}`);

    // Derive Arcium-related accounts
    const [mempoolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("Mempool"), mxeAccount.toBuffer()],
      arciumProgram.programId
    );

    const [executingPool] = PublicKey.findProgramAddressSync(
      [Buffer.from("ExecutingPool"), mxeAccount.toBuffer()],
      arciumProgram.programId
    );

    const [computationAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("ComputationAccount"),
        mxeAccount.toBuffer(),
        computationOffset.toArrayLike(Buffer, "le", 8),
      ],
      arciumProgram.programId
    );

    const [compDefAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("computation_definition"),
        mxeAccount.toBuffer(),
        Buffer.from("deposit"),
      ],
      arciumProgram.programId
    );

    const [clusterAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("Cluster"), new BN(config.arciumClusterOffset).toArrayLike(Buffer, "le", 8)],
      arciumProgram.programId
    );

    // Arcium pool and clock accounts (from IDL)
    const poolAccount = new PublicKey("G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC");
    const clockAccount = new PublicKey("7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot");

    log(`\n🔄 Executing deposit transaction...`);

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
          userTokenAccount,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          arciumProgram: ARCIUM_PROGRAM_ID,
        })
        .rpc();

      log(`Transaction signature: ${tx}`);
      logSuccess("Deposit transaction submitted!");

      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, "confirmed");
      logSuccess("Transaction confirmed!");

      // Wait for MPC computation to finalize
      log(`\n⏳ Waiting for MPC computation to finalize...`);
      await waitForComputationFinalization(
        provider,
        computationOffset,
        programId,
        120000, // 2 minutes timeout
        3000    // Poll every 3 seconds
      );

      logSuccess("\n✅ Deposit completed successfully!");
      
      // Fetch and display user obligation state
      log(`\n📊 Fetching user obligation state...`);
      try {
        const obligationAccount = await (program.account as any).userObligation.fetch(userObligation);
        log(`User Obligation:`);
        log(`   User: ${obligationAccount.user.toBase58()}`);
        log(`   Pool: ${obligationAccount.pool.toBase58()}`);
        log(`   Encrypted Collateral: ${Buffer.from(obligationAccount.encryptedCollateral as any).toString('hex').substring(0, 32)}...`);
        log(`   Encrypted Debt: ${Buffer.from(obligationAccount.encryptedDebt as any).toString('hex').substring(0, 32)}...`);
      } catch (error) {
        log(`   Could not fetch obligation account (may not exist yet)`);
      }

    } catch (error: any) {
      logError("Deposit transaction failed", error);
      
      if (error.logs) {
        log("\n📋 Transaction Logs:");
        error.logs.forEach((logLine: string) => log(`   ${logLine}`));
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
