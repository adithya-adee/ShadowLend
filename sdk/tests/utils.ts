import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { program } from "../idl";
import { U64, toU64 } from "../types";
import {
  ArciumKeyManager,
  ArciumGenericCipher,
  deriveSeedFromWallet,
} from "../client/ciphers";
import { checkMxeKeysSet, waitForMxeKeys } from "../client/generation/arcium";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// Define paths for persistence
const DEPLOYMENT_PATH = path.join(
  __dirname,
  "../../shadowlend_program/deployment.json",
);

export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
export const connection = new Connection(RPC_URL, "confirmed");

import * as os from "os";

// Load or Generate Payer
const PAYER_KEYPATH = path.join(__dirname, "payer.json");
const SYSTEM_KEYPATH = path.join(os.homedir(), ".config", "solana", "id.json");

let payer: Keypair;

if (fs.existsSync(SYSTEM_KEYPATH)) {
  console.log("Using System Wallet from ~/.config/solana/id.json");
  const data = JSON.parse(fs.readFileSync(SYSTEM_KEYPATH, "utf-8"));
  payer = Keypair.fromSecretKey(new Uint8Array(data));
  // Persist to local payer.json for reference logic consistency if needed,
  // or just rely on variable.
} else if (fs.existsSync(PAYER_KEYPATH)) {
  console.log("Using persisted local payer.json");
  const data = JSON.parse(fs.readFileSync(PAYER_KEYPATH, "utf-8"));
  payer = Keypair.fromSecretKey(new Uint8Array(data));
} else {
  console.log("Generating new Payer...");
  payer = Keypair.generate();
  fs.writeFileSync(PAYER_KEYPATH, JSON.stringify(Array.from(payer.secretKey)));
}

export { payer };

/**
 * Mock wallet signer using Node crypto.
 */
export const mockSignMessage = async (msg: Uint8Array): Promise<Uint8Array> => {
  // key is Buffer from secret key
  const key = Buffer.from(payer.secretKey);
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(msg);
  return hmac.digest();
};

export async function setupEnvironment() {
  console.log("🛠️ Setting up Environment...");

  // 1. Airdrop
  try {
    const balance = await connection.getBalance(payer.publicKey);
    if (balance < 1 * 10 ** 9) {
      console.log("Requesting Airdrop...");
      const signature = await connection.requestAirdrop(
        payer.publicKey,
        2 * 10 ** 9,
      );
      await connection.confirmTransaction(signature);
    }
  } catch (e) {
    console.warn("Airdrop failed (mock mode or mainnet?):", e);
  }

  // 2. Load Mints from Deployment
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(
      `Deployment file not found at ${DEPLOYMENT_PATH}. Please run 'npm run setup:all' in shadowlend_program first.`,
    );
  }

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf-8"));
  console.log(
    `Loading mints from deployment: ${deployment.collateralMint}, ${deployment.borrowMint}`,
  );

  // Explicitly cast to strings if JSON types are uncertain, but usually string in JSON
  const collateralMint = new PublicKey(deployment.collateralMint);
  const borrowMint = new PublicKey(deployment.borrowMint);

  // 3. Arcium Check
  console.log("Checking Arcium Cluster Status...");
  try {
    const isReady = await checkMxeKeysSet(program.provider as any);
    if (!isReady) {
      console.log("Waiting for MXE Keys to be set...");
      await waitForMxeKeys(program.provider as any);
    }
    console.log("✅ Arcium MXE Keys Set");
  } catch (e) {
    // console.warn("⚠️ Arcium check failed...", e);
  }

  // 4. Setup SDK Cipher
  const userSeed = await deriveSeedFromWallet(mockSignMessage);
  const keyManager = new ArciumKeyManager();
  await keyManager.initializeFromSeed(userSeed);

  const amountCipher = new ArciumGenericCipher<U64>(
    keyManager,
    program.provider as any,
    (val: U64) => new Uint8Array(val.toArray("le", 8)),
    (bytes: Uint8Array) => new BN(bytes, "le") as U64,
  );

  return {
    connection,
    payer,
    collateralMint,
    borrowMint,
    keyManager,
    amountCipher,
    userArciumPublicKey: keyManager.getPublicKey(),
  };
}
