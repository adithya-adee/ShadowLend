const { PublicKey } = require("@solana/web3.js");
const { getArciumAccountBaseSeed, getArciumProgramId } = require("@arcium-hq/client");

const SHADOWLEND_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");
const ARCIUM_ID = getArciumProgramId();

const seed = getArciumAccountBaseSeed("SignerAccount");

// 1. Derive off ShadowLend (What Client sends currently)
const [pdaShadow] = PublicKey.findProgramAddressSync([seed], SHADOWLEND_ID);
console.log("ShadowLend PDA (FK...):", pdaShadow.toBase58());

// 2. Derive off Arcium (What Program seemingly expects 'GY...')
const [pdaArcium] = PublicKey.findProgramAddressSync([seed], ARCIUM_ID);
console.log("Arcium PDA (GY...?):", pdaArcium.toBase58());

console.log("Expected Right (from error): GY2ifkrqcdYyMZmq2Arq39p7FHMu9GDVKGMPN1fv6wTb");

