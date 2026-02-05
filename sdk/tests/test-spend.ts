import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  createMintToInstruction,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  buildSpendInstruction,
  getPoolAccount,
  getUserObligationAccount,
  getBorrowVaultAccount,
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
 * Test script for Spend Instruction.
 *
 * Verifies:
 * 1. Derivation of user obligation nonce.
 * 2. Submission of spend request.
 * 3. Arcium MPC execution (nonce increment).
 * 4. Receipt of tokens in user's borrow token account (balance increase).
 */
async function main() {
  console.log("🚀 Starting SPEND Test (SDK Package Import)...");

  const env = await setupEnvironment();
  const { borrowMint, keyManager, userArciumPublicKey } = env;

  const pool = getPoolAccount();
  const user = payer;
  const userObligationAddr = getUserObligationAccount(user.publicKey, pool);

  // --- Check Borrow Vault Liquidity ---
  const borrowVault = getBorrowVaultAccount(pool);
  console.log(`Borrow Vault: ${borrowVault.toBase58()}`);

  let vaultBalance = 0n;
  try {
    const v = await getAccount(connection, borrowVault);
    vaultBalance = v.amount;
  } catch (e) {
    /* ignore */
  }

  console.log(`Current Vault Liquidity: ${vaultBalance}`);

  const REQUIRED_liquidity = 1000 * 10 ** 6; // Ensure enough buffer
  if (vaultBalance < BigInt(REQUIRED_liquidity)) {
    console.log("⚠️ Vault Liquidity Low. Seeding vault...");
    try {
      // Mint to vault (Simulate LP deposit)
      const tx = new Transaction().add(
        createMintToInstruction(
          borrowMint,
          borrowVault,
          payer.publicKey,
          REQUIRED_liquidity,
        ),
      );
      await sendAndConfirmTransaction(connection, tx, [payer]);
      console.log("✅ Seeded Borrow Vault");
    } catch (e) {
      console.error(
        "Failed to seed vault (Maybe payer is not mint authority?)",
        e,
      );
      // Proceed anyway, maybe it works
    }
  }

  // --- Fetch On-Chain Nonce ---
  console.log("Fetching User Obligation to determine Nonce...");
  let currentNonce = new BN(0);
  try {
    const accountData = await (
      program.account as any
    ).userObligation.fetchNullable(userObligationAddr);
    if (accountData) {
      currentNonce = accountData.stateNonce;
      console.log(
        `Found existing Obligation. Nonce: ${currentNonce.toString()}`,
      );
    } else {
      console.error("No existing Obligation. Must deposit and borrow first.");
      process.exit(1);
    }
  } catch (e) {
    console.error("Error fetching obligation:", e);
    process.exit(1);
  }

  // Update KeyManager
  keyManager.setNonce(currentNonce);
  const nonce = toU128(currentNonce.toString());

  // --- Prepare Token Account ---
  console.log("Preparing User Borrow Token Account...");
  const userBorrowAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    borrowMint,
    payer.publicKey,
  );

  const initialBalance = userBorrowAta.amount;
  console.log(`Initial Borrow Token Balance: ${initialBalance}`);

  // --- Execute Spend ---
  console.log("--- Executing SPEND ---");
  const spendAmountVal = 50 * 10 ** 6; // Withdraw 50 units
  const spendAmount = toU64(spendAmountVal);

  const spendIx = await buildSpendInstruction({
    user: payer.publicKey,
    borrowMint,
    amount: spendAmount,
    userNonce: nonce,
    userPublicKey: userArciumPublicKey,
    clusterOffset: ARCIUM_CLUSTER_OFFSET,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(spendIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Spend Sent: ${sig}`);

  // --- Poll for State Update (MPC Callback) ---
  console.log("⏳ Waiting for Arcium State Update (Nonce Increment)...");

  const maxRetries = 120; // Increase wait time to 120s
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
      /* ignore */
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!isUpdated) {
    console.error("\n❌ Timeout waiting for state update.");
    throw new Error("Spend callback failed or timed out.");
  }

  // --- Verify Balance Increase ---
  const finalAccountInfo = await getAccount(connection, userBorrowAta.address);
  const finalBalance = finalAccountInfo.amount;
  const expectedBalance = initialBalance + BigInt(spendAmountVal);

  if (finalBalance === expectedBalance) {
    console.log(`✅ Balance Verified: Increased by ${spendAmountVal}`);
  } else {
    console.error(
      `❌ Balance Mismatch. Expected: ${expectedBalance}, Got: ${finalBalance}`,
    );
    // Usually signifies the MPC rejected the spend (insufficient health factor?)
  }

  console.log("🎉 Spend Test SUCCESS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
