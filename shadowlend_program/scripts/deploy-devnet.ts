/**
 * ShadowLend Devnet Deployment Script
 * 
 * Master script that orchestrates full protocol deployment:
 * 1. Initializes Arcium computation definitions
 * 2. Creates test mints (or uses existing)
 * 3. Initializes lending pool with vaults
 * 4. Funds borrow vault with initial liquidity
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/deploy-devnet.ts
 * 
 * Options:
 *   --skip-mints       Use existing mints from config
 *   --skip-comp-defs   Skip computation definition initialization
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Configuration
// ============================================================

const PROGRAM_ID = new PublicKey("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

// PDA Seeds
const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const COLLATERAL_SUFFIX = Buffer.from("collateral");
const BORROW_SUFFIX = Buffer.from("borrow");
const OBLIGATION_SEED = Buffer.from("obligation");

// Default pool configuration
const DEFAULT_POOL_CONFIG = {
  ltv: 8000,                // 80%
  liquidationThreshold: 8500, // 85%
  liquidationBonus: 500,      // 5%
  fixedBorrowRate: 500,       // 5% APY
};

// Initial liquidity to fund borrow vault (1M USDC with 6 decimals)
const INITIAL_BORROW_LIQUIDITY = 1_000_000 * 1e6;

// ============================================================
// Utility Functions
// ============================================================

async function loadKeypair(filepath: string): Promise<Keypair> {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

function derivePoolPDA(collateralMint: PublicKey, borrowMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, collateralMint.toBuffer(), borrowMint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveCollateralVaultPDA(collateralMint: PublicKey, borrowMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, collateralMint.toBuffer(), borrowMint.toBuffer(), COLLATERAL_SUFFIX],
    PROGRAM_ID
  );
}

function deriveBorrowVaultPDA(collateralMint: PublicKey, borrowMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, collateralMint.toBuffer(), borrowMint.toBuffer(), BORROW_SUFFIX],
    PROGRAM_ID
  );
}

function deriveObligationPDA(user: PublicKey, pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [OBLIGATION_SEED, user.toBuffer(), pool.toBuffer()],
    PROGRAM_ID
  );
}

// ============================================================
// Deployment Steps
// ============================================================

async function checkBalance(connection: Connection, pubkey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(pubkey);
  return balance / LAMPORTS_PER_SOL;
}

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

  console.log("\n📋 Initializing Arcium Computation Definitions...");

  for (const compDef of compDefs) {
    try {
      console.log(`   • ${compDef.name}...`);
      
      const tx = await (program.methods as any)[compDef.method]()
        .accounts({
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      
      console.log(`     ✅ Done (tx: ${tx.slice(0, 16)}...)`);
    } catch (error: any) {
      if (error.message?.includes("already in use") || error.logs?.some((l: string) => l.includes("already in use"))) {
        console.log(`     ⏭️  Already initialized`);
      } else {
        console.error(`     ❌ Failed:`, error.message);
        throw error;
      }
    }
  }
}

async function createTestMints(
  connection: Connection,
  payer: Keypair
): Promise<{ collateralMint: PublicKey; borrowMint: PublicKey }> {
  console.log("\n🪙  Creating test mints...");
  
  // Create collateral mint (9 decimals like SOL)
  const collateralMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    9,
    undefined,
    { commitment: "confirmed" }
  );
  console.log(`   • Collateral Mint: ${collateralMint.toBase58()}`);

  // Create borrow mint (6 decimals like USDC)
  const borrowMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
    undefined,
    { commitment: "confirmed" }
  );
  console.log(`   • Borrow Mint:     ${borrowMint.toBase58()}`);

  return { collateralMint, borrowMint };
}

async function initializePool(
  program: Program<any>,
  payer: Keypair,
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  config: typeof DEFAULT_POOL_CONFIG
): Promise<PublicKey> {
  const [poolPda] = derivePoolPDA(collateralMint, borrowMint);
  const [collateralVaultPda] = deriveCollateralVaultPDA(collateralMint, borrowMint);
  const [borrowVaultPda] = deriveBorrowVaultPDA(collateralMint, borrowMint);

  console.log("\n🏦 Initializing lending pool...");
  console.log(`   • Pool PDA:         ${poolPda.toBase58()}`);
  console.log(`   • Collateral Vault: ${collateralVaultPda.toBase58()}`);
  console.log(`   • Borrow Vault:     ${borrowVaultPda.toBase58()}`);
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
        pool: poolPda,
        collateralMint: collateralMint,
        borrowMint: borrowMint,
        collateralVault: collateralVaultPda,
        borrowVault: borrowVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc({ commitment: "confirmed" });

    console.log(`   ✅ Pool initialized (tx: ${tx.slice(0, 16)}...)`);
    return poolPda;
  } catch (error: any) {
    if (error.logs?.some((l: string) => l.includes("already in use"))) {
      console.log(`   ⏭️  Pool already exists`);
      return poolPda;
    }
    throw error;
  }
}

async function fundBorrowVault(
  connection: Connection,
  payer: Keypair,
  borrowMint: PublicKey,
  collateralMint: PublicKey,
  amount: number
): Promise<void> {
  const [borrowVaultPda] = deriveBorrowVaultPDA(collateralMint, borrowMint);

  console.log(`\n💰 Funding borrow vault with ${(amount / 1e6).toLocaleString()} USDC...`);

  try {
    await mintTo(
      connection,
      payer,
      borrowMint,
      borrowVaultPda,
      payer,
      amount,
      [],
      { commitment: "confirmed" }
    );

    // Verify balance
    const vaultAccount = await getAccount(connection, borrowVaultPda);
    console.log(`   ✅ Vault balance: ${(Number(vaultAccount.amount) / 1e6).toLocaleString()} USDC`);
  } catch (error: any) {
    console.error(`   ❌ Failed to fund vault:`, error.message);
    throw error;
  }
}

async function saveDeploymentInfo(
  filepath: string,
  info: {
    programId: string;
    poolPda: string;
    collateralMint: string;
    borrowMint: string;
    collateralVault: string;
    borrowVault: string;
    admin: string;
    deployedAt: string;
    network: string;
  }
): Promise<void> {
  fs.writeFileSync(filepath, JSON.stringify(info, null, 2));
  console.log(`\n📄 Deployment info saved to: ${filepath}`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═".repeat(60));
  console.log("       ShadowLend Devnet Deployment");
  console.log("═".repeat(60));

  // Parse args
  const args = process.argv.slice(2);
  const skipMints = args.includes("--skip-mints");
  const skipCompDefs = args.includes("--skip-comp-defs");

  // Load provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Detect network
  const genesisHash = await connection.getGenesisHash();
  const isDevnet = genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWCXL5v8qf";
  const network = isDevnet ? "devnet" : "localnet/other";
  console.log(`\n🌐 Network: ${network}`);

  // Load keypair
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const payer = await loadKeypair(walletPath);
  console.log(`👤 Admin:   ${payer.publicKey.toBase58()}`);

  // Check balance
  const balance = await checkBalance(connection, payer.publicKey);
  console.log(`💳 Balance: ${balance.toFixed(4)} SOL`);

  if (balance < 0.5) {
    console.error("\n❌ Insufficient balance. Need at least 0.5 SOL for deployment.");
    console.log("   Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/shadowlend_program.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`\n❌ IDL not found at ${idlPath}`);
    console.error("   Run 'anchor build' first.");
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as any;

  // Step 1: Initialize computation definitions
  if (!skipCompDefs) {
    await initializeCompDefs(program, payer);
  } else {
    console.log("\n⏭️  Skipping computation definitions (--skip-comp-defs)");
  }

  // Step 2: Create or load mints
  let collateralMint: PublicKey;
  let borrowMint: PublicKey;

  if (!skipMints) {
    const mints = await createTestMints(connection, payer);
    collateralMint = mints.collateralMint;
    borrowMint = mints.borrowMint;
  } else {
    // Load from existing deployment file
    const deploymentPath = path.join(__dirname, "../deployment.json");
    if (!fs.existsSync(deploymentPath)) {
      console.error("\n❌ --skip-mints requires deployment.json with existing mints");
      process.exit(1);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
    collateralMint = new PublicKey(deployment.collateralMint);
    borrowMint = new PublicKey(deployment.borrowMint);
    console.log(`\n📦 Using existing mints from deployment.json`);
  }

  // Step 3: Initialize pool
  const poolPda = await initializePool(
    program,
    payer,
    collateralMint,
    borrowMint,
    DEFAULT_POOL_CONFIG
  );

  // Step 4: Fund borrow vault
  if (!skipMints) {
    await fundBorrowVault(
      connection,
      payer,
      borrowMint,
      collateralMint,
      INITIAL_BORROW_LIQUIDITY
    );
  }

  // Derive all PDAs for summary
  const [collateralVault] = deriveCollateralVaultPDA(collateralMint, borrowMint);
  const [borrowVault] = deriveBorrowVaultPDA(collateralMint, borrowMint);

  // Save deployment info
  const deploymentInfo = {
    programId: PROGRAM_ID.toBase58(),
    poolPda: poolPda.toBase58(),
    collateralMint: collateralMint.toBase58(),
    borrowMint: borrowMint.toBase58(),
    collateralVault: collateralVault.toBase58(),
    borrowVault: borrowVault.toBase58(),
    admin: payer.publicKey.toBase58(),
    deployedAt: new Date().toISOString(),
    network: network,
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  await saveDeploymentInfo(deploymentPath, deploymentInfo);

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("       DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log(`Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`Pool PDA:         ${poolPda.toBase58()}`);
  console.log(`Collateral Mint:  ${collateralMint.toBase58()}`);
  console.log(`Borrow Mint:      ${borrowMint.toBase58()}`);
  console.log(`Collateral Vault: ${collateralVault.toBase58()}`);
  console.log(`Borrow Vault:     ${borrowVault.toBase58()}`);
  console.log(`Admin:            ${payer.publicKey.toBase58()}`);
  console.log("═".repeat(60));
  console.log("\n✅ ShadowLend is ready on devnet!");
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err);
  process.exit(1);
});
