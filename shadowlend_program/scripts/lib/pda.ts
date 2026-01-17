/**
 * ShadowLend PDA Utilities
 * 
 * Functions for deriving Program Derived Addresses (PDAs).
 * Compatible with Arcium SDK v0.5.4 and Anchor v0.32.x
 */

import { PublicKey } from "@solana/web3.js";
import { getArciumProgramId } from "@arcium-hq/client";
import { PROGRAM_ID, PDA_SEEDS } from "./config";

/**
 * Derives the Pool PDA for a given collateral/borrow mint pair.
 * Seeds: ["pool", collateral_mint, borrow_mint]
 */
export function derivePoolPda(
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.pool, collateralMint.toBuffer(), borrowMint.toBuffer()],
    programId
  );
}

/**
 * Derives the Collateral Vault PDA for a pool.
 * Seeds: ["vault", collateral_mint, borrow_mint, "collateral"]
 */
export function deriveCollateralVaultPda(
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      PDA_SEEDS.vault,
      collateralMint.toBuffer(),
      borrowMint.toBuffer(),
      PDA_SEEDS.collateral,
    ],
    programId
  );
}

/**
 * Derives the Borrow Vault PDA for a pool.
 * Seeds: ["vault", collateral_mint, borrow_mint, "borrow"]
 */
export function deriveBorrowVaultPda(
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      PDA_SEEDS.vault,
      collateralMint.toBuffer(),
      borrowMint.toBuffer(),
      PDA_SEEDS.borrow,
    ],
    programId
  );
}

/**
 * Derives the User Obligation PDA.
 * Seeds: ["obligation", user, pool]
 */
export function deriveObligationPda(
  user: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.obligation, user.toBuffer(), pool.toBuffer()],
    programId
  );
}

/**
 * Derives the Arcium Signer PDA.
 * Seeds: ["SignerAccount"]
 * 
 * NOTE: This uses our program ID because the Anchor `seeds` constraint validates
 * using the current program's address.
 */
export function deriveSignerPda(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("SignerAccount")],
    programId
  );
}

/**
 * Derives all pool-related PDAs at once.
 * Useful for initialization scripts.
 */
export function deriveAllPoolPdas(
  collateralMint: PublicKey,
  borrowMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): {
  pool: PublicKey;
  poolBump: number;
  collateralVault: PublicKey;
  collateralVaultBump: number;
  borrowVault: PublicKey;
  borrowVaultBump: number;
} {
  const [pool, poolBump] = derivePoolPda(collateralMint, borrowMint, programId);
  const [collateralVault, collateralVaultBump] = deriveCollateralVaultPda(
    collateralMint,
    borrowMint,
    programId
  );
  const [borrowVault, borrowVaultBump] = deriveBorrowVaultPda(
    collateralMint,
    borrowMint,
    programId
  );

  return {
    pool,
    poolBump,
    collateralVault,
    collateralVaultBump,
    borrowVault,
    borrowVaultBump,
  };
}
