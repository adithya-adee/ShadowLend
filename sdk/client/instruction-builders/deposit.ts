import { program } from "@/idl";
import {
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getClusterAccAddress,
} from "@arcium-hq/client";

import { ARCIUM_DEVNET_CLUSTER_OFFSET } from "@/constants/arcium";
import { DepositInstructionParams } from "@/client/interfaces/deposit";
import { 
  getMxeAccount, 
  generateComputationOffset 
} from "@/client/generation/arcium";

/**
 * Builds a valid Solana instruction for depositing collateral into the ShadowLend protocol.
 * 
 * @remarks
 * This function handles the derivation of all necessary Arcium confidential computing accounts,
 * including the computation account, MXE account, and memory pool.
 * 
 * @param params - The parameters required for the deposit instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.collateralMint - The mint address of the collateral (e.g. USDC, SOL).
 * @param params.amount - The amount to deposit (in atomic units).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 * 
 * @returns A Promise that resolves to the TransactionInstruction.
 * 
 * @example
 * ```ts
 * const ix = await buildDepositInstruction({
 *   user: wallet.publicKey,
 *   collateralMint: usdcMint,
 *   amount: toU64(1000000), // 1 USDC
 *   userNonce: toU128(0),
 *   userPublicKey: userArciumKey
 * });
 * ```
 */
export async function buildDepositInstruction({
  user,
  collateralMint,
  amount,
  userNonce,
  userPublicKey,
}: DepositInstructionParams) {
  const programId = program.programId;
  // Using Devnet offset by default
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

  // "deposit" comp def
  const compDefOffsetBytes = getCompDefAccOffset("deposit");
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const clusterAccount = getClusterAccAddress(arciumClusterOffset);

  // Convert keys to number arrays for IDL compatibility
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .deposit(computationOffset, amount, userPublicKeyArray, userNonce)
    .accounts({
      payer: user,
      mxe_account: mxeAccount,
      mempool_account: mempoolAccount,
      executing_pool: executingPool,
      computation_account: computationAccount,
      comp_def_account: compDefAccount,
      cluster_account: clusterAccount,
      collateral_mint: collateralMint,
    })
    .instruction();

  return instruction;
}
