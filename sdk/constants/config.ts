import { PublicKey } from "@solana/web3.js";

/**
 * Wrapped SOL Mint Address.
 */
export const WSOL = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

/**
 * USDC Mint Address (Mainnet/Standard).
 */
export const USDC = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/**
 * Default Solana Devnet RPC URL.
 */
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

/**
 * Default Solana Mainnet RPC URL.
 */
export const MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
