import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { ShadowLend } from "@/idl/idl";
import idl from "@/idl/idl.json";
import { Connection, Keypair } from "@solana/web3.js";

export const program: Program<ShadowLend> = new Program(
  idl,
  new AnchorProvider(
    new Connection(process.env.RPC_URL || "http://127.0.0.1:8899"),
    new Wallet(Keypair.generate()),
  ),
);
