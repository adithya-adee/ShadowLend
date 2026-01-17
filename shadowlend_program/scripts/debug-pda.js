const { PublicKey } = require("@solana/web3.js");
const { getArciumAccountBaseSeed } = require("@arcium-hq/client");

const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");

const seed1 = Buffer.from("sign_pda");
const [pda1] = PublicKey.findProgramAddressSync([seed1], PROGRAM_ID);
console.log("My Input (sign_pda):", pda1.toBase58());

const seed2 = getArciumAccountBaseSeed("SignerAccount");
const [pda2] = PublicKey.findProgramAddressSync([seed2], PROGRAM_ID);
console.log("Input (SignerAccount):", pda2.toBase58());

// Try direct match with expected FKAN...
// expected is FKAN2puzVLLGTWKZtkW31VpchqPL89xbGnP5SxfBJUKS (Right log) 
// or 9QCEyFaCFX14ixPCQucic6b1mRUhYhTWQ3wPy4ygPrUJ (Left log)

