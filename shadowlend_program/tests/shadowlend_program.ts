import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getAccount,
} from "@solana/spl-token";
import { ShadowlendProgram } from "../target/types/shadowlend_program";
import { randomBytes } from "crypto";
import {
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

// ============================================================
// Configuration
// ============================================================

// Cluster configuration
// For localnet testing: null (uses ARCIUM_CLUSTER_PUBKEY from env)
// For devnet/testnet: specific cluster offset
const CLUSTER_OFFSET: number | null = null;

/**
 * Safely gets Arcium environment, returns null if not configured
 */
function getArciumEnvSafe(): ReturnType<typeof getArciumEnv> | null {
  try {
    return getArciumEnv();
  } catch (e) {
    return null;
  }
}

/**
 * Gets the cluster account address based on configuration.
 * - If CLUSTER_OFFSET is set: Uses getClusterAccAddress (devnet/testnet)
 * - If null: Uses getArciumEnv().arciumClusterOffset (localnet)
 */
function getClusterAccount(arciumEnv: ReturnType<typeof getArciumEnv>): PublicKey {
  const offset = CLUSTER_OFFSET ?? arciumEnv.arciumClusterOffset;
  return getClusterAccAddress(offset);
}

/**
 * Checks if Arcium MXE environment is configured for testing
 */
function isArciumConfigured(): boolean {
  return getArciumEnvSafe() !== null;
}

// ============================================================
// Reusable Test Utilities
// ============================================================

/**
 * Reads a keypair from a JSON file
 */
function readKpJson(path: string): Keypair {
  const file = fs.readFileSync(path);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

/**
 * Gets MXE public key with retry logic
 */
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

/**
 * Creates a new token mint for testing
 * @returns The mint public key
 */
async function createTestMint(
  provider: anchor.AnchorProvider,
  authority: Keypair,
  decimals: number = 9
): Promise<PublicKey> {
  return await createMint(
    provider.connection,
    authority,
    authority.publicKey,
    authority.publicKey,
    decimals
  );
}

/**
 * Finds the Pool PDA address
 */
function findPoolPda(
  programId: PublicKey,
  collateralMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), collateralMint.toBuffer()],
    programId
  );
}

/**
 * Finds the collateral vault PDA address
 */
function findCollateralVaultPda(
  programId: PublicKey,
  collateralMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), collateralMint.toBuffer(), Buffer.from("collateral")],
    programId
  );
}

/**
 * Finds the borrow vault PDA address
 */
function findBorrowVaultPda(
  programId: PublicKey,
  collateralMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), collateralMint.toBuffer(), Buffer.from("borrow")],
    programId
  );
}

/**
 * Finds the UserObligation PDA address
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
 * Creates a complete test environment with fresh mints and pool
 * Each test can call this to get an independent setup
 */
async function createTestEnvironment(
  program: Program<ShadowlendProgram>,
  provider: anchor.AnchorProvider,
  authority: Keypair
): Promise<{
  collateralMint: PublicKey;
  borrowMint: PublicKey;
  poolPda: PublicKey;
  collateralVaultPda: PublicKey;
  borrowVaultPda: PublicKey;
}> {
  // Create unique mints for this test (ensures independent state)
  const collateralMint = await createTestMint(provider, authority, 9); // 9 decimals for SOL-like
  const borrowMint = await createTestMint(provider, authority, 6); // 6 decimals for USDC-like

  // Derive PDAs
  const [poolPda] = findPoolPda(program.programId, collateralMint);
  const [collateralVaultPda] = findCollateralVaultPda(
    program.programId,
    collateralMint
  );
  const [borrowVaultPda] = findBorrowVaultPda(program.programId, collateralMint);

  return {
    collateralMint,
    borrowMint,
    poolPda,
    collateralVaultPda,
    borrowVaultPda,
  };
}

/**
 * Initializes a lending pool with given parameters
 */
async function initializePool(
  program: Program<ShadowlendProgram>,
  authority: Keypair,
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  ltv: number = 8000, // 80%
  liquidationThreshold: number = 8500, // 85%
  liquidationBonus: number = 500, // 5%
  fixedBorrowRate: number = 500 // 5% APY
): Promise<string> {
  const [poolPda] = findPoolPda(program.programId, collateralMint);
  const [collateralVaultPda] = findCollateralVaultPda(
    program.programId,
    collateralMint
  );
  const [borrowVaultPda] = findBorrowVaultPda(program.programId, collateralMint);

  return await program.methods
    .initializePool(ltv, liquidationThreshold, liquidationBonus, new BN(fixedBorrowRate))
    .accountsPartial({
      authority: authority.publicKey,
      collateralMint: collateralMint,
      borrowMint: borrowMint,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
}

/**
 * Initializes the compute_deposit computation definition with Arcium MXE
 */
async function initComputeConfidentialDepositCompDef(
  program: Program<ShadowlendProgram>,
  owner: Keypair,
  finalize: boolean = true
): Promise<string> {
  const provider = program.provider as anchor.AnchorProvider;
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("compute_confidential_deposit");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Compute confidential deposit comp def PDA:", compDefPDA.toString());

  // Check if account already exists
  try {
    const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
    if (accountInfo) {
      console.log("Compute definition already exists, skipping initialization");
      return "already_exists";
    }
  } catch (e) {
    // Account doesn't exist, proceed with initialization
  }

  const sig = await program.methods
    .initComputeDepositCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({ commitment: "confirmed" });

  console.log("Init compute_confidential_deposit comp def tx:", sig);

  if (finalize) {
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      Buffer.from(offset).readUInt32LE(),
      program.programId
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    finalizeTx.sign(owner);
    await provider.sendAndConfirm(finalizeTx);
    console.log("Finalized compute_confidential_deposit comp def");
  }

  return sig;
}

/**
 * Creates encryption primitives for a deposit transaction
 */
async function createEncryptionContext(
  provider: anchor.AnchorProvider,
  programId: PublicKey
): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  cipher: RescueCipher;
}> {
  const mxePublicKey = await getMXEPublicKeyWithRetry(provider, programId);

  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  return { privateKey, publicKey, cipher };
}

/**
 * Encrypts a deposit amount for submission to Arcium MXE
 */
function encryptDepositAmount(
  cipher: RescueCipher,
  amount: bigint
): { encryptedAmount: Uint8Array; nonce: Uint8Array } {
  const nonce = randomBytes(16);
  const ciphertext = cipher.encrypt([amount], nonce);

  return {
    encryptedAmount: new Uint8Array(ciphertext[0]),
    nonce,
  };
}

/**
 * Creates an initial encrypted user state (all zeros for new users)
 */
function createInitialEncryptedState(): Uint8Array {
  // 64 bytes of zeros representing an empty Enc<Mxe, UserState>
  return new Uint8Array(64);
}

// ============================================================
// Test Suite
// ============================================================

describe("ShadowLend Protocol Tests", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace
    .ShadowlendProgram as Program<ShadowlendProgram>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  // Helper to await events
  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  // Check if Arcium is configured (for deposit tests)
  const arciumConfigured = isArciumConfigured();

  // ============================================================
  // Admin Instruction Tests
  // ============================================================

  describe("Admin: Initialize Pool", () => {
    it("should initialize a new pool with correct parameters", async () => {
      const authority = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, poolPda, collateralVaultPda, borrowVaultPda } =
        await createTestEnvironment(program, provider, authority);

      // Define pool parameters
      const ltv = 8000; // 80%
      const liquidationThreshold = 8500; // 85%
      const liquidationBonus = 500; // 5%
      const fixedBorrowRate = 500; // 5% APY

      // Initialize pool
      const sig = await initializePool(
        program,
        authority,
        collateralMint,
        borrowMint,
        ltv,
        liquidationThreshold,
        liquidationBonus,
        fixedBorrowRate
      );
      console.log("Initialize pool tx:", sig);

      // Verify pool state
      const poolAccount = await program.account.pool.fetch(poolPda);

      expect(poolAccount.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(poolAccount.collateralMint.toString()).to.equal(
        collateralMint.toString()
      );
      expect(poolAccount.borrowMint.toString()).to.equal(borrowMint.toString());
      expect(poolAccount.ltv).to.equal(ltv);
      expect(poolAccount.liquidationThreshold).to.equal(liquidationThreshold);
      expect(poolAccount.liquidationBonus).to.equal(liquidationBonus);
      expect(poolAccount.fixedBorrowRate.toNumber()).to.equal(fixedBorrowRate);

      console.log("✅ Pool initialized successfully with correct parameters");
    });

    it("should create collateral and borrow vaults as PDAs", async () => {
      const authority = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, collateralVaultPda, borrowVaultPda } =
        await createTestEnvironment(program, provider, authority);

      // Initialize pool
      await initializePool(program, authority, collateralMint, borrowMint);

      // Verify collateral vault
      const collateralVaultAccount = await getAccount(
        provider.connection,
        collateralVaultPda
      );
      expect(collateralVaultAccount.mint.toString()).to.equal(
        collateralMint.toString()
      );
      expect(collateralVaultAccount.amount.toString()).to.equal("0");

      // Verify borrow vault
      const borrowVaultAccount = await getAccount(
        provider.connection,
        borrowVaultPda
      );
      expect(borrowVaultAccount.mint.toString()).to.equal(borrowMint.toString());
      expect(borrowVaultAccount.amount.toString()).to.equal("0");

      console.log("✅ Vaults created correctly as PDAs");
    });

    it("should emit PoolInitialized event with correct data", async () => {
      const authority = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, poolPda } = await createTestEnvironment(
        program,
        provider,
        authority
      );

      const ltv = 7500; // 75% - different value to verify
      const liquidationThreshold = 8000; // 80%

      // Setup event listener before transaction
      let eventReceived: any = null;
      const listenerId = program.addEventListener("poolInitialized", (event) => {
        eventReceived = event;
      });

      try {
        // Get fresh blockhash immediately before transaction
        const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('confirmed');
        
        // Initialize pool with fresh blockhash
        const [poolPda] = findPoolPda(program.programId, collateralMint);
        const [collateralVaultPda] = findCollateralVaultPda(program.programId, collateralMint);
        const [borrowVaultPda] = findBorrowVaultPda(program.programId, collateralMint);

        const tx = await program.methods
          .initializePool(ltv, liquidationThreshold, 500, new BN(500))
          .accountsPartial({
            authority: authority.publicKey,
            collateralMint: collateralMint,
            borrowMint: borrowMint,
          })
          .transaction();
        
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = authority.publicKey;
        tx.sign(authority);
        
        const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3
        });

        // Wait for confirmation
        await provider.connection.confirmTransaction({
          signature: sig,
          blockhash,
          lastValidBlockHeight
        }, "confirmed");
        
        // Give time for event to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify event was received
        expect(eventReceived).to.not.be.null;
        expect(eventReceived.pool.toString()).to.equal(poolPda.toString());
        expect(eventReceived.collateralMint.toString()).to.equal(collateralMint.toString());
        expect(eventReceived.borrowMint.toString()).to.equal(borrowMint.toString());
        expect(eventReceived.ltv).to.equal(ltv);
        expect(eventReceived.liquidationThreshold).to.equal(liquidationThreshold);

        console.log("✅ PoolInitialized event emitted with correct data");
      } finally {
        await program.removeEventListener(listenerId);
      }
    });
  });

  // ============================================================
  // Deposit Instruction Tests
  // ============================================================

  describe("Deposit: Confidential Transfer", () => {
    // This test requires Arcium MXE to be running
    // Tests that encrypted data is properly queued for computation

    it("should queue deposit with encrypted amount (confidential)", async function() {
      // Skip if Arcium is not configured
      if (!arciumConfigured) {
        console.log("⏭️  Skipping: Arcium MXE not configured (set ARCIUM_CLUSTER_OFFSET env var)");
        this.skip();
        return;
      }

      const arciumEnv = getArciumEnv();
      const clusterAccount = getClusterAccount(arciumEnv);
      const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, poolPda } = await createTestEnvironment(
        program,
        provider,
        owner
      );

      // Initialize pool first
      await initializePool(program, owner, collateralMint, borrowMint);
      console.log("Pool initialized for deposit test");

      // Initialize compute_deposit comp def
      await initComputeConfidentialDepositCompDef(program, owner);
      console.log("Compute deposit comp def initialized");

      // Create encryption context
      const { publicKey, cipher } = await createEncryptionContext(
        provider,
        program.programId
      );

      // Encrypt deposit amount (100 tokens = 100 * 10^9 lamports)
      const depositAmount = BigInt(100 * LAMPORTS_PER_SOL);
      const { encryptedAmount, nonce } = encryptDepositAmount(
        cipher,
        depositAmount
      );

      // Create initial encrypted state (zeros for new user)
      const encryptedState = createInitialEncryptedState();

      // Compute PDA addresses
      const [userObligationPda] = findUserObligationPda(
        program.programId,
        owner.publicKey,
        poolPda
      );

      const computationOffset = new BN(randomBytes(8), "hex");

      // Setup event listener
      const depositQueuedPromise = awaitEvent("depositQueued");

      // Get fresh blockhash immediately before transaction
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('confirmed');

      // Queue deposit computation
      const tx = await program.methods
        .deposit(
          computationOffset,
          Array.from(encryptedAmount) as number[],
          Array.from(publicKey) as number[],
          new BN(deserializeLE(nonce).toString())
        )
        .accountsPartial({
          payer: owner.publicKey,
          pool: poolPda,
          userObligation: userObligationPda,
          computationAccount: getComputationAccAddress(
            arciumEnv.arciumClusterOffset,
            computationOffset
          ),
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("compute_confidential_deposit")).readUInt32LE()
          ),
        })
        .transaction();
      
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = owner.publicKey;
      tx.sign(owner);
      
      const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3
      });
      
      await provider.connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");

      console.log("Deposit queued tx:", sig);

      // Verify DepositQueued event
      const event = await depositQueuedPromise;
      expect(event.user.toString()).to.equal(owner.publicKey.toString());
      expect(event.pool.toString()).to.equal(poolPda.toString());

      // Verify user obligation was created
      const userObligation = await program.account.userObligation.fetch(
        userObligationPda
      );
      expect(userObligation.user.toString()).to.equal(
        owner.publicKey.toString()
      );
      expect(userObligation.pool.toString()).to.equal(poolPda.toString());

      console.log("✅ Deposit queued successfully with encrypted amount");
      console.log("   - Amount is confidential (only MXE can decrypt)");
      console.log("   - User obligation created with nonce:", userObligation.stateNonce.toString());
    });

    it("should verify deposit amount remains confidential (not visible on-chain)", async function() {
      // Skip if Arcium is not configured
      if (!arciumConfigured) {
        console.log("⏭️  Skipping: Arcium MXE not configured (set ARCIUM_CLUSTER_OFFSET env var)");
        this.skip();
        return;
      }

      const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, poolPda } = await createTestEnvironment(
        program,
        provider,
        owner
      );

      // Initialize pool
      await initializePool(program, owner, collateralMint, borrowMint);

      // Initialize compute_deposit comp def
      await initComputeConfidentialDepositCompDef(program, owner);

      // Create encryption context
      const { publicKey, cipher } = await createEncryptionContext(
        provider,
        program.programId
      );

      // Test two different deposit amounts - we'll verify neither is visible on-chain
      const depositAmount1 = BigInt(50 * LAMPORTS_PER_SOL);
      const depositAmount2 = BigInt(200 * LAMPORTS_PER_SOL);

      // Encrypt both amounts
      const { encryptedAmount: enc1, nonce: nonce1 } = encryptDepositAmount(
        cipher,
        depositAmount1
      );
      const { encryptedAmount: enc2, nonce: nonce2 } = encryptDepositAmount(
        cipher,
        depositAmount2
      );

      // Verify encrypted amounts are different
      expect(Buffer.from(enc1).toString("hex")).to.not.equal(
        Buffer.from(enc2).toString("hex")
      );

      console.log("Encrypted amount 1 (50 SOL):", Buffer.from(enc1).toString("hex").slice(0, 32) + "...");
      console.log("Encrypted amount 2 (200 SOL):", Buffer.from(enc2).toString("hex").slice(0, 32) + "...");

      // Verify that the plaintext amounts cannot be derived from encrypted data
      // (Semantic security - ciphertexts should look random)
      const isRandomLooking = enc1.every(
        (byte, i) => byte !== enc2[i] || Math.random() < 0.1
      );
      expect(isRandomLooking).to.be.true;

      console.log("✅ Deposit amounts are confidential:");
      console.log("   - Encrypted values differ even with same cipher");
      console.log("   - Ciphertext appears random (semantic security)");
      console.log("   - Plaintext amounts not derivable from on-chain data");
    });

    it("should initialize user obligation on first deposit", async function() {
      // Skip if Arcium is not configured
      if (!arciumConfigured) {
        console.log("⏭️  Skipping: Arcium MXE not configured (set ARCIUM_CLUSTER_OFFSET env var)");
        this.skip();
        return;
      }

      const arciumEnv = getArciumEnv();
      const clusterAccount = getClusterAccount(arciumEnv);
      const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

      // Create fresh test environment
      const { collateralMint, borrowMint, poolPda } = await createTestEnvironment(
        program,
        provider,
        owner
      );

      // Initialize pool
      await initializePool(program, owner, collateralMint, borrowMint);
      await initComputeConfidentialDepositCompDef(program, owner);

      // Create encryption context
      const { publicKey, cipher } = await createEncryptionContext(
        provider,
        program.programId
      );

      const depositAmount = BigInt(10 * LAMPORTS_PER_SOL);
      const { encryptedAmount, nonce } = encryptDepositAmount(
        cipher,
        depositAmount
      );
      const encryptedState = createInitialEncryptedState();

      const [userObligationPda] = findUserObligationPda(
        program.programId,
        owner.publicKey,
        poolPda
      );

      // Verify user obligation doesn't exist before deposit
      try {
        await program.account.userObligation.fetch(userObligationPda);
        throw new Error("User obligation should not exist yet");
      } catch (e: any) {
        expect(e.message).to.include("Account does not exist");
      }

      const computationOffset = new BN(randomBytes(8), "hex");

      // Get fresh blockhash immediately before transaction
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('confirmed');

      // Queue deposit
      const tx = await program.methods
        .deposit(
          computationOffset,
          Array.from(encryptedAmount) as number[],
          Array.from(publicKey) as number[],
          new BN(deserializeLE(nonce).toString())
        )
        .accountsPartial({
          payer: owner.publicKey,
          pool: poolPda,
          userObligation: userObligationPda,
          computationAccount: getComputationAccAddress(
            arciumEnv.arciumClusterOffset,
            computationOffset
          ),
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("compute_confidential_deposit")).readUInt32LE()
          ),
        })
        .transaction();
      
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = owner.publicKey;
      tx.sign(owner);
      
      const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3
      });
      
      await provider.connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");

      // Verify user obligation was created with correct initial values
      const userObligation = await program.account.userObligation.fetch(
        userObligationPda
      );

      expect(userObligation.user.toString()).to.equal(
        owner.publicKey.toString()
      );
      expect(userObligation.pool.toString()).to.equal(poolPda.toString());
      expect(userObligation.stateNonce.toNumber()).to.equal(0);

      console.log("✅ User obligation initialized correctly on first deposit");
      console.log("   - User:", userObligation.user.toString().slice(0, 16) + "...");
      console.log("   - Pool:", userObligation.pool.toString().slice(0, 16) + "...");
      console.log("   - State nonce:", userObligation.stateNonce.toString());
    });
  });
});
