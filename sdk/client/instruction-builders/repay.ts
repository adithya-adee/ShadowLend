import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
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
import { RepayInstructionParams } from "@/client/interfaces/repay";
import { 
  getMxeAccount, 
  generateComputationOffset 
} from "@/client/generation/arcium";

/**
 * Builds a valid Solana instruction for repaying borrowed assets to the ShadowLend protocol.
 * 
 * @remarks
 * This instruction allows a user to repay their debt. The repayment amount is checked against
 * the user's obligation.
 * 
 * @param params - The parameters required for the repay instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.borrowMint - The mint address of the borrowed token (e.g. USDC).
 * @param params.amount - The amount to repay (in atomic units).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 * 
 * @returns A Promise that resolves to the TransactionInstruction.
 * 
 * @example
 * ```ts
 * const ix = await buildRepayInstruction({
 *   user: wallet.publicKey,
 *   borrowMint: usdcMint,
 *   amount: toU64(1000000), // 1 USDC
 *   userNonce: currentNonce,
 *   userPublicKey: userArciumKey
 * });
 * ```
 */
export async function buildRepayInstruction({
  user,
  borrowMint,
  amount,
  userNonce,
  userPublicKey,
}: RepayInstructionParams) {
  const programId = program.programId;
  const arciumClusterOffset = ARCIUM_DEVNET_CLUSTER_OFFSET;

  // --- Account Derivation ---
  // pool is needed for implicit derivations if not passed, but mainly user_token_account
  // user_token_account derivation in IDL (line 1603) is standard ATA of payer + borrow_mint?
  // IDL: seeds [account: payer, const: ..., account: borrow_mint]. Yes, ATA.
  
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
  
  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .repay(computationOffset, amount, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      mxe_account: mxeAccount,
      mempool_account: mempoolAccount,
      executing_pool: executingPool,
      computation_account: computationAccount,
      comp_def_account: compDefAccount,
      cluster_account: clusterAccount,
      borrow_mint: borrowMint,
    })
    .instruction();

  return instruction;
}
