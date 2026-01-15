/**
 * ShadowLend Deployment Verification Script
 * 
 * Verifies all PDAs and accounts are correctly initialized.
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/verify-deployment.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Configuration
// ============================================================

const PROGRAM_ID = new PublicKey("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═".repeat(60));
  console.log("       ShadowLend Deployment Verification");
  console.log("═".repeat(60));

  // Load provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("\n❌ deployment.json not found.");
    console.error("   Run 'npx ts-node scripts/deploy-devnet.ts' first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  console.log(`\n📅 Deployed: ${deployment.deployedAt}`);
  console.log(`🌐 Network:  ${deployment.network}`);

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/shadowlend_program.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`\n❌ IDL not found at ${idlPath}`);
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as any;

  let allPassed = true;

  // Check 1: Program exists
  console.log("\n📋 Checking accounts...\n");
  
  const programInfo = await connection.getAccountInfo(new PublicKey(deployment.programId));
  if (programInfo) {
    console.log(`✅ Program:          ${deployment.programId.slice(0, 20)}...`);
  } else {
    console.log(`❌ Program:          NOT FOUND`);
    allPassed = false;
  }

  // Check 2: Pool account
  try {
    const pool = await program.account.pool.fetch(new PublicKey(deployment.poolPda));
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
    console.log(`   • Balance:        ${Number(collateralVault.amount) / 1e9} tokens`);
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
      console.log(`   ⚠️  Warning: Borrow vault is empty!`);
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

  // Summary
  console.log("\n" + "═".repeat(60));
  if (allPassed) {
    console.log("✅ All checks passed! Deployment is valid.");
  } else {
    console.log("❌ Some checks failed. See above for details.");
  }
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
