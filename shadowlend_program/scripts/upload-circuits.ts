#!/usr/bin/env ts-node
/**
 * Upload circuits and finalize computation definitions for deposit and borrow
 */

import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import {
  getArciumEnv,
  uploadCircuit,
  buildFinalizeCompDefTx,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import { ARCIUM_CLUSTER_OFFSET, COMP_DEF_NAMES, PROGRAM_ID } from "./lib/config";
import { setupProvider, loadDefaultWallet } from "./lib/utils";

async function main() {
  // Initialize Arcium env
  const env = getArciumEnv();
  env.arciumClusterOffset = ARCIUM_CLUSTER_OFFSET;

  const provider = setupProvider();
  const payer = loadDefaultWallet();
  const wallet = new anchor.Wallet(payer);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("       Upload Circuits & Finalize Computation Definitions");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}\n`);

  // Only process deposit and borrow
  const toProcess: Array<{ key: 'deposit' | 'borrow'; circuitFile: string }> = [
    { key: 'deposit', circuitFile: 'build/compute_confidential_deposit.arcis' },
    { key: 'borrow', circuitFile: 'build/compute_confidential_borrow.arcis' },
  ];
  
  const basePath = path.join(__dirname, '..');
  
  for (const { key, circuitFile } of toProcess) {
    const name = COMP_DEF_NAMES[key];
    const circuitPath = path.join(basePath, circuitFile);
    
    console.log(`═══════════════════════════════════════`);
    console.log(`Processing: ${key}`);
    console.log(`═══════════════════════════════════════`);
    
    // Check if circuit file exists
    if (!fs.existsSync(circuitPath)) {
      console.log(`❌ Circuit file not found: ${circuitPath}`);
      continue;
    }
    
    console.log(`   Circuit: ${circuitFile}`);
    console.log(`   Name: ${name}`);
    
    // Read circuit file
    const rawCircuit = fs.readFileSync(circuitPath);
    console.log(`   Circuit size: ${rawCircuit.length} bytes`);
    
    // Step 1: Upload circuit
    console.log(`\n📤 Uploading circuit...`);
    try {
      await uploadCircuit(
        provider,
        name,
        PROGRAM_ID,
        rawCircuit,
        true // use raw circuit
      );
      console.log(`   ✅ Circuit uploaded successfully`);
    } catch (error: any) {
      if (error.message?.includes('already been processed') || 
          error.message?.includes('AlreadyInUse') ||
          error.message?.includes('Account already exists')) {
        console.log(`   ⏭️  Circuit already uploaded`);
      } else {
        console.error(`   ❌ Upload failed:`, error.message);
        // Continue to try finalization anyway
      }
    }
    
    // Step 2: Finalize computation definition
    console.log(`\n📝 Finalizing computation definition...`);
    try {
      const offset = getCompDefAccOffset(name);
      const offsetNum = Buffer.from(offset).readUInt32LE();
      
      const finalizeTx = await buildFinalizeCompDefTx(provider, offsetNum, PROGRAM_ID);
      
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(payer);
      
      const sig = await provider.sendAndConfirm(finalizeTx, [payer]);
      console.log(`   ✅ Finalized (tx: ${sig.slice(0, 16)}...)`);
    } catch (error: any) {
      if (error.message?.includes('already been processed') || 
          error.message?.includes('AlreadyInUse') ||
          error.message?.includes('already finalized')) {
        console.log(`   ⏭️  Already finalized`);
      } else if (error.logs) {
        console.error(`   ❌ Finalization failed:`);
        console.error(error.logs.join('\n'));
      } else {
        console.error(`   ❌ Finalization failed:`, error.message);
      }
    }
    
    console.log('');
  }
  
  console.log("════════════════════════════════════════════════════════════");
  console.log("Done!");
  console.log("════════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
