import * as dotenv from "dotenv";
dotenv.config();
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { ShadowlendProgram } from "../target/types/shadowlend_program";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  buildFinalizeCompDefTx,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getClockAccAddress,
  getFeePoolAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

describe("shadowlend-program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.ShadowlendProgram as Program<ShadowlendProgram>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumEnv = getArciumEnv();

  // Test state
  let collateralMint: PublicKey;
  let borrowMint: PublicKey;
  let poolPda: PublicKey;
  let collateralVaultPda: PublicKey;
  let borrowVaultPda: PublicKey;
  let userTokenAccount: PublicKey;
  
  const user = anchor.web3.Keypair.generate();
  const payer = (provider.wallet as any).payer;

  before(async () => {
    // Fund user
    await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Create mints
    collateralMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    borrowMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    // Derive Pool PDA
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );
    poolPda = pool;

    // Derive Vaults
    const [cv] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), pool.toBuffer()],
      program.programId
    );
    collateralVaultPda = cv;

    const [bv] = PublicKey.findProgramAddressSync(
      [Buffer.from("borrow_vault"), pool.toBuffer()],
      program.programId
    );
    borrowVaultPda = bv;
  });

  it("Initializes the pool", async () => {
    const ltv = 7500;
    const thresh = 8500;

    await program.methods
      .initializePool(ltv, thresh)
      .accounts({
        authority: provider.wallet.publicKey,
        collateralMint,
        borrowMint,
      })
      .rpc();
      
    const poolAccount = await program.account.pool.fetch(poolPda);
    expect(poolAccount.ltvBps).to.equal(ltv);
  });

  it("Initializes Deposit Computation Definition", async () => {
    // Initialize Comp Def
    const offset = getCompDefAccOffset("deposit");
    const compDefPDA = getCompDefAccAddress(
        program.programId,
        Buffer.from(offset).readUInt32LE()
    );

    try {
        await program.methods
        .initDepositCompDef()
        .accounts({
            authority: provider.wallet.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
            compDefAccount: compDefPDA,
        })
        .rpc();
    } catch(e) {
        // Ignore if already initialized
        console.log("Comp def might be already initialized");
    }

    // Finalize Comp Def (mocking offchain finalization for localnet/devnet if needed, 
    // but typically Arcium client handles this or we simulate it. 
    // For local tests without real Arcium nodes, we often skip or mock.
    // However, assuming integrated environment:
    
    // Here we usually assume checking if it's finalized or finalize it. 
    // The previous test mock finalized it.
    
    // We will assume environment is set up or try to finalize.
    try {
        const finalizeTx = await buildFinalizeCompDefTx(
            provider,
            Buffer.from(offset).readUInt32LE(),
            program.programId
        );
         const latestBlockhash = await provider.connection.getLatestBlockhash();
          finalizeTx.recentBlockhash = latestBlockhash.blockhash;
          finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
          finalizeTx.sign(payer);
          await provider.sendAndConfirm(finalizeTx);
    } catch (e) {
        console.log("Finalization might have failed or already done", e);
    }
  });

  it("Deposits successfully", async () => {
    // Setup user token account and mint tokens
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      collateralMint,
      user.publicKey
    );

    const amount = 100_000n;
    await mintTo(
      provider.connection,
      payer,
      collateralMint,
      userTokenAccount,
      payer,
      amount
    );

    // Prepare deposit args
    const computationOffset = new anchor.BN(randomBytes(8));
    const userNonce = new anchor.BN(Date.now());
    
    // Encryption keys
    const userKeypair = x25519.utils.randomPrivateKey();
    const userPubkey = x25519.getPublicKey(userKeypair);

    // Derive PDAs
    const [userObligation] = PublicKey.findProgramAddressSync(
      [Buffer.from("obligation"), user.publicKey.toBuffer(), poolPda.toBuffer()],
      program.programId
    );
    
    // signPdaAccount is auto-derived (constant seeds)
    
    const depositAmount = new anchor.BN(amount.toString());

    // Execute Deposit
    await program.methods
      .deposit(
        computationOffset,
        depositAmount,
        Array.from(userPubkey),
        userNonce
      )
      .accounts({
        payer: user.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        computationAccount: getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset),
        compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("deposit")).readUInt32LE(),
        ),
        
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
        
        collateralMint,
      })
      .signers([user])
      .rpc();

    console.log("Deposit tx successful, waiting for finalization...");
    
    // Wait for callback (Computation Finalization)
    try {
        await awaitComputationFinalization(
          provider,
          computationOffset,
          program.programId,
          "confirmed"
        );
    } catch(e) {
        console.log("Finalization wait failed or timed out", e);
    }
    
    // Check UserObligation
    const obligation = await program.account.userObligation.fetch(userObligation);
    console.log("Obligation State Nonce:", obligation.stateNonce.toString());
    console.log("Encrypted Deposit:", obligation.encryptedDeposit);
    
    expect(obligation.user.toBase58()).to.equal(user.publicKey.toBase58());
    expect(obligation.pool.toBase58()).to.equal(poolPda.toBase58());
    // Verification of encrypted deposit requires decryption using the cluster key, 
    // but here we at least verify it's not empty if successful, or check state nonce.
    // If the callback fails, stateNonce won't increment (it starts at 0).
    expect(obligation.stateNonce.gt(new anchor.BN(0))).to.be.true;
  });
});
