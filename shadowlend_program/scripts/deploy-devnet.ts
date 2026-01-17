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
import {
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getCompDefAccOffset,
  getMXEAccAddress,
  buildFinalizeCompDefTx,
  getArciumEnv,
} from "@arcium-hq/client";

// ============================================================
// Configuration
// ============================================================

const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");

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

// Real Devnet Token Addresses
const WSOL_DEVNET_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_DEVNET_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

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
  payer: Keypair,
  provider: anchor.AnchorProvider
): Promise<void> {
  const compDefs = [
    { name: "Deposit", method: "initComputeDepositCompDef", arciumKey: "compute_confidential_deposit" },
    { name: "Borrow", method: "initComputeBorrowCompDef", arciumKey: "compute_confidential_borrow" },
    { name: "Withdraw", method: "initComputeWithdrawCompDef", arciumKey: "compute_confidential_withdraw" },
    { name: "Repay", method: "initComputeRepayCompDef", arciumKey: "compute_confidential_repay" },
    // { name: "Liquidate", method: "initComputeLiquidateCompDef", arciumKey: "compute_confidential_liquidate" },
    { name: "Interest", method: "initComputeInterestCompDef", arciumKey: "compute_confidential_interest" },
  ];

  console.log("\n📋 Initializing Arcium Computation Definitions...");

  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const arciumProgramId = getArciumProgramId();
  // Set explicit devnet cluster offset
  getArciumEnv().arciumClusterOffset = 123;

  for (const compDef of compDefs) {
    try {
      console.log(`   • ${compDef.name}...`);
      
      const offset = getCompDefAccOffset(compDef.arciumKey);
      
      const compDefPDA = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
        arciumProgramId
      )[0];

      const mxeAccount = getMXEAccAddress(program.programId);

      // Check if already initialized (account exists)
      const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
      if (accountInfo) {
        console.log(`     ⏭️  Already initialized`);
        continue;
      }

      const tx = await (program.methods as any)[compDef.method]()
        .accounts({
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          compDefAccount: compDefPDA,
          mxeAccount: mxeAccount,
        })
        .signers([payer])
        .rpc();
      
      console.log(`     ✅ Initialized (tx: ${tx.slice(0, 16)}...)`);

      // Finalize the definition
      console.log(`     Finalizing...`);
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(payer);

      const finSig = await provider.sendAndConfirm(finalizeTx, [payer]);
      console.log(`     ✅ Finalized (tx: ${finSig.slice(0, 16)}...)`);

    } catch (error: any) {
      if (error.message?.includes("already in use") || error.logs?.some((l: string) => l.includes("already in use"))) {
        console.log(`     ⏭️  Already initialized (error caught)`);
      } else {
        console.error(`     ❌ Failed:`, error.message);
        throw error;
      }
    }
  }
}

function useRealDevnetMints(): { collateralMint: PublicKey; borrowMint: PublicKey } {
  console.log("\n🪙  Using real devnet tokens...");
  console.log(`   • Collateral (wSOL): ${WSOL_DEVNET_MINT.toBase58()}`);
  console.log(`   • Borrow (USDC):     ${USDC_DEVNET_MINT.toBase58()}`);
  
  return { 
    collateralMint: WSOL_DEVNET_MINT, 
    borrowMint: USDC_DEVNET_MINT 
  };
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
    await initializeCompDefs(program, payer, provider);
  } else {
    console.log("\n⏭️  Skipping computation definitions (--skip-comp-defs)");
  }

  // Step 2: Use real devnet mints (wSOL + USDC)
  const { collateralMint, borrowMint } = useRealDevnetMints();

  // Step 3: Initialize pool
  const poolPda = await initializePool(
    program,
    payer,
    collateralMint,
    borrowMint,
    DEFAULT_POOL_CONFIG
  );

  // Note: Vault funding skipped - users must provide real USDC liquidity
  console.log("\n💡 Note: Borrow vault requires manual USDC funding for lending.");

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
