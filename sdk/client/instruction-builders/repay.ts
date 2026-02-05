import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
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

import { program } from "../../idl";
import { ARCIUM_LOCALNET_CLUSTER_OFFSET } from "../../constants/arcium";
import { RepayInstructionParams } from "../interfaces";
import {
  getMxeAccount,
  generateComputationOffset,
  getPoolAccount,
  getUserObligationAccount,
  getBorrowVaultAccount,
  getSignPdaAccount,
} from "../generation";

/**
 * Builds a valid Solana instruction for repaying borrowed assets to the ShadowLend protocol.
 *
 * @remarks
 * This function handles the construction of the confidential repay interaction.
 * The `amount` parameter must be encrypted client-side using the Rescue cipher shared secret.
 *
 * @param params - The parameters required for the repay instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.borrowMint - The mint address of the borrowed token.
 * @param params.amount - The encrypted amount to repay (ciphertext).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 *
 * @returns A Promise that resolves to the TransactionInstruction.
 */
export async function buildRepayInstruction({
  user,
  borrowMint,
  amount,
  userNonce,
  userPublicKey,
  clusterOffset,
}: RepayInstructionParams) {
  const programId = program.programId;
  const arciumClusterOffset = clusterOffset ?? ARCIUM_LOCALNET_CLUSTER_OFFSET;

  // Arcium Accounts
  const computationOffset = generateComputationOffset();
  const mxeAccount = getMxeAccount();

  const mempoolAccount = getMempoolAccAddress(arciumClusterOffset);
  const executingPool = getExecutingPoolAccAddress(arciumClusterOffset);
  const computationAccount = getComputationAccAddress(
    arciumClusterOffset,
    computationOffset,
  );

  // "repay" comp def
  const compDefOffsetBytes = getCompDefAccOffset("repay");
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const clusterAccount = getClusterAccAddress(arciumClusterOffset);
  const poolAccount = getFeePoolAccAddress();
  const clockAccount = getClockAccAddress();
  const arciumProgramId = getArciumProgramId();

  // --- Solana / ShadowLend Accounts ---
  const signPdaAccount = getSignPdaAccount();
  const pool = getPoolAccount();
  const userObligation = getUserObligationAccount(user, pool);
  const borrowVault = getBorrowVaultAccount(pool);

  // User Token Account (Source for repayment - wallet ATA of proper mint)
  const userTokenAccount = getAssociatedTokenAddressSync(
    borrowMint,
    user,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Convert keys
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .repay(computationOffset, amount, userPublicKeyArray, userNonce)
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
      borrowMint: borrowMint,
      userTokenAccount: userTokenAccount,
      borrowVault: borrowVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      arciumProgram: arciumProgramId,
    } as any)
    .instruction();

  return instruction;
}
