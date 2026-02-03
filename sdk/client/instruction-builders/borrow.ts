import { SystemProgram } from "@solana/web3.js";
import { program } from "@/idl";
import {
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getClusterAccAddress,
  getArciumProgram,
} from "@arcium-hq/client";

import { ARCIUM_DEVNET_CLUSTER_OFFSET } from "@/constants/arcium";
import { BorrowInstructionParams } from "@/client/interfaces/borrow";
import { 
  getMxeAccount, 
  generateComputationOffset 
} from "@/client/generation/arcium";

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
}: BorrowInstructionParams) {
  const programId = program.programId;
  const arciumClusterOffset = ARCIUM_DEVNET_CLUSTER_OFFSET;

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
  
  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);
  const amountArray = Array.from(amount); // Ciphertext is Uint8Array/Bytes

  const instruction = await program.methods
    .borrow(computationOffset, amountArray, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      mxe_account: mxeAccount,
      mempool_account: mempoolAccount,
      executing_pool: executingPool,
      computation_account: computationAccount,
      comp_def_account: compDefAccount,
      cluster_account: clusterAccount,
    })
    .instruction();

  return instruction;
}
