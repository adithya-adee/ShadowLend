import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Program ID from Anchor.toml
const PROGRAM_ID = new PublicKey("6KiV2x1SxqtPALq9gdyxFXZiuWmwFRdsxMNpnyyPThg3");

// PDA seed prefix
const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const COLLATERAL_SUFFIX = Buffer.from("collateral");
const BORROW_SUFFIX = Buffer.from("borrow");

interface PoolConfig {
  ltv: number;              // Loan-to-Value in basis points (80% = 8000)
  liquidationThreshold: number; // Liquidation threshold in bps (85% = 8500)
  liquidationBonus: number;    // Liquidation bonus in bps (5% = 500)
  fixedBorrowRate: number;     // Fixed borrow rate in bps (5% = 500)
}

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

async function createTestMints(
  connection: Connection,
  payer: Keypair
): Promise<{ collateralMint: PublicKey; borrowMint: PublicKey }> {
  console.log("Creating test mints...");
  
  // Create collateral mint (simulating wrapped SOL)
  const collateralMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    9 // 9 decimals like SOL
  );
  console.log(`  Collateral Mint: ${collateralMint.toBase58()}`);

  // Create borrow mint (simulating USDC)
  const borrowMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6 // 6 decimals like USDC
  );
  console.log(`  Borrow Mint: ${borrowMint.toBase58()}`);

  return { collateralMint, borrowMint };
}

async function initializePool(
  program: Program<any>,
  payer: Keypair,
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  config: PoolConfig
): Promise<PublicKey> {
  const [poolPda, poolBump] = derivePoolPDA(collateralMint, borrowMint);
  const [collateralVaultPda] = deriveCollateralVaultPDA(collateralMint, borrowMint);
  const [borrowVaultPda] = deriveBorrowVaultPDA(collateralMint, borrowMint);

  console.log("\nDerived PDAs:");
  console.log(`  Pool PDA: ${poolPda.toBase58()}`);
  console.log(`  Collateral Vault: ${collateralVaultPda.toBase58()}`);
  console.log(`  Borrow Vault: ${borrowVaultPda.toBase58()}`);

  console.log("\nInitializing pool with config:");
  console.log(`  LTV: ${config.ltv / 100}%`);
  console.log(`  Liquidation Threshold: ${config.liquidationThreshold / 100}%`);
  console.log(`  Liquidation Bonus: ${config.liquidationBonus / 100}%`);
  console.log(`  Fixed Borrow Rate: ${config.fixedBorrowRate / 100}% APY`);

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
      .rpc();

    console.log(`\n✅ Pool initialized! Tx: ${tx}`);
    return poolPda;
  } catch (error) {
    console.error("Failed to initialize pool:", error);
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

  console.log(`\nFunding borrow vault with ${amount} tokens...`);

  // Mint tokens directly to the borrow vault (for testing)
  await mintTo(
    connection,
    payer,
    borrowMint,
    borrowVaultPda,
    payer, // mint authority
    amount
  );

  console.log(`✅ Funded borrow vault with ${amount} tokens`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("ShadowLend Pool Initialization Script");
  console.log("=".repeat(60));

  // Load provider from Anchor.toml settings
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Load the keypair
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const payer = await loadKeypair(walletPath);
  console.log(`\nWallet: ${payer.publicKey.toBase58()}`);

  // Get wallet balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.1 * 1e9) {
    console.error("❌ Insufficient balance. Need at least 0.1 SOL");
    process.exit(1);
  }

  // Load program IDL
  const idlPath = path.join(__dirname, "../target/idl/shadowlend_program.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found at ${idlPath}`);
    console.error("Run 'anchor build' first to generate the IDL.");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl, provider) as any;

  // Step 1: Create test mints (for localnet/devnet)
  console.log("\n" + "-".repeat(40));
  console.log("Step 1: Creating Test Mints");
  console.log("-".repeat(40));
  
  const { collateralMint, borrowMint } = await createTestMints(connection, payer);

  // Step 2: Initialize the pool
  console.log("\n" + "-".repeat(40));
  console.log("Step 2: Initializing Pool");
  console.log("-".repeat(40));

  const poolConfig: PoolConfig = {
    ltv: 8000,              // 80%
    liquidationThreshold: 8500, // 85%
    liquidationBonus: 500,     // 5%
    fixedBorrowRate: 500,      // 5% APY
  };

  const poolPda = await initializePool(
    program,
    payer,
    collateralMint,
    borrowMint,
    poolConfig
  );

  // Step 3: Fund the borrow vault with initial liquidity
  console.log("\n" + "-".repeat(40));
  console.log("Step 3: Funding Borrow Vault");
  console.log("-".repeat(40));

  // Mint 1,000,000 USDC (with 6 decimals) to the borrow vault
  await fundBorrowVault(
    connection,
    payer,
    borrowMint,
    collateralMint,
    1_000_000 * 1e6 // 1M USDC
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Program ID:       ${PROGRAM_ID.toBase58()}`);
  console.log(`Pool PDA:         ${poolPda.toBase58()}`);
  console.log(`Collateral Mint:  ${collateralMint.toBase58()}`);
  console.log(`Borrow Mint:      ${borrowMint.toBase58()}`);
  console.log(`Collateral Vault: ${deriveCollateralVaultPDA(collateralMint, borrowMint)[0].toBase58()}`);
  console.log(`Borrow Vault:     ${deriveBorrowVaultPDA(collateralMint, borrowMint)[0].toBase58()}`);
  console.log("=".repeat(60));
  console.log("\n✅ Pool setup complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
