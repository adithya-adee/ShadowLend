import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { buildDepositInstruction } from "../client/instruction-builders";
import { U64, toU64, toU128 } from "../types";
import { setupEnvironment, connection, payer } from "./utils";

async function main() {
  console.log("🚀 Starting DEPOSIT Test...");

  const env = await setupEnvironment();
  const { collateralMint, keyManager, userArciumPublicKey } = env;

  // Mint collateral to user (Payer)
  const user = payer;
  const userCollateralAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    collateralMint,
    user.publicKey,
  );

  const depositAmountVal = 100 * 10 ** 6; // 100 Collateral
  try {
    await mintTo(
      connection,
      payer,
      collateralMint,
      userCollateralAccount.address,
      payer,
      depositAmountVal,
    );
    console.log(`Minted ${depositAmountVal} Collateral to user.`);
  } catch (e) {
    console.warn(
      "⚠️ Failed to mint collateral (Auth mismatch?). Assuming user has balance or using pre-funded account.",
    );
  }

  // Deposit
  console.log("--- Executing DEPOSIT ---");
  const depositAmount = toU64(depositAmountVal);
  // Current Nonce (Likely 0 if fresh, or N if used)
  const currentNonce = toU128(keyManager.getCurrentNonce().toString());

  const depositIx = await buildDepositInstruction({
    user: user.publicKey,
    collateralMint,
    amount: depositAmount,
    userNonce: currentNonce,
    userPublicKey: userArciumPublicKey,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(depositIx),
    [payer],
    { skipPreflight: true },
  );
  console.log(`✅ Deposit Sent: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
