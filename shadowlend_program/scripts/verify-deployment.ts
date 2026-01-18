#!/usr/bin/env ts-node
/**
 * ShadowLend Deployment Verification Script
 * 
 * Verifies all PDAs and accounts are correctly initialized.
 * 
 * Compatible with:
 * - Arcium SDK v0.6.2
 * - Anchor v0.32.x
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/verify-deployment.ts
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
  printHeader,
} from "./lib";

// ============================================================
// Main
// ============================================================

async function main() {
  printHeader("ShadowLend Deployment Verification");

  // Load provider
  const provider = setupProvider();
  const connection = provider.connection;

  // Load deployment info
  const basePath = path.join(__dirname, "..");
  let deployment: any;
  
  try {
    deployment = loadDeployment(basePath);
  } catch {
    console.error("\n❌ deployment.json not found.");
    console.error("   Run 'npm run deploy' first.");
    process.exit(1);
  }

  console.log(`\n📅 Deployed: ${deployment.deployedAt}`);
  console.log(`🌐 Network:  ${deployment.network}`);

  // Load IDL
  const idl = loadIdl(basePath);
  const program = new Program(idl, provider) as any;

  let allPassed = true;
  let warnings: string[] = [];

  console.log("\n📋 Checking accounts...\n");

  // Check 1: Program exists
  const programInfo = await connection.getAccountInfo(
    new PublicKey(deployment.programId)
  );
  if (programInfo) {
    console.log(`✅ Program:          ${deployment.programId.slice(0, 20)}...`);
    console.log(`   • Size:           ${programInfo.data.length} bytes`);
  } else {
    console.log(`❌ Program:          NOT FOUND`);
    allPassed = false;
  }

  // Check 2: Pool account
  try {
    const pool = await program.account.pool.fetch(
      new PublicKey(deployment.poolPda)
    );
    console.log(`✅ Pool:             ${deployment.poolPda.slice(0, 20)}...`);
    console.log(`   • Authority:      ${pool.authority.toBase58().slice(0, 20)}...`);
    console.log(`   • LTV:            ${pool.ltv / 100}%`);
    console.log(`   • Liq. Threshold: ${pool.liquidationThreshold / 100}%`);
    console.log(`   • Liq. Bonus:     ${pool.liquidationBonus / 100}%`);
    console.log(`   • Borrow Rate:    ${Number(pool.fixedBorrowRate) / 100}% APY`);
  } catch (e) {
    console.log(`❌ Pool:             NOT FOUND or invalid`);
    allPassed = false;
  }

  // Check 3: Collateral vault
  try {
    const collateralVault = await getAccount(
      connection,
      new PublicKey(deployment.collateralVault)
    );
    console.log(`✅ Collateral Vault: ${deployment.collateralVault.slice(0, 20)}...`);
    console.log(`   • Balance:        ${Number(collateralVault.amount) / 1e9} wSOL`);
  } catch (e) {
    console.log(`❌ Collateral Vault: NOT FOUND`);
    allPassed = false;
  }

  // Check 4: Borrow vault
  try {
    const borrowVault = await getAccount(
      connection,
      new PublicKey(deployment.borrowVault)
    );
    console.log(`✅ Borrow Vault:     ${deployment.borrowVault.slice(0, 20)}...`);
    console.log(`   • Balance:        ${Number(borrowVault.amount) / 1e6} USDC`);

    if (Number(borrowVault.amount) === 0) {
      warnings.push("Borrow vault is empty - users cannot borrow");
    }
  } catch (e) {
    console.log(`❌ Borrow Vault:     NOT FOUND`);
    allPassed = false;
  }

  // Check 5: Mints
  const collateralMintInfo = await connection.getAccountInfo(
    new PublicKey(deployment.collateralMint)
  );
  if (collateralMintInfo) {
    console.log(`✅ Collateral Mint:  ${deployment.collateralMint.slice(0, 20)}...`);
  } else {
    console.log(`❌ Collateral Mint:  NOT FOUND`);
    allPassed = false;
  }

  const borrowMintInfo = await connection.getAccountInfo(
    new PublicKey(deployment.borrowMint)
  );
  if (borrowMintInfo) {
    console.log(`✅ Borrow Mint:      ${deployment.borrowMint.slice(0, 20)}...`);
  } else {
    console.log(`❌ Borrow Mint:      NOT FOUND`);
    allPassed = false;
  }

  // Warnings
  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    warnings.forEach((w) => console.log(`   • ${w}`));
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  if (allPassed) {
    console.log("✅ All checks passed! Deployment is valid.");
  } else {
    console.log("❌ Some checks failed. See above for details.");
    process.exit(1);
  }
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
