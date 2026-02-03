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
import { WithdrawInstructionParams } from "@/client/interfaces/withdraw";
import { 
  getMxeAccount, 
  generateComputationOffset 
} from "@/client/generation/arcium";

/**
 * Builds a valid Solana instruction for withdrawing collateral from the ShadowLend protocol.
 * 
 * @remarks
 * This instruction initiates a confidential withdrawal request.
 * 
 * @param params - The parameters required for the withdraw instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.collateralMint - The mint address of the collateral to withdraw.
 * @param params.amount - The amount to withdraw (atomic units).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 * 
 * @returns A Promise that resolves to the TransactionInstruction.
 * 
 * @example
 * ```ts
 * const ix = await buildWithdrawInstruction({
 *   user: wallet.publicKey,
 *   collateralMint: solMint,
 *   amount: toU64(500000000), // 0.5 SOL
 *   userNonce: currentNonce,
 *   userPublicKey: userArciumKey
 * });
 * ```
 */
export async function buildWithdrawInstruction({
  user,
  collateralMint,
  amount,
  userNonce,
  userPublicKey,
}: WithdrawInstructionParams) {
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

  // "withdraw" comp def
  const compDefOffsetBytes = getCompDefAccOffset("withdraw");
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const clusterAccount = getClusterAccAddress(arciumClusterOffset);
  
  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .withdraw(computationOffset, amount, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      mxe_account: mxeAccount,
      mempool_account: mempoolAccount,
      executing_pool: executingPool,
      computation_account: computationAccount,
      comp_def_account: compDefAccount,
      cluster_account: clusterAccount,
      collateral_mint: collateralMint,
      // user_token_account is auto-resolved by Anchor
    })
    .instruction();

  return instruction;
}
