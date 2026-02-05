import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { program } from "../../idl";
import {
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getClusterAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getArciumProgramId,
} from "@arcium-hq/client";
import { BN } from "@coral-xyz/anchor";

import { ARCIUM_LOCALNET_CLUSTER_OFFSET } from "../../constants/arcium";
import { DepositInstructionParams } from "../interfaces";
import {
  getMxeAccount,
  generateComputationOffset,
  getPoolAccount,
  getUserObligationAccount,
  getCollateralVaultAccount,
  getSignPdaAccount,
} from "../generation";

/**
 * Builds a valid Solana instruction for depositing assets into the ShadowLend protocol.
 *
 * @remarks
 * This function handles the construction of the confidential deposit interaction.
 *
 * @param params - The parameters required for the deposit instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.collateralMint - The mint address of the collateral token.
 * @param params.amount - The amount to deposit (u64).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 *
 * @returns A Promise that resolves to the TransactionInstruction.
 */
export async function buildDepositInstruction({
  user,
  collateralMint,
  amount,
  userNonce,
  userPublicKey,
  clusterOffset,
}: DepositInstructionParams) {
  const programId = program.programId;
  const arciumClusterOffset = clusterOffset ?? ARCIUM_LOCALNET_CLUSTER_OFFSET;

  // --- Arcium Accounts ---
  const computationOffset = generateComputationOffset();
  const mxeAccount = getMxeAccount();

  const mempoolAccount = getMempoolAccAddress(arciumClusterOffset);
  const executingPool = getExecutingPoolAccAddress(arciumClusterOffset);
  const computationAccount = getComputationAccAddress(
    arciumClusterOffset,
    computationOffset,
  );

  // "deposit" comp def
  const compDefOffsetBytes = getCompDefAccOffset("deposit");
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const clusterAccount = getClusterAccAddress(arciumClusterOffset);
  const poolAccount = getFeePoolAccAddress(); // Fee pool
  const clockAccount = getClockAccAddress();
  const arciumProgramId = getArciumProgramId();

  // --- Solana / ShadowLend Accounts ---
  const signPdaAccount = getSignPdaAccount();
  const pool = getPoolAccount();
  const userObligation = getUserObligationAccount(user, pool);
  const collateralVault = getCollateralVaultAccount(pool);

  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);

  // Auto-resolve user token account
  const userTokenAccount = getAssociatedTokenAddressSync(
    collateralMint,
    user,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const instruction = await program.methods
    .deposit(computationOffset, amount, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      signPdaAccount: signPdaAccount,
      mxeAccount: mxeAccount,
      mempoolAccount: mempoolAccount,
      executingPool: executingPool,
      computationAccount: computationAccount,
      compDefAccount: compDefAccount,
      clusterAccount: clusterAccount,
      poolAccount: poolAccount,
      clockAccount: clockAccount,
      pool: pool,
      userObligation: userObligation,
      collateralMint: collateralMint,
      userTokenAccount: userTokenAccount,
      collateralVault: collateralVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      arciumProgram: arciumProgramId,
    } as any)
    .instruction();

  return instruction;
}
