#!/usr/bin/env ts-node
/**
 * Finalize computation definitions that exist but aren't completed
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getArciumEnv,
  getArciumProgramId,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
} from "@arcium-hq/client";
import { ARCIUM_CLUSTER_OFFSET, COMP_DEF_NAMES, PROGRAM_ID } from "./lib/config";
import { setupProvider, loadDefaultWallet } from "./lib/utils";

async function main() {
  // Initialize Arcium env
  const env = getArciumEnv();
  env.arciumClusterOffset = ARCIUM_CLUSTER_OFFSET;

  const provider = setupProvider();
  const arciumProgramId = getArciumProgramId();
  const payer = loadDefaultWallet();
  const wallet = new anchor.Wallet(payer);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("       Finalize Computation Definitions");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}\n`);

  // Only try to finalize the ones that exist
  const toFinalize = ['deposit', 'borrow'] as const;
  
  for (const key of toFinalize) {
    const name = COMP_DEF_NAMES[key];
    const offset = getCompDefAccOffset(name);
    const offsetNum = Buffer.from(offset).readUInt32LE();
    const baseSeed = getArciumAccountBaseSeed('ComputationDefinitionAccount');
    
    const compDefPda = PublicKey.findProgramAddressSync(
      [baseSeed, PROGRAM_ID.toBuffer(), offset],
      arciumProgramId
    )[0];
    
    const accountInfo = await provider.connection.getAccountInfo(compDefPda);
    
    if (!accountInfo) {
      console.log(`⏭️  ${key.padEnd(10)} : NOT INITIALIZED - skipping`);
      continue;
    }
    
    console.log(`📝 Finalizing ${key}...`);
    console.log(`   PDA: ${compDefPda.toBase58()}`);
    
    try {
      const finalizeTx = await buildFinalizeCompDefTx(provider, offsetNum, PROGRAM_ID);
      
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(payer);
      
      const sig = await provider.sendAndConfirm(finalizeTx, [payer]);
      console.log(`   ✅ Finalized (tx: ${sig.slice(0, 12)}...)`);
    } catch (error: any) {
      if (error.message?.includes('already been processed') || 
          error.message?.includes('AlreadyInUse')) {
        console.log(`   ⏭️  Already finalized`);
      } else if (error.logs) {
        console.error(`   ❌ Failed:`, error.logs.join('\n'));
      } else {
        console.error(`   ❌ Failed:`, error.message);
      }
    }
    console.log('');
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
