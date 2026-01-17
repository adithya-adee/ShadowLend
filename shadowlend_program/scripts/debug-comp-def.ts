
import { PublicKey } from "@solana/web3.js";
import { getArciumProgramId, getCompDefAccOffset } from "@arcium-hq/client";

const arciumPid = getArciumProgramId();
console.log("JS Arcium PID:", arciumPid.toBase58());

// Compute confidential deposit offset
const offset = getCompDefAccOffset("compute_confidential_deposit");
console.log("Offset:", offset);

// Derive PDA
const baseSeed = Buffer.from("comp_def"); // Guessing seed based on client source usually
// Actually client exports getArciumAccountBaseSeed
const { getArciumAccountBaseSeed } = require("@arcium-hq/client");
const seed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
console.log("Seed Buffer:", seed);

const [pda] = PublicKey.findProgramAddressSync(
    [seed, arciumPid.toBuffer(), Buffer.from(offset)],
    arciumPid
);
console.log("Derived PDA (JS):", pda.toBase58());

console.log("Target (Java/Rust Algorithm?): 7pDZK4NcfVQrYfhYiCPJByTM2uxJEfSM6C8d1Z6tMEkV");
