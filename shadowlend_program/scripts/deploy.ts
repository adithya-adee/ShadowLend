#!/usr/bin/env ts-node
/**
 * ShadowLend Devnet Deployment Script
 * 
 * Master script that orchestrates full protocol deployment:
 * 1. Initializes Arcium computation definitions
 * 2. Uses real devnet tokens (wSOL + USDC)
 * 3. Initializes lending pool with vaults
 * 
 * Compatible with:
 * - Arcium SDK v0.6.2
 * - Anchor v0.32.x
 * - @solana/web3.js v1.x
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/deploy.ts
 * 
 * Options:
 *   --skip-comp-defs   Skip computation definition initialization
 *   --skip-pool        Skip pool initialization
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as path from "path";

import {
  // Config
  PROGRAM_ID,
  WSOL_MINT,
  USDC_MINT,
  DEFAULT_POOL_CONFIG,
  COMP_DEF_NAMES,
  // PDA utilities
  deriveAllPoolPdas,
  // Arcium utilities
  initializeArciumEnv,
  getCompDefPda,
  getMXEAccAddress,
  buildFinalizeCompDefTransaction,
  // Common utilities
  setupProvider,
  loadDefaultWallet,
  loadIdl,
  checkBalance,
  detectNetwork,
  saveDeployment,
  printHeader,
  printSeparator,
  isAlreadyInitializedError,
  formatSignature,
} from "./lib";

// ============================================================
// Deployment Steps
// ============================================================

interface CompDefConfig {
  name: string;
  method: string;
  arciumKey: keyof typeof COMP_DEF_NAMES;
}

const COMP_DEFS: CompDefConfig[] = [
  { name: "Deposit", method: "initComputeDepositCompDef", arciumKey: "deposit" },
  { name: "Borrow", method: "initComputeBorrowCompDef", arciumKey: "borrow" },
  { name: "Withdraw", method: "initComputeWithdrawCompDef", arciumKey: "withdraw" },
  { name: "Repay", method: "initComputeRepayCompDef", arciumKey: "repay" },
  // { name: "Liquidate", method: "initComputeLiquidateCompDef", arciumKey: "liquidate" },
  { name: "Interest", method: "initComputeInterestCompDef", arciumKey: "interest" },
];

/**
 * Initializes Arcium computation definitions.
 */
async function initializeCompDefs(
  program: Program<any>,
  payer: anchor.Wallet,
  provider: anchor.AnchorProvider
): Promise<void> {
  printSeparator("Initializing Arcium Computation Definitions");

  // Initialize Arcium environment
  initializeArciumEnv();

  for (const compDef of COMP_DEFS) {
    try {
      console.log(`   • ${compDef.name}...`);

      const compDefPda = getCompDefPda(program.programId, compDef.arciumKey);
      const mxeAccount = getMXEAccAddress(program.programId);

      // Check if already initialized
      const accountInfo = await provider.connection.getAccountInfo(compDefPda);
      if (accountInfo) {
        console.log(`     ⏭️  Already initialized`);
        continue;
      }

      // Initialize computation definition
      const tx = await (program.methods as any)[compDef.method]()
        .accounts({
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          compDefAccount: compDefPda,
          mxeAccount: mxeAccount,
        })
        .rpc();

      console.log(`     ✅ Initialized (tx: ${formatSignature(tx)})`);

      // Finalize the definition
      console.log(`     Finalizing...`);
      const finalizeTx = await buildFinalizeCompDefTransaction(
        provider,
        compDef.arciumKey,
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(payer.payer);

      const finSig = await provider.sendAndConfirm(finalizeTx, [payer.payer]);
      console.log(`     ✅ Finalized (tx: ${formatSignature(finSig)})`);

    } catch (error: any) {
      if (isAlreadyInitializedError(error)) {
        console.log(`     ⏭️  Already initialized`);
      } else {
        console.error(`     ❌ Failed:`, error.message);
        throw error;
      }
    }
  }
}

/**
 * Initializes the lending pool.
 */
async function initializePool(
  program: Program<any>,
  payer: anchor.Wallet,
  collateralMint: PublicKey,
  borrowMint: PublicKey
): Promise<PublicKey> {
  printSeparator("Initializing Lending Pool");

  const pdas = deriveAllPoolPdas(collateralMint, borrowMint);
  const config = DEFAULT_POOL_CONFIG;

  console.log(`   • Pool PDA:         ${pdas.pool.toBase58()}`);
  console.log(`   • Collateral Vault: ${pdas.collateralVault.toBase58()}`);
  console.log(`   • Borrow Vault:     ${pdas.borrowVault.toBase58()}`);
  console.log(`   • LTV:              ${config.ltv / 100}%`);
  console.log(`   • Liq. Threshold:   ${config.liquidationThreshold / 100}%`);
  console.log(`   • Liq. Bonus:       ${config.liquidationBonus / 100}%`);
  console.log(`   • Borrow Rate:      ${config.fixedBorrowRate / 100}% APY`);

  try {
    const tx = await program.methods
      .initializePool(
        config.ltv,
        config.liquidationThreshold,
        config.liquidationBonus,
        new anchor.BN(config.fixedBorrowRate)
      )
      .accountsPartial({
        authority: payer.publicKey,
        pool: pdas.pool,
        collateralMint: collateralMint,
        borrowMint: borrowMint,
        collateralVault: pdas.collateralVault,
        borrowVault: pdas.borrowVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log(`   ✅ Pool initialized (tx: ${formatSignature(tx)})`);
    return pdas.pool;

  } catch (error: any) {
    if (isAlreadyInitializedError(error)) {
      console.log(`   ⏭️  Pool already exists`);
      return pdas.pool;
    }
    throw error;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  printHeader("ShadowLend Devnet Deployment");

  // Parse args
  const args = process.argv.slice(2);
  const skipCompDefs = args.includes("--skip-comp-defs");
  const skipPool = args.includes("--skip-pool");

  // Setup provider
  const provider = setupProvider();
  const connection = provider.connection;

  // Detect network
  const network = await detectNetwork(connection);
  console.log(`\n🌐 Network: ${network}`);

  // Load wallet
  const payer = loadDefaultWallet();
  const wallet = new anchor.Wallet(payer);
  console.log(`👤 Admin:   ${payer.publicKey.toBase58()}`);

  // Check balance
  await checkBalance(connection, payer.publicKey, 0.5);

  // Load program
  const basePath = path.join(__dirname, "..");
  const idl = loadIdl(basePath);
  const program = new Program(idl, provider);

  console.log(`📋 Program: ${program.programId.toBase58()}`);

  // Step 1: Initialize computation definitions
  if (!skipCompDefs) {
    await initializeCompDefs(program, wallet, provider);
  } else {
    console.log("\n⏭️  Skipping computation definitions (--skip-comp-defs)");
  }

  // Step 2: Initialize pool
  const collateralMint = WSOL_MINT;
  const borrowMint = USDC_MINT;

  console.log(`\n🪙  Token Configuration:`);
  console.log(`   • Collateral (wSOL): ${collateralMint.toBase58()}`);
  console.log(`   • Borrow (USDC):     ${borrowMint.toBase58()}`);

  let poolPda: PublicKey;
  if (!skipPool) {
    poolPda = await initializePool(program, wallet, collateralMint, borrowMint);
  } else {
    console.log("\n⏭️  Skipping pool initialization (--skip-pool)");
    poolPda = deriveAllPoolPdas(collateralMint, borrowMint).pool;
  }

  // Derive all PDAs for summary
  const pdas = deriveAllPoolPdas(collateralMint, borrowMint);

  // Save deployment info
  const deploymentInfo = {
    programId: PROGRAM_ID.toBase58(),
    poolPda: poolPda.toBase58(),
    collateralMint: collateralMint.toBase58(),
    borrowMint: borrowMint.toBase58(),
    collateralVault: pdas.collateralVault.toBase58(),
    borrowVault: pdas.borrowVault.toBase58(),
    admin: payer.publicKey.toBase58(),
    deployedAt: new Date().toISOString(),
    network: network,
  };

  saveDeployment(basePath, deploymentInfo);

  // Summary
  printHeader("DEPLOYMENT COMPLETE");
  console.log(`Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`Pool PDA:         ${poolPda.toBase58()}`);
  console.log(`Collateral Mint:  ${collateralMint.toBase58()}`);
  console.log(`Borrow Mint:      ${borrowMint.toBase58()}`);
  console.log(`Collateral Vault: ${pdas.collateralVault.toBase58()}`);
  console.log(`Borrow Vault:     ${pdas.borrowVault.toBase58()}`);
  console.log(`Admin:            ${payer.publicKey.toBase58()}`);
  console.log("═".repeat(60));
  console.log("\n✅ ShadowLend is ready on devnet!");
  console.log("\n💡 Note: Borrow vault requires manual USDC funding for lending.");
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err);
  process.exit(1);
});
