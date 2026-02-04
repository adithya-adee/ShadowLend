import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { buildBorrowInstruction } from "../client/instruction-builders";
import { toU64, toU128 } from "../types";
import { setupEnvironment, connection, payer } from "./utils";

async function main() {
  console.log("🚀 Starting BORROW Test...");

  const env = await setupEnvironment();
  const { borrowMint, keyManager, amountCipher, userArciumPublicKey } = env;

  console.log("--- Executing BORROW ---");
  const borrowAmountVal = 50 * 10 ** 6; // Borrow 50 units
  const borrowAmount = toU64(borrowAmountVal);

  // We assume test-deposit ran, so nonce logic is:
  // Nonce 0 used for Deposit.
  // Next Nonce is 1.
  keyManager.setNonce(new BN(1));
  const nonce = toU128(keyManager.getCurrentNonce().toString());
  console.log(`Using Nonce: ${nonce.toString()}`);

  console.log("Encrypting amount...");
  const encryptedAmount = await amountCipher.encrypt(borrowAmount);

  const borrowIx = await buildBorrowInstruction({
    user: payer.publicKey,
    amount: encryptedAmount,
    userNonce: nonce,
    userPublicKey: userArciumPublicKey,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(borrowIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Borrow Sent: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
