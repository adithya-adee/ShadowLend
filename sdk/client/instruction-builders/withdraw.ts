import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
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

import { ARCIUM_LOCALNET_CLUSTER_OFFSET } from "../../constants/arcium";
import { WithdrawInstructionParams } from "../interfaces";
import {
  getMxeAccount,
  generateComputationOffset,
  getPoolAccount,
  getUserObligationAccount,
  getCollateralVaultAccount,
  getSignPdaAccount,
} from "../generation";

/**
 * Builds a valid Solana instruction for withdrawing assets from the ShadowLend protocol.
 *
 * @remarks
 * This function handles the construction of the confidential withdraw interaction.
 * The `amount` parameter must be encrypted client-side.
 *
 * @param params - The parameters required for the withdraw instruction.
 * @param params.user - The user's wallet public key (payer).
 * @param params.collateralMint - The mint address of the collateral token (e.g. SOL).
 * @param params.amount - The encrypted amount to withdraw (ciphertext).
 * @param params.userNonce - The user's current replay protection nonce.
 * @param params.userPublicKey - The user's Arcium X25519 public key.
 *
 * @returns A Promise that resolves to the TransactionInstruction.
 */
export async function buildWithdrawInstruction({
  user,
  collateralMint,
  amount,
  userNonce,
  userPublicKey,
}: WithdrawInstructionParams) {
  const programId = program.programId;
  const arciumClusterOffset = ARCIUM_LOCALNET_CLUSTER_OFFSET;

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
  const poolAccount = getFeePoolAccAddress();
  const clockAccount = getClockAccAddress();
  const arciumProgramId = getArciumProgramId();

  // --- Solana / ShadowLend Accounts ---
  const signPdaAccount = getSignPdaAccount();
  const pool = getPoolAccount();
  const userObligation = getUserObligationAccount(user, pool);
  const collateralVault = getCollateralVaultAccount(pool);

  // User Token Account (Destination)
  const userTokenAccount = getAssociatedTokenAddressSync(
    collateralMint,
    user,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Convert keys
  const userPublicKeyArray = Array.from(userPublicKey);

  const instruction = await program.methods
    .withdraw(computationOffset, amount, userPublicKeyArray, userNonce)
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
