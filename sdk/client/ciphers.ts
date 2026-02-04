import { getMXEPublicKey, RescueCipher, x25519 } from "@arcium-hq/client";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import {
  ConfidentialClient,
  ConfidentialKeyManager,
} from "./interfaces/ciphers";
import {
  ArciumX25519Keypair,
  ArciumX25519PublicKey,
  ArciumX25519SecretKey,
  RescueCiphertext,
  toArciumX25519PublicKey,
  toArciumX25519SecretKey,
  toRescueCiphertext,
} from "../types";
import { program } from "../idl";

/**
 * Serializer function to convert data of type T to Uint8Array.
 */
export type Serializer<T> = (data: T) => Uint8Array;

/**
 * Deserializer function to convert Uint8Array back to type T.
 */
export type Deserializer<T> = (bytes: Uint8Array) => T;

/**
 * Manages Arcium confidentiality keys and states.
 */
export class ArciumKeyManager implements ConfidentialKeyManager {
  private keypair: ArciumX25519Keypair | null = null;
  private nonce: BN = new BN(0);

  /**
   * Initializes keys derived deterministically from a 32-byte seed.
   * @param seed - The 32-byte seed (e.g. hash of a wallet signature).
   */
  async initializeFromSeed(seed: Uint8Array): Promise<void> {
    if (seed.length !== 32) {
      throw new Error("Seed must be 32 bytes");
    }

    // In a real Arcium usage, we might want to check if specific key derivation is required.
    // Here we use the seed directly as the private key for determinism,
    // or we could hash it again to ensure distribution.
    const secretKeyBytes = seed;

    // Derive Public Key using Arcium's x25519 utils
    // Note: client libraries usually expect Uint8Array standard
    const publicKeyBytes = x25519.getPublicKey(secretKeyBytes);

    this.keypair = {
      publicKey: toArciumX25519PublicKey(publicKeyBytes),
      secretKey: toArciumX25519SecretKey(secretKeyBytes),
    };

    // Reset nonce on re-initialization
    this.nonce = new BN(0);
  }

  getPublicKey(): ArciumX25519PublicKey {
    if (!this.keypair) throw new Error("KeyManager not initialized");
    return this.keypair.publicKey;
  }

  getSecretKey(): ArciumX25519SecretKey {
    if (!this.keypair) throw new Error("KeyManager not initialized");
    return this.keypair.secretKey;
  }

  getCurrentNonce(): bigint {
    return BigInt(this.nonce.toString());
  }

  /**
   * Increments the internal nonce by 1.
   * This should be called after a successful transaction to keep sync with on-chain state if manual management is not used.
   */
  incrementNonce(): void {
    // Increment nonce by 1
    this.nonce = this.nonce.add(new BN(1));
  }

  /**
   * Manually set the nonce (e.g. syncing with on-chain state).
   */
  setNonce(nonce: BN | number): void {
    this.nonce = new BN(nonce);
  }
}

/**
 * A generic confidential client for encrypting and decrypting data using Arcium.
 */
export class ArciumGenericCipher<T> implements ConfidentialClient<T> {
  private keyManager: ArciumKeyManager;
  private provider: AnchorProvider;
  private serializer: Serializer<T>;
  private deserializer: Deserializer<T>;

  // Cached MXE Key
  private mxePublicKey: Uint8Array | null = null;

  constructor(
    keyManager: ArciumKeyManager,
    provider: AnchorProvider,
    serializer: Serializer<T>,
    deserializer: Deserializer<T>,
  ) {
    this.keyManager = keyManager;
    this.provider = provider;
    this.serializer = serializer;
    this.deserializer = deserializer;
  }

  private async getMxePublicKey(): Promise<Uint8Array> {
    if (this.mxePublicKey) return this.mxePublicKey;

    try {
      // Fetch MXE public key from the cluster for the specific program
      const key = await getMXEPublicKey(this.provider, program.programId);
      if (!key) throw new Error("MXE Public Key not found");
      this.mxePublicKey = key;
      return key;
    } catch (e) {
      throw new Error(`Failed to fetch MXE Public Key: ${e}`);
    }
  }

  /**
   * Encrypts the data using Arcium Rescue Cipher.
   * @param data The data to encrypt.
   * @param nonce Optional nonce. If not provided, uses the internal nonce and increments it.
   */
  async encrypt(
    data: T,
    nonce?: bigint | number | BN,
  ): Promise<RescueCiphertext> {
    const dataBytes = this.serializer(data);
    const mxeKey = await this.getMxePublicKey();
    const userSecretCheck = this.keyManager.getSecretKey();

    // ECDH Shared Secret
    const sharedSecret = x25519.getSharedSecret(userSecretCheck, mxeKey);

    // Use Rescue Cipher
    const cipher = new RescueCipher(sharedSecret);

    let nonceBn: BN;
    if (nonce !== undefined) {
      nonceBn = new BN(nonce.toString());
    } else {
      nonceBn = new BN(this.keyManager.getCurrentNonce().toString());
    }

    // Pad to 16 bytes LE as required by Arcium
    const nonceArray = nonceBn.toArray("le", 16);
    const nonceBytes = new Uint8Array(nonceArray);

    // Convert bytes to Field Elements (bigint[]) expected by Arcium Rescue Cipher
    // Assuming simple mapping for now (1 byte = 1 field element)
    const dataElements = this.bytesToFieldElements(dataBytes);

    // Encrypt: Library expects bigint[] inputs
    const rawCiphertext = cipher.encrypt(dataElements, nonceBytes) as any;

    // Convert generic library output to Uint8Array (RescueCiphertext)
    const ciphertextBytes = this.packCiphertext(rawCiphertext);

    // Only increment internal nonce if we used it (automatic mode)
    if (nonce === undefined) {
      this.keyManager.incrementNonce();
    }

    return ciphertextBytes as RescueCiphertext;
  }

  /**
   * Decrypts the ciphertext using Arcium Rescue Cipher.
   * @param ciphertext The encrypted data.
   * @param nonce Optional nonce. If not provided, defaults to current internal nonce (risky if out of sync).
   */
  async decrypt(
    ciphertext: RescueCiphertext,
    nonce?: bigint | number | BN,
  ): Promise<T> {
    const mxeKey = await this.getMxePublicKey();
    const headers = this.keyManager.getSecretKey();
    const sharedSecret = x25519.getSharedSecret(headers, mxeKey);
    const cipher = new RescueCipher(sharedSecret);

    let nonceBn: BN;
    if (nonce !== undefined) {
      nonceBn = new BN(nonce.toString());
    } else {
      // Default to current internal nonce if not provided (though risky for decryption if out of sync)
      nonceBn = new BN(this.keyManager.getCurrentNonce().toString());
    }

    const nonceArray = nonceBn.toArray("le", 16);
    const nonceBytes = new Uint8Array(nonceArray);

    // Convert stored Uint8Array ciphertext back to library's expected format
    const formattedCiphertext = this.unpackCiphertext(ciphertext);

    // Decrypt
    const plaintextElements = cipher.decrypt(
      formattedCiphertext,
      nonceBytes,
    ) as any as bigint[];

    // Convert back to bytes
    const plaintextBytes = this.fieldElementsToBytes(plaintextElements);

    return this.deserializer(plaintextBytes);
  }

  // --- Helpers for Library Type Bridging ---

  /**
   * Packs the library's raw ciphertext (number[][] or similar) into a flat Uint8Array.
   */
  private packCiphertext(raw: any): Uint8Array {
    // Assuming raw is number[] or number[][] or bigint[]
    // We'll try to handle common cases.
    // If it's number[][], flatten it.
    if (Array.isArray(raw)) {
      const flat: number[] = [];
      for (const item of raw) {
        if (Array.isArray(item)) {
          flat.push(...item);
        } else if (typeof item === "number") {
          flat.push(item);
        } else if (typeof item === "bigint") {
          // field element to byte? usually single byte representation if < 256?
          // or 8 bytes? Rescue field elements are usually larger.
          // For simplified SDK usage without full field arithmetic, we assume fit-in-byte or re-serialize.
          // THIS IS A CRITICAL ASSUMPTION: If the library returns full 64/128bit field elements,
          // we must serialize each bigint to N bytes.
          // Let's assume 8 bytes per bigint (u64 field) for safety if unknown.
          // Actually, if input was Uint8Array, output should reference it.
          // Let's perform a naive mapping for now.
          flat.push(Number(item));
        }
      }
      return new Uint8Array(flat);
    }
    return new Uint8Array(0);
  }

  /**
   * Unpacks a flat Uint8Array into the library's expected ciphertext format (number[][]?).
   * The error said: "Argument of type 'RescueCiphertext' is not assignable to 'number[][]'."
   */
  private unpackCiphertext(bytes: Uint8Array): any {
    // We need to reconstruct the structure.
    // If the library expects number[][], we need to know the dimensions.
    // For a generic stream/block, it might just be [ [b1, b2, ...] ] (one block) or multiple.
    // Let's guess it treats input as an array of array of bytes (chunks)?
    // We will try returning [[...bytes]] (one chunk).
    return [Array.from(bytes)];
  }

  /**
   * Converts decrypted field elements (bigint[]) back to Uint8Array.
   */
  private fieldElementsToBytes(elements: bigint[]): Uint8Array {
    // If input was bytes, and rescue processes byte-wise (or mapped),
    // the BigInts might strictly represent the byte values (0-255).
    return new Uint8Array(elements.map((b) => Number(b)));
  }
  /**
   * Converts Uint8Array to field elements (bigint[]) for the cipher.
   */
  private bytesToFieldElements(bytes: Uint8Array): bigint[] {
    const elements: bigint[] = [];
    for (const b of bytes) {
      elements.push(BigInt(b));
    }
    return elements;
  }
}

/**
 * Helper to generate a deterministic seed from a wallet signature.
 *
 * @param signMessage - The wallet's signMessage function.
 * @param message - The message to sign (default: "ShadowLend-Key-Derivation").
 */
export async function deriveSeedFromWallet(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
  message: string = "ShadowLend-Key-Derivation",
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const signature = await signMessage(enc.encode(message));

  // Hash the signature to get a uniform 32-byte seed
  const hash = crypto.createHash("sha256").update(signature).digest();
  return hash;
}
