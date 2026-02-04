import { PublicKey } from "@solana/web3.js";
import { program } from "@/idl";
import { getMxeAccount } from "@/client/generation/arcium";
import { getCompDefAccAddress, getCompDefAccOffset } from "@arcium-hq/client";

/**
 * Supported computation definition types in the ShadowLend protocol.
 * Each type corresponds to a specific Arcium circuit.
 */
export type CompDefType =
  | "deposit"
  | "borrow"
  | "withdraw"
  | "repay"
  | "spend"
  | "liquidate";

/**
 * Builds an instruction to initialize a Computation Definition (comp def) account.
 *
 * @remarks
 * This must be called by the protocol admin for each computation type before any user can interact with that feature.
 * The "comp def" stores the verification key and other metadata for the Arcium circuit.
 *
 * @param authority - The protocol admin public key.
 * @param type - The type of computation definition to initialize (e.g. 'deposit', 'borrow').
 *
 * @returns A Promise that resolves to the TransactionInstruction.
 *
 * @throws Error if an unknown comp def type is provided.
 */
export async function buildInitCompDefInstruction(
  authority: PublicKey,
  type: CompDefType,
) {
  const programId = program.programId;
  const mxeAccount = getMxeAccount();

  // Get comp def address
  const compDefOffsetBytes = getCompDefAccOffset(type);
  const compDefOffset = Buffer.from(compDefOffsetBytes).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(programId, compDefOffset);

  const accounts = {
    authority,
    mxe_account: mxeAccount,
    comp_def_account: compDefAccount,
  };

  switch (type) {
    case "deposit":
      return await program.methods
        .init_deposit_comp_def()
        .accounts(accounts)
        .instruction();
    case "borrow":
      return await program.methods
        .init_borrow_comp_def()
        .accounts(accounts)
        .instruction();
    case "withdraw":
      return await program.methods
        .init_withdraw_comp_def()
        .accounts(accounts)
        .instruction();
    case "repay":
      return await program.methods
        .init_repay_comp_def()
        .accounts(accounts)
        .instruction();
    case "spend":
      return await program.methods
        .init_spend_comp_def()
        .accounts(accounts)
        .instruction();
    case "liquidate":
      return await program.methods
        .init_liquidate_comp_def()
        .accounts(accounts)
        .instruction();
    default:
      throw new Error(`Unknown comp def type: ${type}`);
  }
}
