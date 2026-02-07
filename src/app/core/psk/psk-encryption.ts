/**
 * PSK Protocol v1.1 - Hybrid ECDH+PSK Encryption
 *
 * Encrypts and decrypts messages using a combination of ephemeral ECDH
 * key agreement and a ratcheted pre-shared key. This provides both
 * forward secrecy (from ephemeral keys) and authentication (from PSK).
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { uint8ArrayEquals } from '@corvidlabs/ts-algochat';
import { PSK_PROTOCOL, type PSKEnvelope } from './psk-types';
import {
    derivePSKAtCounter,
    deriveHybridSymmetricKey,
    deriveSenderKey,
} from './psk-ratchet';

export class PSKEncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKEncryptionError';
    }
}

/** Decrypted PSK message content */
export interface PSKDecryptedContent {
    text: string;
    counter: number;
    replyToId?: string;
    replyToPreview?: string;
}

/**
 * Encrypts a message using the PSK v1.1 protocol.
 *
 * @param plaintext - Message text to encrypt
 * @param senderPublicKey - Sender's X25519 public key
 * @param recipientPublicKey - Recipient's X25519 public key
 * @param initialPSK - 32-byte initial pre-shared key
 * @param counter - Current send counter value
 */
export function pskEncryptMessage(
    plaintext: string,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    initialPSK: Uint8Array,
    counter: number
): PSKEnvelope {
    const messageBytes = new TextEncoder().encode(plaintext);

    if (messageBytes.length > PSK_PROTOCOL.MAX_PAYLOAD_SIZE) {
        throw new PSKEncryptionError(
            `Message too large: ${messageBytes.length} bytes, max ${PSK_PROTOCOL.MAX_PAYLOAD_SIZE}`
        );
    }

    // Step 1: Derive the current PSK from the ratchet
    const currentPSK = derivePSKAtCounter(initialPSK, counter);

    // Step 2: Generate ephemeral key pair
    const ephPriv = x25519.utils.randomSecretKey();
    const ephPub = x25519.getPublicKey(ephPriv);

    // Step 3: ECDH shared secret with recipient
    const sharedSecret = x25519.getSharedSecret(ephPriv, recipientPublicKey);

    // Step 4: Derive hybrid symmetric key (ECDH + PSK)
    const symmetricKey = deriveHybridSymmetricKey(
        sharedSecret,
        currentPSK,
        ephPub,
        senderPublicKey,
        recipientPublicKey
    );

    // Step 5: Encrypt message
    const nonce = randomBytes(12);
    const cipher = chacha20poly1305(symmetricKey, nonce);
    const ciphertextWithTag = cipher.encrypt(messageBytes);

    // Step 6: Encrypt symmetric key for sender (bidirectional decryption)
    const senderSharedSecret = x25519.getSharedSecret(ephPriv, senderPublicKey);
    const senderEncryptionKey = deriveSenderKey(
        senderSharedSecret,
        currentPSK,
        ephPub,
        senderPublicKey
    );

    const senderCipher = chacha20poly1305(senderEncryptionKey, nonce);
    const encryptedSenderKey = senderCipher.encrypt(symmetricKey);

    return {
        version: PSK_PROTOCOL.VERSION,
        protocolId: PSK_PROTOCOL.PROTOCOL_ID,
        counter,
        senderPublicKey,
        ephemeralPublicKey: ephPub,
        nonce,
        encryptedSenderKey,
        ciphertext: ciphertextWithTag,
    };
}

/**
 * Decrypts a PSK v1.1 message.
 *
 * Automatically detects if we are the sender or recipient
 * and uses the appropriate decryption path.
 *
 * @param envelope - The PSK envelope to decrypt
 * @param myPrivateKey - Our X25519 private key
 * @param myPublicKey - Our X25519 public key
 * @param initialPSK - 32-byte initial pre-shared key
 */
export function pskDecryptMessage(
    envelope: PSKEnvelope,
    myPrivateKey: Uint8Array,
    myPublicKey: Uint8Array,
    initialPSK: Uint8Array
): PSKDecryptedContent | null {
    const weAreSender = uint8ArrayEquals(myPublicKey, envelope.senderPublicKey);

    // Derive the current PSK from the ratchet at the envelope's counter
    const currentPSK = derivePSKAtCounter(initialPSK, envelope.counter);

    let plaintext: Uint8Array;

    if (weAreSender) {
        plaintext = pskDecryptAsSender(envelope, myPrivateKey, myPublicKey, currentPSK);
    } else {
        plaintext = pskDecryptAsRecipient(envelope, myPrivateKey, myPublicKey, currentPSK);
    }

    return parsePSKPayload(plaintext, envelope.counter);
}

/**
 * Decrypts as the message recipient using hybrid ECDH+PSK.
 */
function pskDecryptAsRecipient(
    envelope: PSKEnvelope,
    recipientPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    currentPSK: Uint8Array
): Uint8Array {
    // ECDH with ephemeral key
    const sharedSecret = x25519.getSharedSecret(recipientPrivateKey, envelope.ephemeralPublicKey);

    // Derive hybrid symmetric key
    const symmetricKey = deriveHybridSymmetricKey(
        sharedSecret,
        currentPSK,
        envelope.ephemeralPublicKey,
        envelope.senderPublicKey,
        recipientPublicKey
    );

    // Decrypt message
    const cipher = chacha20poly1305(symmetricKey, envelope.nonce);
    return cipher.decrypt(envelope.ciphertext);
}

/**
 * Decrypts as the message sender using the encrypted sender key.
 */
function pskDecryptAsSender(
    envelope: PSKEnvelope,
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    currentPSK: Uint8Array
): Uint8Array {
    // ECDH with ephemeral key using sender's private key
    const senderSharedSecret = x25519.getSharedSecret(senderPrivateKey, envelope.ephemeralPublicKey);

    // Derive sender key encryption key
    const senderDecryptionKey = deriveSenderKey(
        senderSharedSecret,
        currentPSK,
        envelope.ephemeralPublicKey,
        senderPublicKey
    );

    // Decrypt the symmetric key
    const senderCipher = chacha20poly1305(senderDecryptionKey, envelope.nonce);
    const symmetricKey = senderCipher.decrypt(envelope.encryptedSenderKey);

    // Decrypt the message using the recovered symmetric key
    const cipher = chacha20poly1305(symmetricKey, envelope.nonce);
    return cipher.decrypt(envelope.ciphertext);
}

/**
 * Parses decrypted PSK message payload.
 */
function parsePSKPayload(data: Uint8Array, counter: number): PSKDecryptedContent | null {
    const text = new TextDecoder().decode(data);

    // Check for key-publish payload
    if (text.startsWith('{')) {
        try {
            const json = JSON.parse(text);
            if (json.type === 'key-publish') {
                return null;
            }
            if (typeof json.text === 'string') {
                return {
                    text: json.text,
                    counter,
                    replyToId: json.replyTo?.txid,
                    replyToPreview: json.replyTo?.preview,
                };
            }
        } catch {
            // Fall through to plain text
        }
    }

    return { text, counter };
}
