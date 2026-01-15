/**
 * ShadowLend User Setup Script
 * 
 * Creates user token accounts and mints test tokens for testing.
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/setup-user.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { 
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
const OBLIGATION_SEED = Buffer.from("obligation");

// Test amounts to mint
const COLLATERAL_AMOUNT = 100 * 1e9;  // 100 SOL (9 decimals)
const BORROW_AMOUNT = 10_000 * 1e6;   // 10,000 USDC (6 decimals)

// ============================================================
// Utility Functions
// ============================================================

async function loadKeypair(filepath: string): Promise<Keypair> {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

function deriveObligationPDA(user: PublicKey, pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [OBLIGATION_SEED, user.toBuffer(), pool.toBuffer()],
    PROGRAM_ID
  );
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═".repeat(60));
  console.log("       ShadowLend User Setup");
  console.log("═".repeat(60));

  // Load provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Load keypair
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const payer = await loadKeypair(walletPath);
  console.log(`\n👤 User: ${payer.publicKey.toBase58()}`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💳 SOL Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("\n❌ deployment.json not found.");
    console.error("   Run 'npx ts-node scripts/deploy-devnet.ts' first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const collateralMint = new PublicKey(deployment.collateralMint);
  const borrowMint = new PublicKey(deployment.borrowMint);
  const poolPda = new PublicKey(deployment.poolPda);

  console.log(`\n📦 Loaded deployment:`);
  console.log(`   • Pool:           ${poolPda.toBase58()}`);
  console.log(`   • Collateral Mint: ${collateralMint.toBase58()}`);
  console.log(`   • Borrow Mint:     ${borrowMint.toBase58()}`);

  // Create or get user's collateral token account
  console.log("\n🪙  Setting up token accounts...");
  
  const userCollateralAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    collateralMint,
    payer.publicKey,
    false,
    "confirmed"
  );
  console.log(`   • Collateral ATA: ${userCollateralAta.address.toBase58()}`);

  const userBorrowAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    borrowMint,
    payer.publicKey,
    false,
    "confirmed"
  );
  console.log(`   • Borrow ATA:     ${userBorrowAta.address.toBase58()}`);

  // Mint test tokens to user
  console.log("\n💰 Minting test tokens...");

  // Mint collateral tokens
  await mintTo(
    connection,
    payer,
    collateralMint,
    userCollateralAta.address,
    payer,
    COLLATERAL_AMOUNT,
    [],
    { commitment: "confirmed" }
  );
  console.log(`   • Minted ${COLLATERAL_AMOUNT / 1e9} collateral tokens`);

  // Mint some borrow tokens (for repay testing)
  await mintTo(
    connection,
    payer,
    borrowMint,
    userBorrowAta.address,
    payer,
    BORROW_AMOUNT,
    [],
    { commitment: "confirmed" }
  );
  console.log(`   • Minted ${BORROW_AMOUNT / 1e6} borrow tokens`);

  // Verify balances
  console.log("\n📊 Final balances:");
  
  const collateralBalance = await getAccount(connection, userCollateralAta.address);
  console.log(`   • Collateral: ${Number(collateralBalance.amount) / 1e9} tokens`);
  
  const borrowBalance = await getAccount(connection, userBorrowAta.address);
  console.log(`   • Borrow:     ${Number(borrowBalance.amount) / 1e6} tokens`);

  // Derive obligation PDA for reference
  const [obligationPda] = deriveObligationPDA(payer.publicKey, poolPda);
  console.log(`\n📋 User Obligation PDA: ${obligationPda.toBase58()}`);
  console.log(`   (Will be created on first deposit)`);

  console.log("\n" + "═".repeat(60));
  console.log("✅ User setup complete! Ready to deposit.");
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err);
  process.exit(1);
});
