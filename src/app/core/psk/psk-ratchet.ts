/**
 * PSK Protocol v1.1 - Two-Level Ratchet Key Derivation
 *
 * Derives per-message PSKs from an initial pre-shared key using
 * a two-level HKDF ratchet: session (counter / SESSION_SIZE) and
 * position (counter % SESSION_SIZE).
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { PSK_PROTOCOL, PSK_HKDF } from './psk-types';

const SESSION_SALT = new TextEncoder().encode(PSK_HKDF.SESSION_SALT);
const POSITION_SALT = new TextEncoder().encode(PSK_HKDF.POSITION_SALT);
const HYBRID_INFO_PREFIX = new TextEncoder().encode(PSK_HKDF.HYBRID_INFO_PREFIX);
const SENDER_KEY_INFO_PREFIX = new TextEncoder().encode(PSK_HKDF.SENDER_KEY_INFO_PREFIX);

/**
 * Encodes a number as a 4-byte big-endian Uint8Array.
 */
function uint32BE(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, false);
    return buf;
}

/**
 * Concatenates multiple Uint8Arrays into one.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/**
 * Derives a session-level PSK from the initial PSK.
 *
 * HKDF(SHA256, IKM=initialPSK, salt="AlgoChat-PSK-Session", info=sessionIndex as 4-byte BE)
 */
export function deriveSessionPSK(initialPSK: Uint8Array, sessionIndex: number): Uint8Array {
    return hkdf(sha256, initialPSK, SESSION_SALT, uint32BE(sessionIndex), 32);
}

/**
 * Derives a position-level PSK from a session PSK.
 *
 * HKDF(SHA256, IKM=sessionPSK, salt="AlgoChat-PSK-Position", info=position as 4-byte BE)
 */
export function derivePositionPSK(sessionPSK: Uint8Array, position: number): Uint8Array {
    return hkdf(sha256, sessionPSK, POSITION_SALT, uint32BE(position), 32);
}

/**
 * Derives the PSK for a specific counter value using the two-level ratchet.
 *
 * session = counter / SESSION_SIZE (integer division)
 * position = counter % SESSION_SIZE
 */
export function derivePSKAtCounter(initialPSK: Uint8Array, counter: number): Uint8Array {
    const sessionIndex = Math.floor(counter / PSK_PROTOCOL.SESSION_SIZE);
    const position = counter % PSK_PROTOCOL.SESSION_SIZE;
    const sessionPSK = deriveSessionPSK(initialPSK, sessionIndex);
    return derivePositionPSK(sessionPSK, position);
}

/**
 * Derives the hybrid symmetric key from ECDH shared secret and PSK.
 *
 * IKM = sharedSecret || currentPSK
 * salt = ephPub
 * info = "AlgoChatV1-PSK" + senderPub + recipientPub
 */
export function deriveHybridSymmetricKey(
    sharedSecret: Uint8Array,
    currentPSK: Uint8Array,
    ephPub: Uint8Array,
    senderPub: Uint8Array,
    recipientPub: Uint8Array
): Uint8Array {
    const ikm = concatBytes(sharedSecret, currentPSK);
    const info = concatBytes(HYBRID_INFO_PREFIX, senderPub, recipientPub);
    return hkdf(sha256, ikm, ephPub, info, 32);
}

/**
 * Derives the sender key encryption key from ECDH shared secret and PSK.
 *
 * IKM = senderSharedSecret || currentPSK
 * salt = ephPub
 * info = "AlgoChatV1-PSK-SenderKey" + senderPub
 */
export function deriveSenderKey(
    senderSharedSecret: Uint8Array,
    currentPSK: Uint8Array,
    ephPub: Uint8Array,
    senderPub: Uint8Array
): Uint8Array {
    const ikm = concatBytes(senderSharedSecret, currentPSK);
    const info = concatBytes(SENDER_KEY_INFO_PREFIX, senderPub);
    return hkdf(sha256, ikm, ephPub, info, 32);
}
