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
import { BorrowInstructionParams } from "../interfaces/borrow";
import {
  getMxeAccount,
  generateComputationOffset,
  getPoolAccount,
  getUserObligationAccount,
  getSignPdaAccount,
} from "../generation";

/**
 * Builds a valid Solana instruction for borrowing assets from the ShadowLend protocol.
 *
 * @remarks
 * This function handles the construction of the confidential borrow interaction.
 * The `amount` parameter must be encrypted client-side using the Rescue cipher shared secret
 * before being passed to this function.
 *
 * @param params - The parameters required for the borrow instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.amount - The encrypted amount to borrow (ciphertext).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 *
 * @returns A Promise that resolves to the TransactionInstruction.
 *
 * @example
 * ```ts
 * const ix = await buildBorrowInstruction({
 *   user: wallet.publicKey,
 *   amount: encryptedAmount,
 *   userNonce: currentNonce,
 *   userPublicKey: userArciumKey
 * });
 * ```
 */
export async function buildBorrowInstruction({
  user,
  amount,
  userNonce,
  userPublicKey,
  clusterOffset,
}: BorrowInstructionParams) {
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

  // "borrow" comp def
  const compDefOffsetBytes = getCompDefAccOffset("borrow");
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

  // Convert keys
  const userPublicKeyArray = Array.from(userPublicKey);
  // amount is encrypted [u8; 32] passed as number[] or Uint8Array.
  // IDL expects array of numbers.
  const amountArray = Array.from(amount);

  const instruction = await program.methods
    .borrow(computationOffset, amountArray, userPublicKeyArray, userNonce)
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
      systemProgram: SystemProgram.programId,
      arciumProgram: arciumProgramId,
    } as any)
    .instruction();

  return instruction;
}
