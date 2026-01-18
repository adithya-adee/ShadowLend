#!/usr/bin/env ts-node
/**
 * Check computation definition status
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getArciumEnv,
  getArciumProgramId,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import { ARCIUM_CLUSTER_OFFSET, COMP_DEF_NAMES, PROGRAM_ID } from "./lib/config";
import { setupProvider } from "./lib/utils";

async function main() {
  // Initialize Arcium env
  const env = getArciumEnv();
  env.arciumClusterOffset = ARCIUM_CLUSTER_OFFSET;

  const provider = setupProvider();
  const arciumProgramId = getArciumProgramId();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("       Computation Definition Status Check");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`Arcium Program: ${arciumProgramId.toBase58()}`);
  console.log(`Cluster Offset: ${ARCIUM_CLUSTER_OFFSET}\n`);

  for (const [key, name] of Object.entries(COMP_DEF_NAMES)) {
    const offset = getCompDefAccOffset(name);
    const baseSeed = getArciumAccountBaseSeed('ComputationDefinitionAccount');
    
    const compDefPda = PublicKey.findProgramAddressSync(
      [baseSeed, PROGRAM_ID.toBuffer(), offset],
      arciumProgramId
    )[0];
    
    const accountInfo = await provider.connection.getAccountInfo(compDefPda);
    
    if (accountInfo) {
      console.log(`✅ ${key.padEnd(10)} : ${compDefPda.toBase58()}`);
      console.log(`   Size: ${accountInfo.data.length} bytes`);
      console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
      
      // Check if it's completed by examining the data
      // The data structure has a is_completed flag
      if (accountInfo.data.length > 0) {
        // Try to read is_completed flag (usually at a specific offset)
        console.log(`   Data (first 16 bytes): ${accountInfo.data.slice(0, 16).toString('hex')}`);
      }
    } else {
      console.log(`❌ ${key.padEnd(10)} : NOT INITIALIZED`);
    }
    console.log('');
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
