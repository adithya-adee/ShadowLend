import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ArciumKeyManager,
  ArciumGenericCipher,
  deriveSeedFromWallet,
} from "./ciphers";
import { buildDepositInstruction } from "./instruction-builders/deposit";
import { buildBorrowInstruction } from "./instruction-builders/borrow";
import { buildWithdrawInstruction } from "./instruction-builders/withdraw";
import { buildRepayInstruction } from "./instruction-builders/repay";
import { buildSpendInstruction } from "./instruction-builders/spend";
import { RescueCiphertext } from "../types";

/**
 * Main client for interacting with the ShadowLend protocol.
 * Wraps instruction building, key management, and encryption/decryption.
 */
export class ShadowLendClient {
  public provider: AnchorProvider;
  public keyManager: ArciumKeyManager;
  public cipher: ArciumGenericCipher<BN>;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.keyManager = new ArciumKeyManager();

    // Serializer: Convert BN to 32-byte LE Uint8Array
    // Adjust size if protocol expects different plaintext size (e.g. 8 for u64).
    // Assuming 8 bytes (u64) is standard for token amounts, but padding to 16/32 might be safer if unsure.
    // However, the previous code snippets didn't explicitly pad to 32, but Arcium usually works with field elements.
    // Let's use 8 bytes for u64.
    const serializer = (data: BN) => {
      // Ensure we have at least enough bytes.
      return new Uint8Array(data.toArray("le", 8));
    };

    const deserializer = (bytes: Uint8Array) => {
      return new BN(bytes, "le");
    };

    this.cipher = new ArciumGenericCipher(
      this.keyManager,
      provider,
      serializer,
      deserializer
    );
  }

  /**
   * Initializes the client with a seed for key derivation.
   * Only needs to be called once per session.
   *
   * @param seed Optional 32-byte seed. If not provided, derives from wallet signature.
   */
  async initialize(seed?: Uint8Array): Promise<void> {
    if (seed) {
      await this.keyManager.initializeFromSeed(seed);
    } else {
      // Default: Derive from wallet signature
      // We need a dummy message signing
      const wallet = this.provider.wallet as any;
      if (!wallet.signMessage) {
        throw new Error(
          "Wallet does not support signMessage. Please provide a seed explicitly."
        );
      }
      const derived = await deriveSeedFromWallet(
        wallet.signMessage.bind(wallet)
      );
      await this.keyManager.initializeFromSeed(derived);
    }
  }

  /**
   * Deposit assets into the protocol.
   * Public amount, but updates confidential state.
   */
  async deposit(
    amount: BN,
    collateralMint: PublicKey,
  ): Promise<TransactionInstruction> {
    const user = this.provider.publicKey;
    const userPublicKey = this.keyManager.getPublicKey();
    const userNonce = this.keyManager.getCurrentNonce();

    return buildDepositInstruction({
      user,
      collateralMint,
      amount, // Passed as BN implicity converting to U64?
      // Wait, buildDepositInstruction expects U64 type which is usually BN.
      userPublicKey,
      userNonce,
    });
  }

  /**
   * Borrow assets from the protocol.
   * Confidential amount.
   */
  async borrow(amount: BN): Promise<TransactionInstruction> {
    const user = this.provider.publicKey;
    const userPublicKey = this.keyManager.getPublicKey();
    const userNonce = this.keyManager.getCurrentNonce();

    // Encrypt amount
    const encryptedAmount = await this.cipher.encrypt(amount);

    return buildBorrowInstruction({
      user,
      amount: encryptedAmount,
      userPublicKey,
      userNonce,
    });
  }

  /**
   * Repay borrowed assets.
   * Confidential amount.
   */
  async repay(
    amount: BN,
    borrowMint: PublicKey,
  ): Promise<TransactionInstruction> {
    const user = this.provider.publicKey;
    const userPublicKey = this.keyManager.getPublicKey();
    const userNonce = this.keyManager.getCurrentNonce();

    const encryptedAmount = await this.cipher.encrypt(amount);

    return buildRepayInstruction({
      user,
      borrowMint,
      amount: encryptedAmount,
      userPublicKey,
      userNonce,
    });
  }

  /**
   * Convert borrowed assets to another token (Spend).
   * Confidential amount.
   */
  async spend(
    amount: BN,
    borrowMint: PublicKey,
  ): Promise<TransactionInstruction> {
    const user = this.provider.publicKey;
    const userPublicKey = this.keyManager.getPublicKey();
    const userNonce = this.keyManager.getCurrentNonce();

    const encryptedAmount = await this.cipher.encrypt(amount);

    return buildSpendInstruction({
      user,
      borrowMint, // Spend acts on the borrowed asset (or checked against it)
      amount: encryptedAmount,
      userPublicKey,
      userNonce,
    });
  }

  /**
   * Withdraw collateral.
   * Confidential amount.
   */
  async withdraw(
    amount: BN,
    collateralMint: PublicKey,
  ): Promise<TransactionInstruction> {
    const user = this.provider.publicKey;
    const userPublicKey = this.keyManager.getPublicKey();
    const userNonce = this.keyManager.getCurrentNonce();

    const encryptedAmount = await this.cipher.encrypt(amount);

    return buildWithdrawInstruction({
      user,
      collateralMint,
      amount: encryptedAmount,
      userPublicKey,
      userNonce,
    });
  }
}
