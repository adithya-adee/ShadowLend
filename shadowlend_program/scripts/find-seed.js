
const { PublicKey } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");
const TARGET_PDA = "FKAN2puzVLLGTWKZtkW31VpchqPL89xbGnP5SxfBJUKS"; // SDK sends this
const TARGET_PDA_2 = "GY2ifkrqcdYyMZmq2Arq39p7FHMu9GDVKGMPN1fv6wTb"; // Program expects this

const candidates = [
  "SignerAccount",
  "sign_pda",
  "signer",
  "sign",
  "arcium_signer",
  "arcium_sign",
  "arcium_sign_pda",
  "mxe_sign",
  "mxe_signer",
  "mxe_sign_pda",
  "sign_pda_account",
  "arcium",
  "arcium_pda",
  "cpi",
  "mxe",
  "pda",
  "arcium-anchor",
  "anchor",
  "shadowlend",
];

console.log(`Checking vs Targets: ${TARGET_PDA}, ${TARGET_PDA_2}`);

for (const seedStr of candidates) {
  const seed = Buffer.from(seedStr);
  const [pda] = PublicKey.findProgramAddressSync([seed], PROGRAM_ID);
  
  if (pda.toBase58() === TARGET_PDA) {
    console.log(`MATCH FKAN (SDK Client): "${seedStr}"`);
  }
  if (pda.toBase58() === TARGET_PDA_2) {
    console.log(`MATCH GY2if (Program): "${seedStr}"`);
  }
}


console.log(`Target PDA: ${TARGET_PDA}`);

for (const seedStr of candidates) {
  const seed = Buffer.from(seedStr);
  const [pda] = PublicKey.findProgramAddressSync([seed], PROGRAM_ID);
  
  if (pda.toBase58() === TARGET_PDA) {
    console.log(`MATCH FOUND! Seed: "${seedStr}"`);
    process.exit(0);
  } else {
    console.log(`Checked "${seedStr}" -> ${pda.toBase58()}`);
  }
}
console.log("No match found in candidates.");
