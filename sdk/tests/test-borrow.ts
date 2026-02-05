import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  buildBorrowInstruction,
  getPoolAccount,
  getUserObligationAccount,
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
 * Test script for Borrow Instruction.
 *
 * Verifies:
 * 1. Correct encryption of borrow amount.
 * 2. Submission of confidential borrow request.
 * 3. Successful Arcium MPC execution via nonce increment.
 */
async function main() {
  console.log("🚀 Starting BORROW Test (SDK Package Import)...");

  const env = await setupEnvironment();
  const { borrowMint, keyManager, amountCipher, userArciumPublicKey } = env;

  const pool = getPoolAccount();
  const user = payer;
  const userObligationAddr = getUserObligationAccount(user.publicKey, pool);

  // --- Fetch On-Chain Nonce ---
  console.log("Fetching User Obligation to determine Nonce...");
  let currentNonce = new BN(1);
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
      console.log(
        "No existing Obligation. Cannot borrow without initializing via Deposit first.",
      );
      process.exit(1);
    }
  } catch (e) {
    console.log("Error fetching obligation:", e);
    process.exit(1);
  }

  // Update KeyManager with current state nonce
  keyManager.setNonce(currentNonce);
  const nonce = toU128(currentNonce.toString());

  console.log("--- Executing BORROW ---");
  const borrowAmountVal = 50 * 10 ** 6; // Borrow 50 units
  const borrowAmount = toU64(borrowAmountVal);

  console.log("Encrypting amount...");
  const encryptedAmount = await amountCipher.encrypt(borrowAmount);

  const borrowIx = await buildBorrowInstruction({
    user: payer.publicKey,
    amount: encryptedAmount,
    userNonce: nonce,
    userPublicKey: userArciumPublicKey,
    clusterOffset: ARCIUM_CLUSTER_OFFSET,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(borrowIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Borrow Sent: ${sig}`);

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
      // Ignore fetch errors
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!isUpdated) {
    console.error("\n❌ Timeout waiting for state update.");
    throw new Error("Borrow callback failed or timed out.");
  }

  console.log("🎉 Borrow Test SUCCESS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
