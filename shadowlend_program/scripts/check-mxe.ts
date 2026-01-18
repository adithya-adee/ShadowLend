import { Connection, PublicKey } from "@solana/web3.js";
import { getMXEAccAddress, getClusterAccAddress, getMXEPublicKey, getArciumProgramId } from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";

/**
 * MXE Account Diagnostic Script
 * 
 * Per Arcium v0.5.1 docs:
 * - getMXEAccAddress(program.programId) - Uses YOUR program ID (each program has its own MXE)
 * - getMempoolAccAddress(clusterOffset) - Uses cluster offset
 * - getExecutingPoolAccAddress(clusterOffset) - Uses cluster offset
 * - getCompDefAccAddress(program.programId, offset) - Uses YOUR program ID
 * 
 * The MxeKeysNotSet error means the Arcium cluster nodes haven't completed
 * their distributed key generation (DKG) ceremony for this MXE account.
 */

async function checkMxe() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const programId = new PublicKey("J6hwZmTBYjDQdVdbeX7vuhpwpqgrhHUqQaUk8qYsZvXK");
    const clusterOffset = 123;
    
    console.log("=== Arcium MXE Diagnostic ===\n");
    console.log("Our Program ID:", programId.toBase58());
    console.log("Arcium Program ID:", getArciumProgramId().toBase58());
    console.log("Cluster Offset:", clusterOffset);
    
    const mxeAccount = getMXEAccAddress(programId);
    const clusterAccount = getClusterAccAddress(clusterOffset);
    
    console.log("\n--- Account Addresses ---");
    console.log("MXE Account (derived from OUR program ID):", mxeAccount.toBase58());
    console.log("Cluster Account (derived from offset):", clusterAccount.toBase58());
    
    // Check MXE account
    console.log("\n--- MXE Account Status ---");
    const mxeInfo = await connection.getAccountInfo(mxeAccount);
    if (!mxeInfo) {
        console.log("❌ MXE Account NOT initialized!");
        console.log("   Run: arcium deploy --cluster-offset 123 ...");
        return;
    }
    console.log("✅ MXE Account exists");
    console.log("   Owner:", mxeInfo.owner.toBase58());
    console.log("   Size:", mxeInfo.data.length, "bytes");
    
    // Try to get MXE public key
    console.log("\n--- MXE Public Key Status ---");
    const provider = new anchor.AnchorProvider(
        connection,
        {} as any,
        { commitment: "confirmed" }
    );
    
    try {
        const mxePubkey = await getMXEPublicKey(provider, programId);
        if (mxePubkey && mxePubkey.length > 0) {
            // Check if it's all zeros
            const isZero = mxePubkey.every((b: number) => b === 0);
            if (isZero) {
                console.log("❌ MXE Public Key is all zeros");
                console.log("   The cluster nodes haven't completed DKG!");
                console.log("\n   Possible causes:");
                console.log("   1. Cluster nodes are still initializing");
                console.log("   2. Cluster offset 123 may not be active on devnet");
                console.log("   3. MXE needs to be re-deployed or cluster needs restart");
            } else {
                console.log("✅ MXE Public Key is set!");
                console.log("   Key:", Buffer.from(mxePubkey).toString("hex").slice(0, 32) + "...");
            }
        } else {
            console.log("❌ MXE Public Key NOT set (empty/null)");
            console.log("   Cluster nodes need to complete key exchange");
        }
    } catch (e: any) {
        console.log("❌ Error getting MXE public key:", e.message);
    }
    
    // Check cluster
    console.log("\n--- Cluster Account Status ---");
    const clusterInfo = await connection.getAccountInfo(clusterAccount);
    if (!clusterInfo) {
        console.log("❌ Cluster Account NOT found!");
        console.log("   This cluster offset may not exist on devnet");
    } else {
        console.log("✅ Cluster Account exists");
        console.log("   Owner:", clusterInfo.owner.toBase58());
        console.log("   Size:", clusterInfo.data.length, "bytes");
    }
    
    console.log("\n--- Documentation ---");
    console.log("See: https://docs.arcium.com/developers/migration/migration-v0.4-to-v0.5");
    console.log("MxeKeysNotSet = Cluster DKG not complete, not a code issue");
}

checkMxe().catch(console.error);
