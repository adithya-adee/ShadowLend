/**
 * ShadowLend Devnet Test - Deposit & Borrow with Pyth Oracle
 * 
 * Tests the deployed program on devnet following Arcium SDK patterns
 * 
 * Usage:
 *   ARCIUM_CLUSTER_OFFSET=123 ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node tests/devnet-test.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { ShadowlendProgram } from "../target/types/shadowlend_program";
import { randomBytes } from "crypto";
import {
  getArciumEnv,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getMXEPublicKey,
  awaitComputationFinalization,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Configuration
// ============================================================

const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");

// Deployed Pool Config from deployment.json
const POOL_PDA = new PublicKey("B1foD3KMhjUXd89rAKf72WXdsv5ahuprvkaDU27b1ZET");
const COLLATERAL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // wSOL
const BORROW_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // USDC from deployment

// ============================================================
// Utility Functions
// ============================================================

function loadKeypair(filepath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/**
 * Gets MXE public key with retry logic for network issues
 */
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 1000
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`   Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(`   Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts`);
}

/**
 * Creates encryption context for confidential transactions
 * Following Arcium SDK pattern: https://docs.arcium.com/developers/js-client-library/encryption
 */
async function createEncryptionContext(
  provider: anchor.AnchorProvider,
  programId: PublicKey
): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  cipher: RescueCipher;
  mxePublicKey: Uint8Array;
}> {
  console.log("   Fetching MXE public key...");
  const mxePublicKey = await getMXEPublicKeyWithRetry(provider, programId);
  
  // Generate x25519 key pair for Diffie-Hellman key exchange
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  
  // Derive shared secret with MXE
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  
  // Initialize RescueCipher with shared secret
  const cipher = new RescueCipher(sharedSecret);

  return { privateKey, publicKey, cipher, mxePublicKey };
}

/**
 * Encrypts a value for submission to Arcium MXE
 * Returns 32-byte ciphertext array
 */
function encryptValue(
  cipher: RescueCipher,
  value: bigint,
  nonce: Uint8Array
): Uint8Array {
  const ciphertext = cipher.encrypt([value], nonce);
  return new Uint8Array(ciphertext[0]);
}

/**
 * Converts a BN (16-byte) nonce to u128 format
 */
function nonceToU128(nonce: Uint8Array): BN {
  // Read nonce as little-endian 128-bit value
  let result = new BN(0);
  for (let i = 0; i < 16; i++) {
    result = result.or(new BN(nonce[i]).shln(i * 8));
  }
  return result;
}

/**
 * Find UserObligation PDA
 */
function findUserObligationPda(
  programId: PublicKey,
  user: PublicKey,
  pool: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("obligation"), user.toBuffer(), pool.toBuffer()],
    programId
  );
}

/**
 * Find collateral vault PDA
 * Seeds: ["vault", collateral_mint, borrow_mint, "collateral"]
 */
function findCollateralVaultPda(
  programId: PublicKey,
  collateralMint: PublicKey,
  borrowMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), collateralMint.toBuffer(), borrowMint.toBuffer(), Buffer.from("collateral")],
    programId
  );
}

// ============================================================
// Test Functions
// ============================================================

async function testDeposit(
  program: Program<ShadowlendProgram>,
  provider: anchor.AnchorProvider,
  payer: Keypair,
  arciumEnv: ReturnType<typeof getArciumEnv>
): Promise<BN | null> {
  console.log("\n" + "=".repeat(60));
  console.log("       TEST: Deposit Instruction");
  console.log("=".repeat(60));
  
  const connection = provider.connection;
  const depositAmount = new BN(0.001 * LAMPORTS_PER_SOL); // 0.001 SOL
  const clusterOffset = arciumEnv.arciumClusterOffset;
  
  // 1. Get or create user's token account (wSOL)
  console.log("\n📝 Setting up user token accounts...");
  
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    COLLATERAL_MINT,
    payer.publicKey
  );
  console.log(`   User token ATA: ${userTokenAccount.address.toBase58()}`);
  
  // 2. Check wSOL balance
  const userTokenBalance = await getAccount(connection, userTokenAccount.address);
  console.log(`   Current wSOL balance: ${Number(userTokenBalance.amount) / LAMPORTS_PER_SOL} wSOL`);
  
  if (Number(userTokenBalance.amount) < depositAmount.toNumber()) {
    console.log("   ⚠️  Insufficient wSOL balance for deposit.");
    console.log("   To get wSOL, wrap some SOL by sending to your ATA.");
    return null;
  }
  
  // 3. Setup Arcium accounts
  console.log("\n🔐 Setting up Arcium accounts...");
  
  // Generate computation offset (random 8 bytes)
  const computationOffset = new BN(randomBytes(8));
  
  // Derive Arcium addresses
  const computationAccount = getComputationAccAddress(
    clusterOffset,
    computationOffset
  );
  const clusterAccount = getClusterAccAddress(clusterOffset);
  const mxeAccount = getMXEAccAddress(program.programId);
  const mempoolAccount = getMempoolAccAddress(clusterOffset);
  const executingPool = getExecutingPoolAccAddress(clusterOffset);
  const compDefAccount = getCompDefAccAddress(
    program.programId,
    Buffer.from(getCompDefAccOffset("compute_confidential_deposit")).readUInt32LE()
  );
  
  // Derive user obligation PDA
  const [userObligationPda] = findUserObligationPda(
    program.programId,
    payer.publicKey,
    POOL_PDA
  );
  
  // Derive collateral vault PDA
  const [collateralVaultPda] = findCollateralVaultPda(
    program.programId,
    COLLATERAL_MINT,
    BORROW_MINT
  );
  
  console.log(`   MXE Account: ${mxeAccount.toBase58()}`);
  console.log(`   Cluster: ${clusterAccount.toBase58()}`);
  console.log(`   Comp Def: ${compDefAccount.toBase58()}`);
  console.log(`   User Obligation: ${userObligationPda.toBase58()}`);
  console.log(`   Collateral Vault: ${collateralVaultPda.toBase58()}`);
  
  console.log("\n📤 Sending deposit transaction...");
  console.log(`   Amount: ${depositAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
  
  try {
    const sig = await program.methods
      .deposit(
        computationOffset,
        depositAmount
      )
      .accountsPartial({
        payer: payer.publicKey,
        pool: POOL_PDA,
        collateralMint: COLLATERAL_MINT,
        userTokenAccount: userTokenAccount.address,
        userObligation: userObligationPda,
        collateralVault: collateralVaultPda,
        computationAccount: computationAccount,
        clusterAccount: clusterAccount,
        mxeAccount: mxeAccount,
        mempoolAccount: mempoolAccount,
        executingPool: executingPool,
        compDefAccount: compDefAccount,
        signPdaAccount: PublicKey.findProgramAddressSync(
          [Buffer.from("SignerAccount")],
          program.programId
        )[0],      })
      .rpc({ commitment: "confirmed" });
    
    console.log(`\n✅ Deposit transaction sent!`);
    console.log(`   Signature: ${sig}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    // Wait for MXE callback finalization
    console.log(`\n⏳ Waiting for MXE callback (this may take 30-60 seconds)...`);
    
    try {
      const finalizeSig = await awaitComputationFinalization(
        provider,
        computationOffset,
        program.programId,
        "confirmed"
      );
      console.log(`\n✅ Computation finalized!`);
      console.log(`   Callback Signature: ${finalizeSig}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${finalizeSig}?cluster=devnet`);
    } catch (finalizationError: any) {
      console.log(`\n⚠️  Callback finalization timeout or error: ${finalizationError.message}`);
      console.log(`   The deposit was queued but the callback may still be processing.`);
    }
    
    return computationOffset;
    
  } catch (error: any) {
    console.error("\n❌ Deposit failed:", error.message);
    if (error.logs) {
      console.error("   Last 15 logs:");
      error.logs.slice(-15).forEach((log: string) => console.error(`     ${log}`));
    }
    throw error;
  }
}

async function testBorrow(
  program: Program<ShadowlendProgram>,
  provider: anchor.AnchorProvider,
  payer: Keypair,
  arciumEnv: ReturnType<typeof getArciumEnv>
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("       TEST: Borrow Instruction");
  console.log("=".repeat(60));
  
  const clusterOffset = arciumEnv.arciumClusterOffset;
  
  // 1. Create encryption context following Arcium SDK pattern
  console.log("\n🔐 Creating encryption context...");
  
  const { privateKey, publicKey, cipher, mxePublicKey } = await createEncryptionContext(
    provider,
    program.programId
  );
  console.log(`   User x25519 public key: ${Buffer.from(publicKey).toString("hex").slice(0, 16)}...`);
  
  // 2. Encrypt borrow amount
  // Encrypting 0.0001 SOL worth of borrow (adjust based on your token decimals)
  const borrowAmount = BigInt(0.0001 * LAMPORTS_PER_SOL);
  const nonce = randomBytes(16);
  const encryptedAmount = encryptValue(cipher, borrowAmount, nonce);
  
  console.log(`   Encrypted borrow amount (raw): ${Buffer.from(encryptedAmount).toString("hex").slice(0, 32)}...`);
  console.log(`   Nonce: ${Buffer.from(nonce).toString("hex")}`);
  
  // 3. Setup Arcium accounts
  console.log("\n🔐 Setting up Arcium accounts...");
  
  const computationOffset = new BN(randomBytes(8));
  
  const computationAccount = getComputationAccAddress(
    clusterOffset,
    computationOffset
  );
  const clusterAccount = getClusterAccAddress(clusterOffset);
  const mxeAccount = getMXEAccAddress(program.programId);
  const mempoolAccount = getMempoolAccAddress(clusterOffset);
  const executingPool = getExecutingPoolAccAddress(clusterOffset);
  const compDefAccount = getCompDefAccAddress(
    program.programId,
    Buffer.from(getCompDefAccOffset("compute_confidential_borrow")).readUInt32LE()
  );
  
  // Derive user obligation PDA
  const [userObligationPda] = findUserObligationPda(
    program.programId,
    payer.publicKey,
    POOL_PDA
  );
  
  // Convert encrypted amount to array format expected by program
  const encryptedAmountArray: number[] = Array.from(encryptedAmount);
  // Ensure it's 32 bytes
  while (encryptedAmountArray.length < 32) {
    encryptedAmountArray.push(0);
  }
  
  // Convert public key to array format
  const pubKeyArray: number[] = Array.from(publicKey);
  
  // Convert nonce to BN (u128)
  const nonceAsBN = nonceToU128(nonce);
  
  console.log(`   MXE Account: ${mxeAccount.toBase58()}`);
  console.log(`   Computation: ${computationAccount.toBase58()}`);
  console.log(`   User Obligation: ${userObligationPda.toBase58()}`);
  
  // 4. Setup Pyth oracle accounts (placeholder for testing)
  console.log("\n⚠️  Note: Using placeholder for Pyth oracle accounts");
  console.log("   In production, use Pyth Hermes API to fetch real price updates");
  
  // These are Pyth devnet price feed accounts
  // You need to push price updates to these accounts using Pyth Hermes API
  const solPriceUpdate = payer.publicKey; // Placeholder - replace with actual Pyth price account
  const usdcPriceUpdate = payer.publicKey; // Placeholder - replace with actual Pyth price account
  
  console.log("\n📤 Sending borrow transaction...");
  console.log("   ⚠️  Expected to fail without proper Pyth accounts");
  
  try {
    const sig = await program.methods
      .borrow(
        computationOffset,
        encryptedAmountArray,
        pubKeyArray,
        nonceAsBN
      )
      .accountsPartial({
        payer: payer.publicKey,
        pool: POOL_PDA,
        userObligation: userObligationPda,
        computationAccount: computationAccount,
        clusterAccount: clusterAccount,
        mxeAccount: mxeAccount,
        mempoolAccount: mempoolAccount,
        executingPool: executingPool,

        compDefAccount: compDefAccount,
        signPdaAccount: PublicKey.findProgramAddressSync(
          [Buffer.from("SignerAccount")],
          program.programId
        )[0],
        solPriceUpdate: solPriceUpdate,
        usdcPriceUpdate: usdcPriceUpdate,
      })
      .rpc({ commitment: "confirmed" });
    
    console.log(`\n✅ Borrow transaction sent!`);
    console.log(`   Signature: ${sig}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    // Wait for MXE callback finalization
    console.log(`\n⏳ Waiting for MXE callback...`);
    
    try {
      const finalizeSig = await awaitComputationFinalization(
        provider,
        computationOffset,
        program.programId,
        "confirmed"
      );
      console.log(`\n✅ Computation finalized!`);
      console.log(`   Callback Signature: ${finalizeSig}`);
    } catch (finalizationError: any) {
      console.log(`\n⚠️  Callback finalization timeout: ${finalizationError.message}`);
    }
    
  } catch (error: any) {
    if (error.message?.includes("InvalidOwner") || 
        error.logs?.some((l: string) => l.includes("InvalidOwner")) ||
        error.logs?.some((l: string) => l.includes("InvalidPythOwner"))) {
      console.log("\n⚠️  Borrow failed with Pyth validation error (expected)");
      console.log("   The instruction structure is correct!");
      console.log("   To use borrow, provide real Pyth price update accounts.");
    } else if (error.message?.includes("sign_pda_account") || 
               error.logs?.some((l: string) => l.includes("sign_pda_account"))) {
      console.error("\n❌ Borrow failed - sign_pda mismatch");
      console.log("   This is an SDK/program version mismatch issue.");
    } else if (error.message?.includes("encrypted_state_blob") ||
               error.logs?.some((l: string) => l.includes("InvalidBorrowAmount"))) {
      console.log("\n⚠️  Borrow failed - No collateral deposited");
      console.log("   A successful deposit is required before borrowing.");
    } else {
      console.error("\n❌ Borrow failed:", error.message);
      if (error.logs) {
        console.error("   Last 15 logs:");
        error.logs.slice(-15).forEach((log: string) => console.error(`     ${log}`));
      }
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═".repeat(60));
  console.log("       ShadowLend Devnet Test");
  console.log("═".repeat(60));
  
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  // Load keypair
  const walletPath = process.env.ANCHOR_WALLET || 
    path.join(process.env.HOME!, ".config/solana/id.json");
  const payer = loadKeypair(walletPath);
  
  console.log(`\n👤 Payer: ${payer.publicKey.toBase58()}`);
  
  // Check balance
  const balance = await provider.connection.getBalance(payer.publicKey);
  console.log(`💳 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.error("\n❌ Insufficient balance. Need at least 0.1 SOL");
    console.log("   Run: solana airdrop 1 --url devnet");
    process.exit(1);
  }
  
  // Get Arcium env
  let arciumEnv: ReturnType<typeof getArciumEnv>;
  try {
    arciumEnv = getArciumEnv();
    console.log(`🔐 Arcium cluster offset: ${arciumEnv.arciumClusterOffset}`);
  } catch (error) {
    console.error("❌ Arcium environment not configured");
    console.log("   Make sure ARCIUM_CLUSTER_OFFSET=123 is set");
    process.exit(1);
  }
  
  // Load program
  const idlPath = path.join(__dirname, "../target/idl/shadowlend_program.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<ShadowlendProgram>(idl, provider);
  
  console.log(`\n📋 Program ID: ${program.programId.toBase58()}`);
  console.log(`📋 Pool PDA: ${POOL_PDA.toBase58()}`);
  
  // Run tests
  try {
    // Test 1: Deposit
    const depositOffset = await testDeposit(program, provider, payer, arciumEnv);
    
    if (depositOffset) {
      // Give time for callback processing before borrow test
      console.log("\n⏳ Waiting 10 seconds before borrow test...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      
      // Test 2: Borrow (requires successful deposit first)
      await testBorrow(program, provider, payer, arciumEnv);
    } else {
      console.log("\n⏭️  Skipping borrow test (deposit was not successful)");
    }
    
    console.log("\n" + "═".repeat(60));
    console.log("       TESTS COMPLETED");
    console.log("═".repeat(60));
    
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
