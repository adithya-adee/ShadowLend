#!/usr/bin/env ts-node
/**
 * ShadowLend Deployment Verification Script
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import * as path from "path";

import {
  PROGRAM_ID,
  setupProvider,
  loadDeployment,
  loadIdl,
  logHeader,
  logSection,
  logEntry,
  logSuccess,
  logError,
  logWarning,
  logDivider,
  icons
} from "./lib";

async function main() {
  logHeader("Deployment Verification");

  // Load provider
  const provider = setupProvider();
  const connection = provider.connection;

  // Load deployment info
  let deployment: any;
  const basePath = path.join(__dirname, "..");
  
  try {
    deployment = loadDeployment(basePath);
  } catch {
    logError("deployment.json not found. Run 'npm run deploy' first.");
    process.exit(1);
  }

  logSection("Deployment Metadata");
  logEntry("Deployed At", deployment.deployedAt, icons.clock);
  logEntry("Network", deployment.network, icons.info);
  logDivider();

  // Load IDL
  const idl = loadIdl(basePath);
  const program = new Program(idl, provider) as any;

  let allPassed = true;
  let warnings: string[] = [];

  logSection("Account Verification");

  // Check 1: Program exists
  const programInfo = await connection.getAccountInfo(
    new PublicKey(deployment.programId)
  );
  if (programInfo) {
    logSuccess(`Program Found`);
    logEntry("Size", `${programInfo.data.length} bytes`);
  } else {
    logError(`Program NOT FOUND`);
    allPassed = false;
  }
  logDivider();

  // Check 2: Pool account
  try {
    const pool = await program.account.pool.fetch(
      new PublicKey(deployment.poolPda)
    );
    logSuccess(`Pool Initialized`);
    logEntry("Address", deployment.poolPda.slice(0, 20) + "...");
    logEntry("Authority", pool.authority.toBase58().slice(0, 20) + "...");
    logEntry("LTV", `${pool.ltv / 100}%`);
    logEntry("Borrow Rate", `${Number(pool.fixedBorrowRate) / 100}% APY`);
  } catch (e) {
    logError(`Pool NOT FOUND or invalid`);
    allPassed = false;
  }
  logDivider();

  // Check 3: Collateral vault
  try {
    const collateralVault = await getAccount(
      connection,
      new PublicKey(deployment.collateralVault)
    );
    logSuccess(`Collateral Vault Found`);
    logEntry("Address", deployment.collateralVault.slice(0, 20) + "...");
    logEntry("Balance", `${Number(collateralVault.amount) / 1e9} wSOL`);
  } catch (e) {
    logError(`Collateral Vault NOT FOUND`);
    allPassed = false;
  }
  logDivider();

  // Check 4: Borrow vault
  try {
    const borrowVault = await getAccount(
      connection,
      new PublicKey(deployment.borrowVault)
    );
    logSuccess(`Borrow Vault Found`);
    logEntry("Address", deployment.borrowVault.slice(0, 20) + "...");
    logEntry("Balance", `${Number(borrowVault.amount) / 1e6} USDC`);

    if (Number(borrowVault.amount) === 0) {
      warnings.push("Borrow vault is empty - users cannot borrow");
    }
  } catch (e) {
    logError(`Borrow Vault NOT FOUND`);
    allPassed = false;
  }
  logDivider();

  // Check 5: Mints
  const collateralMintInfo = await connection.getAccountInfo(
    new PublicKey(deployment.collateralMint)
  );
  if (collateralMintInfo) {
    logSuccess(`Collateral Mint Found`);
  } else {
    logError(`Collateral Mint NOT FOUND`);
    allPassed = false;
  }

  const borrowMintInfo = await connection.getAccountInfo(
    new PublicKey(deployment.borrowMint)
  );
  if (borrowMintInfo) {
    logSuccess(`Borrow Mint Found`);
  } else {
    logError(`Borrow Mint NOT FOUND`);
    allPassed = false;
  }
  logDivider();

  // Warnings
  if (warnings.length > 0) {
    logWarning("Verification Warnings:");
    warnings.forEach((w) => console.log(`   • ${w}`));
    logDivider();
  }

  if (allPassed) {
    logSuccess("✅ All checks passed! Deployment is valid.");
  } else {
    logError("❌ Some checks failed. See above for details.");
    process.exit(1);
  }
  logDivider();
}

main().catch((err) => {
  logError(`Verification failed: ${err.message}`);
  process.exit(1);
});
