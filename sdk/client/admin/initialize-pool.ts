import { PublicKey } from "@solana/web3.js";
import { program } from "@/idl";
import { U16 } from "@/types";

/**
 * Parameters for initializing a new lending pool.
 */
export interface InitializePoolParams {
  /** The authority (admin) capable of updating pool parameters. */
  authority: PublicKey;
  /** The mint address of the collateral token (e.g. SOL). */
  collateralMint: PublicKey;
  /** The mint address of the borrowable token (e.g. USDC). */
  borrowMint: PublicKey;
  /** Loan-to-Value ratio in basis points (e.g. 8000 = 80%). */
  ltvBps: U16;
  /** Liquidation threshold in basis points (e.g. 8500 = 85%). */
  liquidationThreshold: U16;
}

/**
 * Builds an instruction to initialize a new lending pool.
 *
 * @param params - The initialization parameters.
 * @returns A Promise that resolves to the TransactionInstruction.
 */
export async function buildInitializePoolInstruction({
  authority,
  collateralMint,
  borrowMint,
  ltvBps,
  liquidationThreshold,
}: InitializePoolParams) {
  return await program.methods
    .initialize_pool(ltvBps, liquidationThreshold)
    .accounts({
      authority,
      collateral_mint: collateralMint,
      borrow_mint: borrowMint,
    })
    .instruction();
}
