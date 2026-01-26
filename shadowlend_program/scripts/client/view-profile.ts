import { Wallet, Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import { 
  createProvider, 
  getNetworkConfig, 
  loadProgram,
  logHeader, 
  logSection, 
  logEntry, 
  logSuccess, 
  logError, 
  logInfo, 
  logWarning, 
  logDivider,
  icons 
} from "../utils/config";
import { getWalletKeypair, loadDeployment } from "../utils/deployment";
import { getOrCreateX25519Key } from "../utils/keys";
import { x25519, RescueCipher, getMXEPublicKey } from "@arcium-hq/client";
import * as idl from "../../target/idl/shadowlend_program.json";

function toLEBytes(val: BN | number, width: number = 16): Uint8Array {
    const bn = new BN(val);
    const buf = Buffer.alloc(width);
    // write BN to buffer in LE
    const bnBuf = bn.toArrayLike(Buffer, 'le', width);
    return new Uint8Array(bnBuf);
}

async function viewProfile() {
  try {
    const config = getNetworkConfig();
    logHeader("User Profile (Confidential)");

    const walletKeypair = getWalletKeypair();
    const wallet = new Wallet(walletKeypair);
    
    // Get Encryption Key
    const { publicKey: x25519PubBytes, privateKey: x25519PrivBytes } = getOrCreateX25519Key();
    
    const provider = createProvider(wallet, config);
    const deployment = loadDeployment();
    
    if (!deployment || !deployment.programId || !deployment.poolAddress) {
       throw new Error("Deployment missing.");
    }
    
    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    
    logSection("Identity");
    logEntry("Wallet", wallet.publicKey.toBase58(), icons.key);
    logEntry("X25519 Pubkey", x25519PubBytes.toString('hex'), icons.key);

    const program = await loadProgram(provider, programId, idl) as Program;

    const [userObligation] = PublicKey.findProgramAddressSync(
      [Buffer.from("obligation"), wallet.publicKey.toBuffer(), poolPda.toBuffer()],
      programId
    );
    
    // Fetch Account
    logSection("On-Chain State");
    let obligation;
    try {
        obligation = await (program.account as any).userObligation.fetch(userObligation);
    } catch (e) {
        logError("User Obligation not found. User has not interacted with the protocol.");
        return;
    }
    
    logEntry("Obligation Address", userObligation.toBase58(), icons.link);
    logEntry("State Nonce", obligation.stateNonce.toString(), icons.info);

    const encDeposit = Buffer.from(obligation.encryptedDeposit);
    const encBorrow = Buffer.from(obligation.encryptedBorrow);

    logEntry("Encrypted Deposit (Hex)", encDeposit.toString('hex'), icons.key);
    logEntry("Encrypted Borrow (Hex)", encBorrow.toString('hex'), icons.key);

    logDivider();
    logInfo("Attempting Decryption...");
    
    try {
    // 1. Get MXE Public Key
    const mxePub = await getMXEPublicKey(provider, programId);
        
        // 2. Derive Shared Secret
        const sharedSecret = x25519.getSharedSecret(x25519PrivBytes, mxePub);
        
        // 3. Create Cipher
        const cipher = new RescueCipher(sharedSecret);
        
        // 4. Decrypt
        // We try a range of nonces because of potential synchronization drift or increment logic.
        // Arcium increments nonce after operation.
        // If stateNonce is N, likely the last operation resulted in value encrypted with N-1 or N.
        
        const currentNonce = obligation.stateNonce.toNumber();
        
        let decDeposit: string | null = null;
        let decBorrow: string | null = null;
        
        // Try nonce, nonce-1, nonce-2
        for (let i = 0; i <= 2; i++) {
            const testNonceVal = currentNonce - i;
            if (testNonceVal < 0) continue;
            
            const nonceBytes = toLEBytes(testNonceVal);
            
            try {
                // Deposit
                if (!decDeposit && !encDeposit.every(b => b === 0)) {
                    // Pass as Array of Uint8Arrays: [encDeposit]
                    // And cast to any to avoid generic warnings if types mismatch
                    const dec = cipher.decrypt([new Uint8Array(encDeposit)] as any, nonceBytes) as unknown as bigint[];
                    
                    if (dec && dec.length > 0) {
                        const rawVal = dec[0];
                        // console.log(`Debug Decrypt Deposit (Nonce ${testNonceVal}): ${rawVal.toString()}`);
                        const val = new BN(rawVal.toString());
                        // Check reasonable bounds
                        if (val.lt(new BN("18446744073709551615"))) { // u64 max
                            decDeposit = val.toString();
                        }
                    }
                }
                
                // Borrow
                if (!decBorrow && !encBorrow.every(b => b === 0)) {
                     const dec = cipher.decrypt([new Uint8Array(encBorrow)] as any, nonceBytes) as unknown as bigint[];
                     
                     if (dec && dec.length > 0) {
                        const rawVal = dec[0];
                        // console.log(`Debug Decrypt Borrow (Nonce ${testNonceVal}): ${rawVal.toString()}`);
                        const val = new BN(rawVal.toString());
                        if (val.lt(new BN("18446744073709551615"))) { 
                            decBorrow = val.toString();
                        }
                     }
                }
            } catch (e) {
                // console.log(`Decrypt failed for nonce ${testNonceVal}`, e);
            }
        }
        
        if (decDeposit) {
            logEntry("Decrypted Deposit", decDeposit, icons.checkmark);
        } else if (encDeposit.every(b => b === 0)) {
             logEntry("Decrypted Deposit", "0 (Uninitialized)", icons.info);
        } else {
            console.log(chalk.red(`   Failed to decrypt Deposit using nonces [${currentNonce}, ${currentNonce-1}, ${currentNonce-2}].`));
            console.log(chalk.gray("   This likely means the encryption used a random nonce not matching stateNonce."));
        }

        if (decBorrow) {
            logEntry("Decrypted Borrow", decBorrow, icons.checkmark);
        } else if (encBorrow.every(b => b === 0)) {
             logEntry("Decrypted Borrow", "0 (Uninitialized)", icons.info);
        } else {
             console.log(chalk.red(`   Failed to decrypt Borrow.`));
        }

    } catch (e) {
        logError("Decryption setup failed", e);
    }

  } catch (error) {
    console.error(error);
  }
}

viewProfile();
