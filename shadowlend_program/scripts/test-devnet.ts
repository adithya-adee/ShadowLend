#!/usr/bin/env ts-node
/**
 * ShadowLend Devnet Test - Deposit & Borrow
 * 
 * Tests the deployed program on devnet following Arcium SDK patterns.
 * 
 * Compatible with:
 * - Arcium SDK v0.5.4
 * - Anchor v0.32.x
 * - @solana/web3.js v1.x
 * 
 * Usage:
 *   ARCIUM_CLUSTER_OFFSET=123 \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/test-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import * as path from "path";

import {
  // Config
  PROGRAM_ID,
  WSOL_MINT,
  USDC_MINT,
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
  printHeader,
  formatSignature,
  logTransactionError,
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
  printHeader("TEST: Deposit Instruction");

  const connection = provider.connection;
  const depositAmount = new BN(0.001 * LAMPORTS_PER_SOL); // 0.001 SOL

  // 1. Get or create user's wSOL token account
  console.log("\n📝 Setting up user token accounts...");

  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    WSOL_MINT,
    payer.publicKey
  );
  console.log(`   User wSOL ATA: ${userTokenAccount.address.toBase58()}`);

  // 2. Check wSOL balance
  const userTokenBalance = await getAccount(connection, userTokenAccount.address);
  const wsolBalance = Number(userTokenBalance.amount) / LAMPORTS_PER_SOL;
  console.log(`   Current wSOL balance: ${wsolBalance} wSOL`);

  if (Number(userTokenBalance.amount) < depositAmount.toNumber()) {
    console.log("   ⚠️  Insufficient wSOL balance for deposit.");
    console.log("   To get wSOL, wrap some SOL:");
    console.log("   spl-token wrap 0.01");
    return null;
  }

  // 3. Generate computation offset
  const computationOffset = generateComputationOffset();
  console.log(`\n🔢 Computation offset: ${computationOffset.toString()}`);

  // 4. Get Arcium accounts
  console.log("\n🔐 Setting up Arcium accounts...");

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

  console.log(`   MXE Account: ${arciumAccounts.mxeAccount.toBase58()}`);
  console.log(`   Cluster: ${arciumAccounts.clusterAccount.toBase58()}`);
  console.log(`   Comp Def: ${arciumAccounts.compDefAccount.toBase58()}`);
  console.log(`   User Obligation: ${userObligationPda.toBase58()}`);
  console.log(`   Collateral Vault: ${collateralVaultPda.toBase58()}`);

  console.log("\n📤 Sending deposit transaction...");
  console.log(`   Amount: ${depositAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);

  try {
    const sig = await program.methods
      .deposit(computationOffset, depositAmount)
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

    console.log(`\n✅ Deposit transaction sent!`);
    console.log(`   Signature: ${sig}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

    // Wait for MXE callback finalization
    console.log(`\n⏳ Waiting for MXE callback (30-60 seconds)...`);

    try {
      const finalizeSig = await waitForComputation(
        provider,
        computationOffset,
        program.programId
      );
      console.log(`\n✅ Computation finalized!`);
      console.log(`   Callback: ${finalizeSig}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${finalizeSig}?cluster=devnet`);
    } catch (finError: any) {
      console.log(`\n⚠️  Callback timeout: ${finError.message}`);
      console.log(`   The deposit was queued but callback may still be processing.`);
    }

    return computationOffset;

  } catch (error: any) {
    console.error("\n❌ Deposit failed:");
    logTransactionError(error);
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
  printHeader("TEST: Borrow Instruction (Encrypted)");

  // 1. Create encryption context
  console.log("\n🔐 Creating encryption context...");

  const { publicKey, cipher } = await createEncryptionContext(
    provider,
    program.programId
  );
  console.log(`   User x25519 public key: ${Buffer.from(publicKey).toString("hex").slice(0, 16)}...`);

  // 2. Encrypt borrow amount
  const borrowAmount = BigInt(0.0001 * LAMPORTS_PER_SOL);
  const nonce = generateNonce();
  const encryptedAmount = encryptU64(cipher, borrowAmount, nonce);

  console.log(`   Encrypted amount: ${Buffer.from(encryptedAmount).toString("hex").slice(0, 32)}...`);

  // 3. Generate computation offset
  const computationOffset = generateComputationOffset();

  // 4. Get Arcium accounts
  console.log("\n🔐 Setting up Arcium accounts...");

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

  console.log(`   User Obligation: ${userObligationPda.toBase58()}`);

  // 6. Format for instruction
  const encryptedAmountArray = Array.from(encryptedAmount);
  while (encryptedAmountArray.length < 32) {
    encryptedAmountArray.push(0);
  }

  const pubKeyArray = Array.from(publicKey);
  const nonceAsBN = nonceToU128(nonce);

  // Note: Pyth oracle accounts needed for real borrow
  console.log("\n⚠️  Note: Using placeholder Pyth accounts");
  console.log("   In production, use Pyth Hermes API to fetch real price updates");

  const solPriceUpdate = payer.publicKey; // Placeholder
  const usdcPriceUpdate = payer.publicKey; // Placeholder

  console.log("\n📤 Sending borrow transaction...");
  console.log("   ⚠️  Expected to fail without proper Pyth accounts");

  try {
    const sig = await program.methods
      .borrow(computationOffset, encryptedAmountArray, pubKeyArray, nonceAsBN)
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

    console.log(`\n✅ Borrow transaction sent!`);
    console.log(`   Signature: ${sig}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

    // Wait for callback
    console.log(`\n⏳ Waiting for MXE callback...`);

    try {
      const finalizeSig = await waitForComputation(
        provider,
        computationOffset,
        program.programId
      );
      console.log(`\n✅ Computation finalized!`);
      console.log(`   Callback: ${finalizeSig}`);
    } catch (finError: any) {
      console.log(`\n⚠️  Callback timeout: ${finError.message}`);
    }

  } catch (error: any) {
    // Expected errors with placeholder Pyth accounts
    if (
      error.message?.includes("InvalidOwner") ||
      error.logs?.some((l: string) => l.includes("InvalidOwner"))
    ) {
      console.log("\n⚠️  Borrow failed with Pyth validation error (expected)");
      console.log("   The instruction structure is correct!");
      console.log("   To use borrow, provide real Pyth price update accounts.");
    } else if (
      error.message?.includes("InvalidBorrowAmount") ||
      error.logs?.some((l: string) => l.includes("InvalidBorrowAmount"))
    ) {
      console.log("\n⚠️  Borrow failed - No collateral deposited");
      console.log("   A successful deposit is required before borrowing.");
    } else {
      console.error("\n❌ Borrow failed:");
      logTransactionError(error);
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  printHeader("ShadowLend Devnet Test");

  // Initialize Arcium environment
  initializeArciumEnv();

  // Setup provider
  const provider = setupProvider();

  // Load wallet
  const payer = loadDefaultWallet();
  console.log(`\n👤 Payer: ${payer.publicKey.toBase58()}`);

  // Check balance
  await checkBalance(provider.connection, payer.publicKey, 0.1);

  // Get Arcium env
  const arciumEnv = getConfiguredArciumEnv();
  console.log(`🔐 Arcium cluster offset: ${arciumEnv.arciumClusterOffset}`);

  // Load program
  const basePath = path.join(__dirname, "..");
  const idl = loadIdl(basePath);
  const program = new Program<ShadowlendProgram>(idl, provider);

  console.log(`\n📋 Program ID: ${program.programId.toBase58()}`);

  // Load deployment info
  let poolPda: PublicKey;
  try {
    const deployment = loadDeployment(basePath);
    poolPda = new PublicKey(deployment.poolPda);
    console.log(`📋 Pool PDA: ${poolPda.toBase58()}`);
  } catch {
    // Derive from mints if deployment.json doesn't exist
    const [derived] = derivePoolPda(WSOL_MINT, USDC_MINT, program.programId);
    poolPda = derived;
    console.log(`📋 Pool PDA (derived): ${poolPda.toBase58()}`);
  }

  // Run tests
  try {
    // Test 1: Deposit
    const depositOffset = await testDeposit(program, provider, payer, poolPda);

    if (depositOffset) {
      // Wait before borrow test
      console.log("\n⏳ Waiting 10 seconds before borrow test...");
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Test 2: Borrow
      await testBorrow(program, provider, payer, poolPda);
    } else {
      console.log("\n⏭️  Skipping borrow test (deposit was not successful)");
    }

    printHeader("TESTS COMPLETED");

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
