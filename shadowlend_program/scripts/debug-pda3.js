const { PublicKey } = require("@solana/web3.js");
const { getArciumAccountBaseSeed, getArciumProgramId } = require("@arcium-hq/client");

const SHADOWLEND_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");
const ARCIUM_ID = getArciumProgramId();
const seed = getArciumAccountBaseSeed("SignerAccount");

console.log("SHADOWLEND_ID:", SHADOWLEND_ID.toBase58());
console.log("ARCIUM_ID:", ARCIUM_ID.toBase58());
console.log("SEED:", Buffer.from(seed).toString('utf8'));

// Error says:
// Left (Sent): GY2... (Arcium derived)
// Right (Expected by seeds): FKAN... (ShadowLend derived)

// Check derivation:
const [pdaShadow] = PublicKey.findProgramAddressSync([seed], SHADOWLEND_ID);
const [pdaArcium] = PublicKey.findProgramAddressSync([seed], ARCIUM_ID);

console.log("Derived(Shadow):", pdaShadow.toBase58());
console.log("Derived(Arcium):", pdaArcium.toBase58());

