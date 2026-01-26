import { existsSync, readFileSync, writeFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import path from 'path';

const KEY_PATH = path.join(__dirname, '../../.x25519-key.json');

interface KeyPair {
    publicKey: string; // Hex (DER)
    privateKey: string; // Hex (DER)
}

export function getOrCreateX25519Key(): { publicKey: Buffer; privateKey: Buffer } {
    if (existsSync(KEY_PATH)) {
        try {
            const data = JSON.parse(readFileSync(KEY_PATH, 'utf-8')) as KeyPair;
            const pubDer = Buffer.from(data.publicKey, 'hex');
            const privDer = Buffer.from(data.privateKey, 'hex');
            
            // Extract raw keys from DER (assuming previously saved DER)
            // If the file was saved with keys.ts v1 (which saved DER), this works.
            // If v2 (broken), it might be missing? No, v2 didn't write.
            
            // Safety check: if lengths are exactly 32, assume raw.
            // SPKI/PCKS8 DER are larger (e.g. 44, 48 bytes).
            
            const pubKey = pubDer.length === 32 ? pubDer : pubDer.subarray(pubDer.length - 32);
            const privKey = privDer.length === 32 ? privDer : privDer.subarray(privDer.length - 32);
            
            return {
                publicKey: pubKey,
                privateKey: privKey
            };
        } catch (e) {
            console.error("Failed to load key, recreating...", e);
        }
    }

    // Create new key
    const { publicKey, privateKey } = generateKeyPairSync("x25519", {
        publicKeyEncoding: { format: "der", type: "spki" },
        privateKeyEncoding: { format: "der", type: "pkcs8" }
    });

    const keyData = {
        publicKey: (publicKey as Buffer).toString('hex'),
        privateKey: (privateKey as Buffer).toString('hex')
    };

    writeFileSync(KEY_PATH, JSON.stringify(keyData, null, 2));

    const pubBuf = publicKey as Buffer;
    const privBuf = privateKey as Buffer;

    return {
        publicKey: pubBuf.subarray(pubBuf.length - 32),
        privateKey: privBuf.subarray(privBuf.length - 32)
    };
}
