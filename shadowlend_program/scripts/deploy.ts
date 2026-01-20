#!/usr/bin/env ts-node
/**
 * ShadowLend Devnet Deployment Script
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as path from "path";
import chalk from "chalk";

import {
  // Config
  PROGRAM_ID,
  WSOL_MINT,
  USDC_MINT,
  DEFAULT_POOL_CONFIG,
  COMP_DEF_NAMES,
  ARCIUM_CLUSTER_OFFSET,
  // PDA utilities
  deriveAllPoolPdas,
  // Arcium utilities
  initializeArciumEnv,
  getCompDefPda,
  getMXEAccAddress,
  getArciumProgramId,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  buildFinalizeCompDefTransaction,
  // Common utilities
  setupProvider,
  loadDefaultWallet,
  loadIdl,
  checkBalance,
  detectNetwork,
  saveDeployment,
  isAlreadyInitializedError,
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
  { name: "Liquidate", method: "initComputeLiquidateCompDef", arciumKey: "liquidate" },
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
  logSection("Initializing Arcium Computation Definitions");

  // Initialize Arcium environment
  initializeArciumEnv();


  const DEPOSIT_ONLY = COMP_DEFS.filter(d => d.name === "Deposit");

  for (const compDef of DEPOSIT_ONLY) {
    try {
      console.log(chalk.gray(`   ${icons.dot} ${compDef.name}...`));

      const compDefPda = getCompDefPda(program.programId, compDef.arciumKey);
      console.log(chalk.gray(`     PDA: ${compDefPda.toBase58()}`));
      const mxeAccount = getMXEAccAddress(program.programId); 
      
      const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);
      const mempoolAccount = getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET);
      const executingPool = getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET);
      const arciumProgramId = getArciumProgramId();
      console.log(chalk.gray(`     Arcium Program ID: ${arciumProgramId.toBase58()}`));

      let isInitialized = false;

      // Check if already initialized AND owned by Arcium
      const accountInfo = await provider.connection.getAccountInfo(compDefPda);
      if (accountInfo) {
        console.log(chalk.gray(`     Current Owner: ${accountInfo.owner.toBase58()}`));
        if (accountInfo.owner.equals(arciumProgramId)) {
           console.log(chalk.yellow(`     ${icons.warning} Already initialized (Account exists)`));
           isInitialized = true;
        } else {
           console.log(chalk.yellow(`     ${icons.warning} Account exists but not owned by Arcium. Re-initializing...`));
        }
      }

      // Initialize computation definition if needed
      if (!isInitialized) {
        const tx = await (program.methods as any)[compDef.method]()
          .accounts({
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
            compDefAccount: compDefPda,
            mxeAccount: mxeAccount,
            // Arcium required accounts for context
            clusterAccount,
            mempoolAccount,
            executingPool,
          })
          .preInstructions([anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
          .rpc();

        console.log(chalk.green(`     ${icons.checkmark} Initialized (tx: ${formatSignature(tx)})`));
      }

      // Finalize the definition (always try to finalize to ensure it's completed)
      console.log(chalk.gray(`     Finalizing...`));
      try {
        const finalizeTx = await buildFinalizeCompDefTransaction(
          provider,
          compDef.arciumKey,
          program.programId
        );
        
        // Debug: Log keys
        if (finalizeTx.instructions.length > 0) {
            console.log("     Finalize TX Keys:");
            finalizeTx.instructions[0].keys.forEach(k => {
                if (k.pubkey.toBase58() === compDefPda.toBase58()) {
                    console.log(chalk.green(`       - ${k.pubkey.toBase58()} (MATCHES PDA)`));
                } else {
                    console.log(`       - ${k.pubkey.toBase58()}`);
                }
            });
        }

        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(payer.payer);

        const finSig = await provider.sendAndConfirm(finalizeTx, [payer.payer]);
        console.log(chalk.greenBright(`     ${icons.checkmark} Finalized (tx: ${formatSignature(finSig)})`));
      } catch (finalizeError: any) {
        // If it's already finalized or other non-critical error, we might want to warn but continue
        // Arcium doesn't have a specific "AlreadyFinalized" error code easily accessible here usually, 
        // but we can check the error message or just log it as a warning.
        console.log(chalk.yellow(`     ${icons.info} Finalization skipped or failed: ${finalizeError.message}`));
      }

    } catch (error: any) {
      if (isAlreadyInitializedError(error)) {
        console.log(chalk.yellow(`     ${icons.warning} Already initialized`));
      } else {
        logError(`Failed: ${error.message}`);
        throw error;
      }
    }
    console.log(); // spacer
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
  logSection("Initializing Lending Pool");

  const pdas = deriveAllPoolPdas(collateralMint, borrowMint);
  const config = DEFAULT_POOL_CONFIG;

  logEntry("Pool PDA", pdas.pool.toBase58());
  logEntry("Collateral Vault", pdas.collateralVault.toBase58());
  logEntry("Borrow Vault", pdas.borrowVault.toBase58());
  logEntry("LTV", `${config.ltv / 100}%`);
  logEntry("Borrow Rate", `${config.fixedBorrowRate / 100}% APY`);

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

    logSuccess(`Pool initialized (tx: ${formatSignature(tx)})`);
    return pdas.pool;

  } catch (error: any) {
    if (isAlreadyInitializedError(error)) {
      logWarning("Pool already exists");
      return pdas.pool;
    }
    logError("Initialization Failed");
    console.error(error);
    throw error;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  logHeader("ShadowLend Devnet Deployment");

  // Parse args
  const args = process.argv.slice(2);
  const skipCompDefs = args.includes("--skip-comp-defs");
  const skipPool = args.includes("--skip-pool");

  // Setup provider
  const provider = setupProvider();
  const connection = provider.connection;

  logSection("Configuration");
  
  // Detect network
  const network = await detectNetwork(connection);
  logEntry("Network", network, icons.info);

  // Load wallet
  const payer = loadDefaultWallet();
  const wallet = new anchor.Wallet(payer);
  logEntry("Admin", payer.publicKey.toBase58(), icons.key);

  // Check balance
  const balance = await checkBalance(connection, payer.publicKey, 0.5);
  // logEntry("Balance", `${balance.toFixed(4)} SOL`);

  // Load program
  const basePath = path.join(__dirname, "..");
  const idl = loadIdl(basePath);
  const program = new Program(idl, provider);
  logEntry("Program", program.programId.toBase58(), icons.key);
  logDivider();

  // Step 1: Initialize computation definitions
  if (!skipCompDefs) {
    await initializeCompDefs(program, wallet, provider);
  } else {
    logInfo("Skipping computation definitions (--skip-comp-defs)");
  }
  logDivider();

  // Step 2: Initialize pool
  const collateralMint = WSOL_MINT;
  const borrowMint = USDC_MINT;

  logSection("Token Configuration");
  logEntry("Collateral (wSOL)", collateralMint.toBase58());
  logEntry("Borrow (USDC)", borrowMint.toBase58());
  logDivider();

  let poolPda: PublicKey;
  if (!skipPool) {
    poolPda = await initializePool(program, wallet, collateralMint, borrowMint);
  } else {
    logInfo("Skipping pool initialization (--skip-pool)");
    poolPda = deriveAllPoolPdas(collateralMint, borrowMint).pool;
  }
  logDivider();

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
  logHeader("DEPLOYMENT COMPLETE");
  logEntry("Program ID", PROGRAM_ID.toBase58());
  logEntry("Pool PDA", poolPda.toBase58());
  logEntry("Collateral Mint", collateralMint.toBase58());
  logEntry("Borrow Mint", borrowMint.toBase58());
  logEntry("Collateral Vault", pdas.collateralVault.toBase58());
  logEntry("Borrow Vault", pdas.borrowVault.toBase58());
  logEntry("Admin", payer.publicKey.toBase58());
  
  logSuccess("ShadowLend is ready on devnet!");
  logInfo("Note: Borrow vault requires manual USDC funding for lending.");
  logDivider();
}

main().catch((err) => {
  logError(`Deployment failed: ${err.message}`);
  process.exit(1);
});
