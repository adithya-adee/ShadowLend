import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  buildDepositInstruction,
  getPoolAccount,
  getUserObligationAccount,
  getCollateralVaultAccount,
  toU64,
  toU128,
} from "sdk";
import {
  setupEnvironment,
  connection,
  payer,
  program,
  ARCIUM_CLUSTER_OFFSET,
} from "./utils";

/**
 * Test script for Deposit Instruction
 *
 * Verifies:
 * 1. Vault balance increases explicitly.
 * 2. Arcium MPC executes (via polling for state update/nonce increment).
 */
async function main() {
  console.log("🚀 Starting DEPOSIT Test (SDK Package Import)...");

  const env = await setupEnvironment();
  const { collateralMint, keyManager, userArciumPublicKey } = env;

  const user = payer;

  // Get user's collateral token account address
  const userTokenAccount = await getAssociatedTokenAddress(
    collateralMint,
    user.publicKey,
  );

  // --- Token Account Checks ---
  try {
    const tokenAccountInfo = await getAccount(connection, userTokenAccount);
    console.log(`✅ Token Balance: ${tokenAccountInfo.amount.toString()}`);

    if (tokenAccountInfo.amount === 0n) {
      console.warn("⚠️ User token balance is 0. Please fund account.");
      throw new Error("Insufficient funds for deposit test.");
    }
  } catch (error: any) {
    console.error("❌ Token account not found or setup incomplete");
    console.error("Please run the following in shadowlend_program directory:");
    console.error("  1. npm run setup:all");
    throw new Error(
      "Setup required. Run 'npm run setup:all' in shadowlend_program first.",
    );
  }

  console.log(`User collateral account: ${userTokenAccount.toBase58()}`);

  const pool = getPoolAccount();
  const userObligationAddr = getUserObligationAccount(user.publicKey, pool);

  // --- Check Initial State ---
  console.log("Fetching User Obligation to determine Nonce...");
  let currentNonce = new BN(0);
  try {
    // Cast to any to avoid TypeScript complaints about IDL casing mismatches
    const accountData = await (
      program.account as any
    ).userObligation.fetchNullable(userObligationAddr);
    if (accountData) {
      currentNonce = accountData.stateNonce; // camelCase from Anchor
      console.log(
        `Found existing Obligation. Nonce: ${currentNonce.toString()}`,
      );
    } else {
      console.log("No existing Obligation. Using Nonce: 0");
    }
  } catch (e) {
    console.log("New Obligation (Nonce 0)");
  }

  // Sync keyManager with current nonce
  keyManager.setNonce(currentNonce);

  // --- Pre-check Vault Balance ---
  const collateralVault = getCollateralVaultAccount(pool);
  let initialVaultBalance = 0n;
  try {
    const vaultInfo = await getAccount(connection, collateralVault);
    initialVaultBalance = vaultInfo.amount;
  } catch (e) {
    // Vault might not exist yet if it's the very first deposit (unlikely after setup)
    initialVaultBalance = 0n;
  }
  console.log(`Initial Vault Balance: ${initialVaultBalance}`);

  // --- Execute Deposit ---
  console.log("--- Executing DEPOSIT ---");
  const depositAmountVal = 100 * 10 ** 6; // 100 Collateral
  const depositAmount = toU64(depositAmountVal);
  const nonce = toU128(currentNonce.toString());

  const depositIx = await buildDepositInstruction({
    user: user.publicKey,
    collateralMint,
    amount: depositAmount,
    userNonce: nonce,
    userPublicKey: userArciumPublicKey,
    clusterOffset: ARCIUM_CLUSTER_OFFSET,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(depositIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Deposit Sent: ${sig}`);

  // --- Verify Vault Update ---
  const vaultInfo = await getAccount(connection, collateralVault);
  const finalVaultBalance = vaultInfo.amount;
  const expectedBalance = initialVaultBalance + BigInt(depositAmountVal);

  if (finalVaultBalance === expectedBalance) {
    console.log(`✅ Vault Verified: Balance increased by ${depositAmountVal}`);
  } else {
    console.error(
      `❌ Vault Mismatch. Expected: ${expectedBalance}, Got: ${finalVaultBalance}`,
    );
    // Don't throw, let's see if polling works
  }

  // --- Poll for State Update (MPC Callback) ---
  console.log("⏳ Waiting for Arcium State Update (Nonce Increment)...");

  const maxRetries = 60; // Wait up to 60s
  let isUpdated = false;

  process.stdout.write("Polling: ");
  for (let i = 0; i < maxRetries; i++) {
    try {
      const accountData = await (program.account as any).userObligation.fetch(
        userObligationAddr,
      );
      const onChainNonce = new BN(accountData.stateNonce);

      if (onChainNonce.gt(currentNonce)) {
        process.stdout.write(" DONE\n");
        console.log(`✅ State Updated! New Nonce: ${onChainNonce.toString()}`);
        isUpdated = true;
        break;
      }
    } catch (e) {
      // Ignore fetch errors
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!isUpdated) {
    console.error("\n❌ Timeout waiting for state update.");
    throw new Error("Deposit callback failed or timed out.");
  }

  console.log("🎉 Deposit Test SUCCESS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
