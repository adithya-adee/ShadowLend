import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { buildSpendInstruction } from "../client/instruction-builders";
import { toU64, toU128 } from "../types";
import { setupEnvironment, connection, payer } from "./utils";

async function main() {
  console.log("🚀 Starting SPEND Test...");

  const env = await setupEnvironment();
  const { borrowMint, keyManager, userArciumPublicKey } = env;

  console.log("--- Executing SPEND ---");
  // Assuming Deposit (Nonce 0) and Borrow (Nonce 1) happened.
  // Next Nonce is 2.
  keyManager.setNonce(new BN(2));
  const nonce = toU128(keyManager.getCurrentNonce().toString());
  console.log(`Using Nonce: ${nonce.toString()}`);

  // Create User Borrow Token Account to receive funds
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    borrowMint,
    payer.publicKey,
  );

  const spendAmountVal = 50 * 10 ** 6; // Withdraw the borrowed 50 units
  const spendAmount = toU64(spendAmountVal);

  const spendIx = await buildSpendInstruction({
    user: payer.publicKey,
    borrowMint,
    amount: spendAmount,
    userNonce: nonce,
    userPublicKey: userArciumPublicKey,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(spendIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Spend Sent: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
