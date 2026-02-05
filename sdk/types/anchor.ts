import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export type SolanaAddress = PublicKey & { _brand: "SolanaAddress" };
export type MintAddress = PublicKey & { _brand: "MintAddress" };
export type ProgramDerivedAddress = PublicKey & {
  _brand: "ProgramDerivedAddress";
};
export type ProgramAddress = PublicKey & { _brand: "ProgramAddress" };

export type UserConfidentialStateEvent = {
  userObligation: PublicKey;
  encryptedState: number[];
  nonce: BN;
};
