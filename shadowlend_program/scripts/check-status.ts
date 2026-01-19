#!/usr/bin/env ts-node
/**
 * ShadowLend Status Verification Script
 * 
 * Combines checks for:
 * 1. Arcium Infrastructure (MXE, Cluster, DKG)
 * 2. Computation Definitions (Deposit, Borrow, etc.)
 * 3. Protocol State (Lending Pool)
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getArciumEnv,
  getArciumProgramId,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  getMXEAccAddress, 
  getClusterAccAddress, 
  getMXEPublicKey
} from "@arcium-hq/client";
import { 
  PROGRAM_ID, 
  ARCIUM_CLUSTER_OFFSET, 
  COMP_DEF_NAMES, 
  WSOL_MINT, 
  USDC_MINT 
} from "./lib/config";
import { 
  setupProvider, 
  deriveAllPoolPdas,
  logHeader, 
  logSection, 
  logEntry, 
  logSuccess, 
  logError, 
  logWarning, 
  logDivider,
  icons 
} from "./lib"; // Import from index which exports utils
import chalk from "chalk";

/**
 * Main Status Check Function
 */
async function main() {
  logHeader("ShadowLend System Status");

  // 1. Setup & Config
  // ---------------------------------------------------------
  let provider: anchor.AnchorProvider;
  try {
    // Set default env vars for Arcium SDK if not present
    if (!process.env.ARCIUM_CLUSTER_OFFSET) {
      process.env.ARCIUM_CLUSTER_OFFSET = ARCIUM_CLUSTER_OFFSET.toString();
    }
    
    // Initialize Arcium env
    const env = getArciumEnv();
    env.arciumClusterOffset = ARCIUM_CLUSTER_OFFSET;

    provider = setupProvider();
    
  } catch (e: any) {
    logError(`Initialization failed: ${e.message}`);
    process.exit(1);
  }

  const arciumProgramId = getArciumProgramId();

  logSection("Configuration");
  logEntry("ShadowLend Program", PROGRAM_ID.toBase58(), icons.key);
  logEntry("Arcium Program", arciumProgramId.toBase58(), icons.key);
  logEntry("Cluster Offset", ARCIUM_CLUSTER_OFFSET.toString(), icons.info);
  logDivider();

  // 2. Arcium Infrastructure Check
  // ---------------------------------------------------------
  logSection("Arcium Infrastructure");
  
  // Derive Addresses
  const mxeAccount = getMXEAccAddress(PROGRAM_ID);
  const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);

  // Check MXE Account
  try {
    const accInfo = await provider.connection.getAccountInfo(mxeAccount);
    if (accInfo) {
      logSuccess("MXE Account Initialized");
      // logEntry("Address", mxeAccount.toBase58().slice(0, 20) + "...");
    } else {
      logError("MXE Account NOT Initialized");
      logWarning("Run 'arcium deploy' to create it.");
    }
  } catch (e: any) {
    logError(`MXE Check Failed: ${e.message}`);
  }

  // Check Cluster Account
  try {
    const accInfo = await provider.connection.getAccountInfo(clusterAccount);
    if (!accInfo) {
      logError("Cluster Account NOT Found");
      logWarning(`Cluster offset ${ARCIUM_CLUSTER_OFFSET} might be incorrect.`);
    }
  } catch (e: any) {
    logError(`Cluster Check Failed: ${e.message}`);
  }

  // Check DKG Status (MXE Public Key)
  console.log(chalk.gray(`  ${icons.dot} Checking DKG Status (MXE Public Key)...`));
  try {
    const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);
    
    if (mxePublicKey && mxePublicKey.length > 0 && !mxePublicKey.every(b => b === 0)) {
       const mxePublicKeyHex = Buffer.from(mxePublicKey).toString("hex");
       logSuccess(`DKG Complete (Public Key Set)`);
       console.log(chalk.gray(`     Key: ${mxePublicKeyHex}`));
    } else {
       logError("DKG Incomplete (No Public Key)");
       logWarning("Nodes must complete key generation. Wait a few moments.");
    }
  } catch (e: any) {
      if (e.message?.includes("MxeKeysNotSet")) {
          logError("DKG Incomplete (MxeKeysNotSet)");
      } else {
          logError(`DKG Check Failed: ${e.message}`);
      }
  }
  logDivider();

  // 3. Computation Definitions Check
  // ---------------------------------------------------------
  logSection("Computation Definitions");

  // Iterate over all expected definitions
  for (const [key, name] of Object.entries(COMP_DEF_NAMES)) {
    const offset = getCompDefAccOffset(name);
    const baseSeed = getArciumAccountBaseSeed('ComputationDefinitionAccount');
    
    const compDefPda = PublicKey.findProgramAddressSync(
      [baseSeed, PROGRAM_ID.toBuffer(), offset],
      arciumProgramId
    )[0];
    
    try {
        const accountInfo = await provider.connection.getAccountInfo(compDefPda);
        
        if (accountInfo) {
          console.log(chalk.greenBright(`  ${icons.checkmark} ${key.padEnd(10)} ${chalk.gray("Initialized")}`));
          // console.log(chalk.gray(`     Address: ${compDefPda.toBase58()}`));
        } else {
          console.log(chalk.redBright(`  ${icons.cross} ${key.padEnd(10)} ${chalk.red("Missing")}`));
        }
    } catch (e: any) {
         logError(`Failed to check ${key}: ${e.message}`);
    }
  }
  logDivider();

  // 4. Protocol State (Pool) Check
  // ---------------------------------------------------------
  logSection("ShadowLend Protocol");

  const pdas = deriveAllPoolPdas(WSOL_MINT, USDC_MINT);
  
  try {
      const info = await provider.connection.getAccountInfo(pdas.pool);
      if (info) {
          logSuccess("Lending Pool Initialized");
          // logEntry("Pool Address", pdas.pool.toBase58());
      } else {
          logError("Lending Pool NOT Initialized");
          logWarning("Run 'npm run deploy' to init pool.");
      }
  } catch (e: any) {
      logError(`Pool Check Failed: ${e.message}`);
  }
  logDivider();
}

main().catch(err => {
  console.error(chalk.red(`\nFatal Error: ${err.message}`));
  process.exit(1);
});
