/**
 * PSK Protocol v1.1 - Tests
 *
 * Tests for ratchet derivation, envelope encoding, encryption round-trip,
 * counter state management, and exchange URI parsing.
 */

import { describe, it, expect } from 'vitest';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { deriveEncryptionKeys } from 'ts-algochat';

import { PSK_PROTOCOL, PSK_HKDF } from './psk-types';
import {
    deriveSessionPSK,
    derivePositionPSK,
    derivePSKAtCounter,
} from './psk-ratchet';
import {
    encodePSKEnvelope,
    decodePSKEnvelope,
    isPSKMessage,
} from './psk-envelope';
import {
    pskEncryptMessage,
    pskDecryptMessage,
} from './psk-encryption';
import {
    createPSKState,
    advanceSendCounter,
    validateReceiveCounter,
    recordReceivedCounter,
    serializePSKState,
    deserializePSKState,
} from './psk-state';
import {
    createPSKExchangeURI,
    parsePSKExchangeURI,
    generatePSK,
} from './psk-exchange';

// --- Helpers ---

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Test key derivation (matches test-vectors.ts)
const ALICE_SEED_HEX = '0000000000000000000000000000000000000000000000000000000000000001';
const BOB_SEED_HEX = '0000000000000000000000000000000000000000000000000000000000000002';

function getAliceKeys() {
    return deriveEncryptionKeys(hexToBytes(ALICE_SEED_HEX));
}

function getBobKeys() {
    return deriveEncryptionKeys(hexToBytes(BOB_SEED_HEX));
}

// Test vectors (initial PSK = 32 bytes of 0xAA)
const INITIAL_PSK_HEX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RATCHET_VECTORS = {
    session0: 'a031707ea9e9e50bd8ea4eb9a2bd368465ea1aff14caab293d38954b4717e888',
    session1: '994cffbb4f84fa5410d44574bb9fa7408a8c2f1ed2b3a00f5168fc74c71f7cea',
    counter0: '2918fd486b9bd024d712f6234b813c0f4167237d60c2c1fca37326b20497c165',
    counter99: '5b48a50a25261f6b63fe9c867b46be46de4d747c3477db6290045ba519a4d38b',
    counter100: '7a15d3add6a28858e6a1f1ea0d22bdb29b7e129a1330c4908d9b46a460992694',
};

// --- Tests ---

describe('PSK Ratchet Vectors', () => {
    const initialPSK = hexToBytes(INITIAL_PSK_HEX);

    it('derives correct session 0 PSK', () => {
        const session0 = deriveSessionPSK(initialPSK, 0);
        expect(bytesToHex(session0)).toBe(RATCHET_VECTORS.session0);
    });

    it('derives correct session 1 PSK', () => {
        const session1 = deriveSessionPSK(initialPSK, 1);
        expect(bytesToHex(session1)).toBe(RATCHET_VECTORS.session1);
    });

    it('derives correct counter 0 PSK (session 0, position 0)', () => {
        const counter0 = derivePSKAtCounter(initialPSK, 0);
        expect(bytesToHex(counter0)).toBe(RATCHET_VECTORS.counter0);
    });

    it('derives correct counter 99 PSK (session 0, position 99)', () => {
        const counter99 = derivePSKAtCounter(initialPSK, 99);
        expect(bytesToHex(counter99)).toBe(RATCHET_VECTORS.counter99);
    });

    it('derives correct counter 100 PSK (session 1, position 0)', () => {
        const counter100 = derivePSKAtCounter(initialPSK, 100);
        expect(bytesToHex(counter100)).toBe(RATCHET_VECTORS.counter100);
    });

    it('matches manual two-step derivation', () => {
        // counter 0 = session 0, position 0
        const session0 = deriveSessionPSK(initialPSK, 0);
        const pos0 = derivePositionPSK(session0, 0);
        const counter0 = derivePSKAtCounter(initialPSK, 0);
        expect(bytesToHex(pos0)).toBe(bytesToHex(counter0));

        // counter 100 = session 1, position 0
        const session1 = deriveSessionPSK(initialPSK, 1);
        const pos0s1 = derivePositionPSK(session1, 0);
        const counter100 = derivePSKAtCounter(initialPSK, 100);
        expect(bytesToHex(pos0s1)).toBe(bytesToHex(counter100));
    });

    it('matches raw HKDF computation', () => {
        const sessionSalt = new TextEncoder().encode(PSK_HKDF.SESSION_SALT);
        const positionSalt = new TextEncoder().encode(PSK_HKDF.POSITION_SALT);

        // Session 0 via raw HKDF
        const info0 = new Uint8Array(4);
        const rawSession0 = hkdf(sha256, initialPSK, sessionSalt, info0, 32);
        expect(bytesToHex(rawSession0)).toBe(RATCHET_VECTORS.session0);

        // Counter 99 via raw HKDF
        const info99 = new Uint8Array(4);
        new DataView(info99.buffer).setUint32(0, 99, false);
        const rawCounter99 = hkdf(sha256, rawSession0, positionSalt, info99, 32);
        expect(bytesToHex(rawCounter99)).toBe(RATCHET_VECTORS.counter99);
    });
});

describe('PSK Envelope', () => {
    it('encodes and decodes roundtrip', () => {
        const aliceKeys = getAliceKeys();
        const bobKeys = getBobKeys();
        const initialPSK = hexToBytes(INITIAL_PSK_HEX);

        const envelope = pskEncryptMessage(
            'Hello PSK!',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            0
        );

        const encoded = encodePSKEnvelope(envelope);
        expect(encoded.length).toBeGreaterThanOrEqual(PSK_PROTOCOL.HEADER_SIZE + PSK_PROTOCOL.TAG_SIZE);

        const decoded = decodePSKEnvelope(encoded);
        expect(decoded.version).toBe(PSK_PROTOCOL.VERSION);
        expect(decoded.protocolId).toBe(PSK_PROTOCOL.PROTOCOL_ID);
        expect(decoded.counter).toBe(0);
        expect(bytesToHex(decoded.senderPublicKey)).toBe(bytesToHex(aliceKeys.publicKey));
        expect(bytesToHex(decoded.ephemeralPublicKey)).toBe(bytesToHex(envelope.ephemeralPublicKey));
        expect(bytesToHex(decoded.nonce)).toBe(bytesToHex(envelope.nonce));
        expect(bytesToHex(decoded.encryptedSenderKey)).toBe(bytesToHex(envelope.encryptedSenderKey));
        expect(bytesToHex(decoded.ciphertext)).toBe(bytesToHex(envelope.ciphertext));
    });

    it('detects PSK messages correctly', () => {
        const aliceKeys = getAliceKeys();
        const bobKeys = getBobKeys();
        const initialPSK = hexToBytes(INITIAL_PSK_HEX);

        const envelope = pskEncryptMessage(
            'test',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            42
        );

        const encoded = encodePSKEnvelope(envelope);
        expect(isPSKMessage(encoded)).toBe(true);

        // v1 protocol 0x01 is not a PSK message
        expect(isPSKMessage(new Uint8Array([0x01, 0x01, 0x00]))).toBe(false);

        // Too short
        expect(isPSKMessage(new Uint8Array([0x01, 0x02]))).toBe(false);
    });

    it('preserves counter value', () => {
        const aliceKeys = getAliceKeys();
        const bobKeys = getBobKeys();
        const initialPSK = hexToBytes(INITIAL_PSK_HEX);

        for (const counter of [0, 1, 99, 100, 1000, 65535, 0xFFFFFFFF]) {
            const envelope = pskEncryptMessage(
                'counter test',
                aliceKeys.publicKey,
                bobKeys.publicKey,
                initialPSK,
                counter
            );
            const encoded = encodePSKEnvelope(envelope);
            const decoded = decodePSKEnvelope(encoded);
            expect(decoded.counter).toBe(counter);
        }
    });
});

describe('PSK Encryption Round-Trip', () => {
    const aliceKeys = getAliceKeys();
    const bobKeys = getBobKeys();
    const initialPSK = hexToBytes(INITIAL_PSK_HEX);

    it('encrypts and decrypts as recipient', () => {
        const envelope = pskEncryptMessage(
            'Hello from PSK!',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            0
        );

        const decrypted = pskDecryptMessage(
            envelope,
            bobKeys.privateKey,
            bobKeys.publicKey,
            initialPSK
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted!.text).toBe('Hello from PSK!');
        expect(decrypted!.counter).toBe(0);
    });

    it('sender can decrypt own message', () => {
        const envelope = pskEncryptMessage(
            'Self-decrypt test',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            5
        );

        const decrypted = pskDecryptMessage(
            envelope,
            aliceKeys.privateKey,
            aliceKeys.publicKey,
            initialPSK
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted!.text).toBe('Self-decrypt test');
        expect(decrypted!.counter).toBe(5);
    });

    it('decrypts with different counter values', () => {
        for (const counter of [0, 1, 50, 99, 100, 200]) {
            const msg = `Counter ${counter}`;
            const envelope = pskEncryptMessage(
                msg,
                aliceKeys.publicKey,
                bobKeys.publicKey,
                initialPSK,
                counter
            );

            const decrypted = pskDecryptMessage(
                envelope,
                bobKeys.privateKey,
                bobKeys.publicKey,
                initialPSK
            );

            expect(decrypted).not.toBeNull();
            expect(decrypted!.text).toBe(msg);
        }
    });

    it('handles unicode messages', () => {
        const envelope = pskEncryptMessage(
            'Hello! \u{1F44B} PSK messaging \u{1F512}',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            0
        );

        const decrypted = pskDecryptMessage(
            envelope,
            bobKeys.privateKey,
            bobKeys.publicKey,
            initialPSK
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted!.text).toBe('Hello! \u{1F44B} PSK messaging \u{1F512}');
    });

    it('wrong PSK fails to decrypt', () => {
        const envelope = pskEncryptMessage(
            'Secret',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            0
        );

        const wrongPSK = new Uint8Array(32).fill(0xBB);
        expect(() => {
            pskDecryptMessage(
                envelope,
                bobKeys.privateKey,
                bobKeys.publicKey,
                wrongPSK
            );
        }).toThrow();
    });

    it('wrong private key fails to decrypt', () => {
        const envelope = pskEncryptMessage(
            'Secret',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            0
        );

        const wrongKey = x25519.utils.randomPrivateKey();
        const wrongPub = x25519.getPublicKey(wrongKey);

        expect(() => {
            pskDecryptMessage(envelope, wrongKey, wrongPub, initialPSK);
        }).toThrow();
    });

    it('full encode/decode/decrypt roundtrip', () => {
        const envelope = pskEncryptMessage(
            'Full roundtrip',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            initialPSK,
            7
        );

        const encoded = encodePSKEnvelope(envelope);
        expect(isPSKMessage(encoded)).toBe(true);

        const decoded = decodePSKEnvelope(encoded);
        const decrypted = pskDecryptMessage(
            decoded,
            bobKeys.privateKey,
            bobKeys.publicKey,
            initialPSK
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted!.text).toBe('Full roundtrip');
        expect(decrypted!.counter).toBe(7);
    });
});

describe('PSK State Management', () => {
    it('creates state with zero counters', () => {
        const psk = new Uint8Array(32).fill(0xAA);
        const state = createPSKState(psk);

        expect(state.sendCounter).toBe(0);
        expect(state.receiveCounter).toBe(0);
        expect(state.receivedCounters.size).toBe(0);
    });

    it('rejects invalid PSK length', () => {
        expect(() => createPSKState(new Uint8Array(16))).toThrow();
        expect(() => createPSKState(new Uint8Array(64))).toThrow();
    });

    it('advances send counter monotonically', () => {
        const state = createPSKState(new Uint8Array(32).fill(0xAA));

        expect(advanceSendCounter(state)).toBe(0);
        expect(advanceSendCounter(state)).toBe(1);
        expect(advanceSendCounter(state)).toBe(2);
        expect(state.sendCounter).toBe(3);
    });

    it('validates receive counter within window', () => {
        const state = createPSKState(new Uint8Array(32).fill(0xAA));

        // First message - any counter accepted
        expect(validateReceiveCounter(state, 0)).toBe(true);
        recordReceivedCounter(state, 0);

        // Within window
        expect(validateReceiveCounter(state, 100)).toBe(true);
        recordReceivedCounter(state, 100);

        // Within window of new high-water mark
        expect(validateReceiveCounter(state, 50)).toBe(true);
        expect(validateReceiveCounter(state, 200)).toBe(true);

        // Outside window (too far ahead)
        expect(validateReceiveCounter(state, 301)).toBe(false);
    });

    it('rejects replay (duplicate counter)', () => {
        const state = createPSKState(new Uint8Array(32).fill(0xAA));

        expect(validateReceiveCounter(state, 5)).toBe(true);
        recordReceivedCounter(state, 5);

        // Same counter should be rejected
        expect(validateReceiveCounter(state, 5)).toBe(false);
    });

    it('prunes old counters', () => {
        const state = createPSKState(new Uint8Array(32).fill(0xAA));

        // Record counter 0
        recordReceivedCounter(state, 0);
        expect(state.receivedCounters.has(0)).toBe(true);

        // Advance well past window
        recordReceivedCounter(state, 500);
        // Counter 0 should be pruned (outside window of 200 from 500)
        expect(state.receivedCounters.has(0)).toBe(false);
    });

    it('serializes and deserializes', () => {
        const state = createPSKState(new Uint8Array(32).fill(0xAA));
        advanceSendCounter(state);
        advanceSendCounter(state);
        recordReceivedCounter(state, 10);
        recordReceivedCounter(state, 15);

        const json = serializePSKState(state);
        const restored = deserializePSKState(json);

        expect(restored.sendCounter).toBe(2);
        expect(restored.receiveCounter).toBe(15);
        expect(restored.receivedCounters.has(10)).toBe(true);
        expect(restored.receivedCounters.has(15)).toBe(true);
        expect(bytesToHex(restored.initialPSK)).toBe(bytesToHex(state.initialPSK));
    });
});

describe('PSK Exchange URI', () => {
    it('creates and parses URI roundtrip', () => {
        const psk = new Uint8Array(32).fill(0x42);
        const address = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

        const uri = createPSKExchangeURI(address, psk, 'Alice');
        expect(uri).toContain('algochat-psk://v1?');
        expect(uri).toContain('addr=' + address);
        expect(uri).toContain('label=Alice');

        const parsed = parsePSKExchangeURI(uri);
        expect(parsed.address).toBe(address);
        expect(parsed.label).toBe('Alice');
        expect(bytesToHex(parsed.psk)).toBe(bytesToHex(psk));
    });

    it('handles special characters in label', () => {
        const psk = generatePSK();
        const uri = createPSKExchangeURI('ADDR', psk, 'Bob & Alice <3');
        const parsed = parsePSKExchangeURI(uri);
        expect(parsed.label).toBe('Bob & Alice <3');
    });

    it('handles empty label', () => {
        const psk = generatePSK();
        const uri = createPSKExchangeURI('ADDR', psk, '');
        const parsed = parsePSKExchangeURI(uri);
        expect(parsed.label).toBe('');
    });

    it('rejects invalid URI scheme', () => {
        expect(() => parsePSKExchangeURI('https://example.com')).toThrow();
    });

    it('rejects missing parameters', () => {
        expect(() => parsePSKExchangeURI('algochat-psk://v1?psk=AAAA')).toThrow();
        expect(() => parsePSKExchangeURI('algochat-psk://v1?addr=AAAA')).toThrow();
    });

    it('rejects invalid PSK length', () => {
        expect(() => createPSKExchangeURI('ADDR', new Uint8Array(16), 'test')).toThrow();
    });

    it('generates random 32-byte PSK', () => {
        const psk = generatePSK();
        expect(psk.length).toBe(32);

        // Should be different each time
        const psk2 = generatePSK();
        expect(bytesToHex(psk)).not.toBe(bytesToHex(psk2));
    });
});
