import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Program ID from Anchor.toml
const PROGRAM_ID = new PublicKey("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

async function loadKeypair(filepath: string): Promise<Keypair> {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/**
 * Initializes all 6 computation definitions for Arcium MXE.
 * Must be run ONCE before any user operations can be performed.
 */
async function initializeCompDefs(
  program: Program<any>,
  payer: Keypair
): Promise<void> {
  const compDefs = [
    { name: "Deposit", method: "initComputeDepositCompDef" },
    { name: "Borrow", method: "initComputeBorrowCompDef" },
    { name: "Withdraw", method: "initComputeWithdrawCompDef" },
    { name: "Repay", method: "initComputeRepayCompDef" },
    { name: "Liquidate", method: "initComputeLiquidateCompDef" },
    { name: "Interest", method: "initComputeInterestCompDef" },
  ];

  console.log("Initializing Arcium Computation Definitions...\n");

  for (const compDef of compDefs) {
    try {
      console.log(`  Initializing ${compDef.name}...`);
      
      // Each init_comp_def instruction has its own account struct
      // The Arcium SDK provides the account derivation
      const tx = await (program.methods as any)[compDef.method]()
        .accounts({
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      
      console.log(`    ✅ ${compDef.name} initialized: ${tx.slice(0, 20)}...`);
    } catch (error: any) {
      if (error.message?.includes("already in use")) {
        console.log(`    ⏭️  ${compDef.name} already initialized, skipping`);
      } else {
        console.error(`    ❌ Failed to initialize ${compDef.name}:`, error.message);
      }
    }
  }

  console.log("\n✅ Computation definitions initialization complete!");
}

async function main() {
  console.log("=".repeat(60));
  console.log("ShadowLend Arcium Computation Definitions Setup");
  console.log("=".repeat(60));

  // Load provider from Anchor.toml settings
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the keypair
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const payer = await loadKeypair(walletPath);
  console.log(`\nWallet: ${payer.publicKey.toBase58()}`);

  // Load program IDL
  const idlPath = path.join(__dirname, "../target/idl/shadowlend_program.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found at ${idlPath}`);
    console.error("Run 'anchor build' first to generate the IDL.");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  await initializeCompDefs(program, payer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
