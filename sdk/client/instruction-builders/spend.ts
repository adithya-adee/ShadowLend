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
import { SpendInstructionParams } from "@/client/interfaces/spend";
import { 
  getMxeAccount, 
  generateComputationOffset 
} from "@/client/generation/arcium";

/**
 * Builds a valid Solana instruction for spending (transferring out) borrowed assets.
 * 
 * @remarks
 * "Spending" in this context refers to moving assets from the protocol's vault to the user's wallet.
 * This is effectively a withdrawal of borrowed funds.
 * 
 * @param params - The parameters required for the spend instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.borrowMint - The mint address of the token being spent (e.g. USDC).
 * @param params.amount - The amount to spend (in atomic units).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 * 
 * @returns A Promise that resolves to the TransactionInstruction.
 * 
 * @example
 * ```ts
 * const ix = await buildSpendInstruction({
 *   user: wallet.publicKey,
 *   borrowMint: usdcMint,
 *   amount: toU64(5000000), // 5 USDC
 *   userNonce: currentNonce,
 *   userPublicKey: userArciumKey
 * });
 * ```
 */
export async function buildSpendInstruction({
  user,
  borrowMint,
  amount,
  userNonce,
  userPublicKey,
}: SpendInstructionParams) {
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

  // "spend" comp def
  const compDefOffsetBytes = getCompDefAccOffset("spend");
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const clusterAccount = getClusterAccAddress(arciumClusterOffset);
  
  // Destination token account: "destination_token_account" in IDL.
  // It is NOT a PDA of signatures. It's just a writable account.
  // Usually this is the user's ATA for the borrowed token (borrowMint).
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    borrowMint,
    user,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .spend(computationOffset, amount, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      mxe_account: mxeAccount,
      mempool_account: mempoolAccount,
      executing_pool: executingPool,
      computation_account: computationAccount,
      comp_def_account: compDefAccount,
      cluster_account: clusterAccount,
      destination_token_account: destinationTokenAccount,
      // borrow_vault is auto-resolved
    })
    .instruction();

  return instruction;
}
