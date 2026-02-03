import { PublicKey } from "@solana/web3.js";

export type SolanaAddress = PublicKey & { _brand: "SolanaAddress" };
export type MintAddress = PublicKey & { _brand: "MintAddress" };
export type ProgramDerivedAddress = PublicKey & {
  _brand: "ProgramDerivedAddress";
};
export type ProgramAddress = PublicKey & { _brand: "ProgramAddress" };
