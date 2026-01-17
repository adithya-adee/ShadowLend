
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");

const seed1 = Buffer.from("sign_pda");
const [pda1] = PublicKey.findProgramAddressSync([seed1], PROGRAM_ID);

const seed2 = Buffer.from("arcium_sign_pda"); // Maybe arcium lib uses this?
const [pda2] = PublicKey.findProgramAddressSync([seed2], PROGRAM_ID);

console.log("Program ID:", PROGRAM_ID.toBase58());
console.log("PDA 'sign_pda':", pda1.toBase58());
console.log("PDA 'arcium_sign_pda':", pda2.toBase58());

console.log("Left (Client passed): 9QCEyFaCFX14ixPCQucic6b1mRUhYhTWQ3wPy4ygPrUJ");
console.log("Right (Program seeds): FKAN2puzVLLGTWKZtkW31VpchqPL89xbGnP5SxfBJUKS");
