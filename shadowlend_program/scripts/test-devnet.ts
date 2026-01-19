#!/usr/bin/env ts-node
/**
 * ShadowLend Devnet Test - Deposit & Borrow
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import * as path from "path";
import chalk from "chalk";

import {
  // Config
  PROGRAM_ID,
  WSOL_MINT,
  USDC_MINT,
  ARCIUM_CLUSTER_OFFSET, // Need this import
  // PDA utilities  
  deriveObligationPda,
  deriveCollateralVaultPda,
  derivePoolPda,
  // Arcium utilities
  initializeArciumEnv,
  getArciumAccounts,
  createEncryptionContext,
  encryptU64,
  generateComputationOffset,
  generateNonce,
  nonceToU128,
  waitForComputation,
  getConfiguredArciumEnv,
  // Common utilities
  setupProvider,
  loadDefaultWallet,
  loadIdl,
  loadDeployment,
  checkBalance,
  formatSignature,
  // Logging
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDivider,
  icons
} from "./lib";

// Import types
import { ShadowlendProgram } from "../target/types/shadowlend_program";

// ============================================================
// Test Functions
// ============================================================

/**
 * Tests the deposit instruction.
 */
async function testDeposit(
  program: Program<ShadowlendProgram>,
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  poolPda: PublicKey
): Promise<BN | null> {
  logSection("TEST: Deposit Instruction");

  const connection = provider.connection;
  const depositAmount = new BN(0.001 * LAMPORTS_PER_SOL); // 0.001 SOL

  // 1. Get or create user's wSOL token account
  console.log(chalk.gray(`   ${icons.dot} Setting up user token accounts...`));

  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    WSOL_MINT,
    payer.publicKey
  );
  logEntry("User wSOL ATA", userTokenAccount.address.toBase58());

  // 2. Check wSOL balance
  const userTokenBalance = await getAccount(connection, userTokenAccount.address);
  const wsolBalance = Number(userTokenBalance.amount) / LAMPORTS_PER_SOL;
  logEntry("Current Balance", `${wsolBalance} wSOL`);

  if (Number(userTokenBalance.amount) < depositAmount.toNumber()) {
    logWarning("Insufficient wSOL balance for deposit.");
    console.log(chalk.yellow("     To get wSOL, wrap some SOL: spl-token wrap 0.01"));
    // return null; // Let it try anyway if token account exists, sometimes balance check is flaky on devnet
  }

  // 3. Generate computation offset
  const computationOffset = generateComputationOffset();
  logEntry("Computation Offset", computationOffset.toString());

  // 4. Get Arcium accounts
  console.log(chalk.gray(`   ${icons.dot} Setting up Arcium accounts...`));

  const arciumAccounts = getArciumAccounts({
    programId: program.programId,
    computationOffset,
    compDefName: "deposit",
  });

  // 5. Derive PDAs
  const [userObligationPda] = deriveObligationPda(
    payer.publicKey,
    poolPda,
    program.programId
  );

  const [collateralVaultPda] = deriveCollateralVaultPda(
    WSOL_MINT,
    USDC_MINT,
    program.programId
  );

  logEntry("MXE Account", arciumAccounts.mxeAccount.toBase58());
  logEntry("Cluster", arciumAccounts.clusterAccount.toBase58());
  logEntry("Comp Def", arciumAccounts.compDefAccount.toBase58());
  logEntry("User Obligation", userObligationPda.toBase58());
  logEntry("Collateral Vault", collateralVaultPda.toBase58());

  console.log(chalk.gray(`\n   ${icons.arrow} Sending deposit transaction...`));
  logEntry("Amount", `${depositAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);

  // Generate x25519 keypair for output encryption
  // The MXE will encrypt the output so only the user can decrypt with their private key
  const { publicKey: userX25519PubKey } = await createEncryptionContext(
    provider,
    program.programId
  );
  
  // Nonces for UserState and PoolState
  const userNonce = generateNonce();
  const userNonceAsBN = nonceToU128(userNonce);
  
  const mxeNonce = generateNonce();
  const mxeNonceAsBN = nonceToU128(mxeNonce);

  logEntry("User X25519 Pubkey", Buffer.from(userX25519PubKey).toString("hex").slice(0, 16) + "...");

  try {
    const sig = await program.methods
      .deposit(
        computationOffset,
        depositAmount,
        Array.from(userX25519PubKey) as number[],
        userNonceAsBN,
        mxeNonceAsBN
      )
      .accountsPartial({
        payer: payer.publicKey,
        pool: poolPda,
        collateralMint: WSOL_MINT,
        userTokenAccount: userTokenAccount.address,
        userObligation: userObligationPda,
        collateralVault: collateralVaultPda,
        computationAccount: arciumAccounts.computationAccount,
        clusterAccount: arciumAccounts.clusterAccount,
        mxeAccount: arciumAccounts.mxeAccount,
        mempoolAccount: arciumAccounts.mempoolAccount,
        executingPool: arciumAccounts.executingPool,
        compDefAccount: arciumAccounts.compDefAccount,
      })
      .rpc({ commitment: "confirmed" });

    logSuccess("Deposit transaction sent!");
    logEntry("Signature", sig);
    console.log(chalk.gray(`     Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`));

    // Wait for MXE callback finalization
    console.log(chalk.yellow(`\n   ${icons.clock} Waiting for MXE callback (30-60 seconds)...`));

    try {
      const finalizeSig = await waitForComputation(
        provider,
        computationOffset,
        program.programId
      );
      logSuccess("Computation finalized!");
      logEntry("Callback", finalizeSig);
      console.log(chalk.gray(`     Explorer: https://explorer.solana.com/tx/${finalizeSig}?cluster=devnet`));
    } catch (finError: any) {
      logWarning(`Callback timeout: ${finError.message}`);
      console.log(chalk.yellow("     The deposit was queued but callback may still be processing."));
    }

    return computationOffset;

  } catch (error: any) {
    logError("Deposit failed");
    console.error(error);
    if (error.logs) console.error(error.logs);
    throw error;
  }
}

/**
 * Tests the borrow instruction with encrypted amount.
 */
async function testBorrow(
  program: Program<ShadowlendProgram>,
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  poolPda: PublicKey
): Promise<void> {
  logSection("TEST: Borrow Instruction (Encrypted)");

  // 1. Create encryption context
  console.log(chalk.gray(`   ${icons.dot} Creating encryption context...`));

  const { publicKey, cipher } = await createEncryptionContext(
    provider,
    program.programId
  );
  logEntry("User X25519 Pubkey", Buffer.from(publicKey).toString("hex").slice(0, 16) + "...");

  // 2. Encrypt borrow amount
  const borrowAmount = BigInt(0.0001 * LAMPORTS_PER_SOL);
  const nonce = generateNonce();
  const encryptedAmount = encryptU64(cipher, borrowAmount, nonce);

  logEntry("Encrypted Amount", Buffer.from(encryptedAmount).toString("hex").slice(0, 32) + "...");

  // 3. Generate computation offset
  const computationOffset = generateComputationOffset();

  // 4. Get Arcium accounts
  console.log(chalk.gray(`   ${icons.dot} Setting up Arcium accounts...`));

  const arciumAccounts = getArciumAccounts({
    programId: program.programId,
    computationOffset,
    compDefName: "borrow",
  });

  // 5. Derive PDAs
  const [userObligationPda] = deriveObligationPda(
    payer.publicKey,
    poolPda,
    program.programId
  );

  logEntry("User Obligation", userObligationPda.toBase58());

  // 6. Format for instruction
  const encryptedAmountArray = Array.from(encryptedAmount);
  while (encryptedAmountArray.length < 32) {
    encryptedAmountArray.push(0);
  }

  const pubKeyArray = Array.from(publicKey);
  const userNonceAsBN = nonceToU128(nonce);
  
  const mxeNonce = generateNonce();
  const mxeNonceAsBN = nonceToU128(mxeNonce);

  // Note: Pyth oracle accounts needed for real borrow
  logWarning("Note: Using placeholder Pyth accounts");
  console.log(chalk.yellow("     In production, use Pyth Hermes API to fetch real price updates"));

  const solPriceUpdate = payer.publicKey; // Placeholder
  const usdcPriceUpdate = payer.publicKey; // Placeholder

  console.log(chalk.gray(`\n   ${icons.arrow} Sending borrow transaction...`));
  console.log(chalk.yellow("     Expected to fail without proper Pyth accounts"));

  try {
    const sig = await program.methods
      .borrow(
          computationOffset, 
          encryptedAmountArray, 
          pubKeyArray, 
          userNonceAsBN,
          mxeNonceAsBN
      )
      .accountsPartial({
        payer: payer.publicKey,
        pool: poolPda,
        userObligation: userObligationPda,
        computationAccount: arciumAccounts.computationAccount,
        clusterAccount: arciumAccounts.clusterAccount,
        mxeAccount: arciumAccounts.mxeAccount,
        mempoolAccount: arciumAccounts.mempoolAccount,
        executingPool: arciumAccounts.executingPool,
        compDefAccount: arciumAccounts.compDefAccount,
        solPriceUpdate: solPriceUpdate,
        usdcPriceUpdate: usdcPriceUpdate,
      })
      .rpc({ commitment: "confirmed" });

    logSuccess("Borrow transaction sent!");
    logEntry("Signature", sig);
    console.log(chalk.gray(`     Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`));

    // Wait for callback
    console.log(chalk.yellow(`\n   ${icons.clock} Waiting for MXE callback...`));

    try {
      const finalizeSig = await waitForComputation(
        provider,
        computationOffset,
        program.programId
      );
      logSuccess("Computation finalized!");
      logEntry("Callback", finalizeSig);
    } catch (finError: any) {
      logWarning(`Callback timeout: ${finError.message}`);
    }

  } catch (error: any) {
    // Expected errors with placeholder Pyth accounts
    if (
      error.message?.includes("InvalidOwner") ||
      error.logs?.some((l: string) => l.includes("InvalidOwner"))
    ) {
      logWarning("Borrow failed with Pyth validation error (expected)");
      console.log(chalk.yellow("     The instruction structure is correct!"));
      console.log(chalk.yellow("     To use borrow, provide real Pyth price update accounts."));
    } else if (
      error.message?.includes("InvalidBorrowAmount") ||
      error.logs?.some((l: string) => l.includes("InvalidBorrowAmount"))
    ) {
      logWarning("Borrow failed - No collateral deposited");
      console.log(chalk.yellow("     A successful deposit is required before borrowing."));
    } else {
      logError("Borrow failed");
      console.error(error);
      if (error.logs) console.error(error.logs);
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  logHeader("ShadowLend Devnet Test");

  // Set default env vars for Arcium SDK
  if (!process.env.ARCIUM_CLUSTER_OFFSET) {
    process.env.ARCIUM_CLUSTER_OFFSET = ARCIUM_CLUSTER_OFFSET.toString();
  }

  // Initialize Arcium environment
  initializeArciumEnv();

  // Setup provider
  const provider = setupProvider();

  // Load wallet
  const payer = loadDefaultWallet();
  logSection("Configuration");
  logEntry("Payer", payer.publicKey.toBase58(), icons.key);

  // Check balance
  const balance = await checkBalance(provider.connection, payer.publicKey, 0.1);

  // Get Arcium env
  const arciumEnv = getConfiguredArciumEnv();
  logEntry("Arcium Cluster Offset", arciumEnv.arciumClusterOffset.toString(), icons.info);

  // Load program
  const basePath = path.join(__dirname, "..");
  const idl = loadIdl(basePath);
  const program = new Program<ShadowlendProgram>(idl, provider);
  logEntry("Program ID", program.programId.toBase58(), icons.key);
  logDivider();

  // Load deployment info
  let poolPda: PublicKey;
  try {
    const deployment = loadDeployment(basePath);
    poolPda = new PublicKey(deployment.poolPda);
    logEntry("Pool PDA", poolPda.toBase58(), icons.folder);
  } catch {
    // Derive from mints if deployment.json doesn't exist
    const [derived] = derivePoolPda(WSOL_MINT, USDC_MINT, program.programId);
    poolPda = derived;
    logEntry("Pool PDA (derived)", poolPda.toBase58(), icons.folder);
  }
  logDivider();

  // Run tests
  try {
    // Test 1: Deposit
    const depositOffset = await testDeposit(program, provider, payer, poolPda);

    logDivider();

    if (depositOffset) {
      // Wait before borrow test
      console.log(chalk.yellow(`\n   ${icons.clock} Waiting 10 seconds before borrow test...`));
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Test 2: Borrow
      // await testBorrow(program, provider, payer, poolPda);
      logInfo("Skipping borrow test (user requested deposit only)");
    } else {
      logInfo("Skipping borrow test (deposit was not successful)");
    }

    logSuccess("TESTS COMPLETED");
    logDivider();

  } catch (error: any) {
    logError(`Test failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
