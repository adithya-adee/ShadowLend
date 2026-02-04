import { PublicKey } from "@solana/web3.js";
import { SEEDS } from "../../constants/arcium";
import { program } from "../../idl";

export function getSignPdaAccount(): PublicKey {
  const [signPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ArciumSignerAccount")],
    program.programId,
  );
  return signPda;
}

/**
 * Derives the Pool V2 Program Derived Address (PDA) using the SDK's configured program ID.
 *
 * @returns The derived public key of the pool account.
 * @throws Error if PDA derivation fails.
 */
export function getPoolAccount(): PublicKey {
  try {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [SEEDS.POOL_V2],
      program.programId,
    );
    return poolPda;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to derive pool account: ${errorMessage}`);
  }
}

/**
 * Derives the User Obligation Program Derived Address (PDA) using the SDK's configured program ID.
 *
 * @param user - The public key of the user.
 * @param pool - The public key of the pool.
 * @returns The derived public key of the user obligation account.
 * @throws Error if PDA derivation fails.
 */
export function getUserObligationAccount(
  user: PublicKey,
  pool: PublicKey,
): PublicKey {
  try {
    const [userObligationPda] = PublicKey.findProgramAddressSync(
      [SEEDS.USER_OBLIGATION, user.toBuffer(), pool.toBuffer()],
      program.programId,
    );
    return userObligationPda;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to derive user obligation account: ${errorMessage}`,
    );
  }
}

/**
 * Derives the Collateral Vault Program Derived Address (PDA) using the SDK's configured program ID.
 *
 * @param pool - The public key of the pool.
 * @returns The derived public key of the collateral vault account.
 * @throws Error if PDA derivation fails.
 */
export function getCollateralVaultAccount(pool: PublicKey): PublicKey {
  try {
    const [collateralVaultPda] = PublicKey.findProgramAddressSync(
      [SEEDS.COLLATERAL_VAULT, pool.toBuffer()],
      program.programId,
    );
    return collateralVaultPda;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to derive collateral vault account: ${errorMessage}`,
    );
  }
}

/**
 * Derives the Borrow Vault Program Derived Address (PDA) using the SDK's configured program ID.
 *
 * @param pool - The public key of the pool.
 * @returns The derived public key of the borrow vault account.
 * @throws Error if PDA derivation fails.
 */
export function getBorrowVaultAccount(pool: PublicKey): PublicKey {
  try {
    const [borrowVaultPda] = PublicKey.findProgramAddressSync(
      [SEEDS.BORROW_VAULT, pool.toBuffer()],
      program.programId,
    );
    return borrowVaultPda;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to derive borrow vault account: ${errorMessage}`);
  }
}
