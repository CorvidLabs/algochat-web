import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { x25519 } from '@noble/curves/ed25519.js';
import type { X25519KeyPair } from '../types';

const KEY_DERIVATION_SALT = new TextEncoder().encode('AlgoChat-v1-encryption');
const KEY_DERIVATION_INFO = new TextEncoder().encode('x25519-key');

export function deriveEncryptionKeys(seed: Uint8Array): X25519KeyPair {
    if (seed.length !== 32) {
        throw new Error(`Seed must be 32 bytes, got ${seed.length}`);
    }
    const encryptionSeed = hkdf(sha256, seed, KEY_DERIVATION_SALT, KEY_DERIVATION_INFO, 32);
    const privateKey = encryptionSeed;
    const publicKey = x25519.getPublicKey(privateKey);
    return { privateKey, publicKey };
}

export function generateEphemeralKeyPair(): X25519KeyPair {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    return { privateKey, publicKey };
}

export function x25519ECDH(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    return x25519.getSharedSecret(privateKey, publicKey);
}

export function uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
