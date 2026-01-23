import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { ChatEnvelope, DecryptedContent, PROTOCOL } from '../types';
import { generateEphemeralKeyPair, x25519ECDH, uint8ArrayEquals } from './keys';

const ENCRYPTION_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1');
const SENDER_KEY_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1-SenderKey');

export class EncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

export function encryptMessage(
    plaintext: string,
    _senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array
): ChatEnvelope {
    const messageBytes = new TextEncoder().encode(plaintext);

    if (messageBytes.length > PROTOCOL.MAX_PAYLOAD_SIZE) {
        throw new EncryptionError(`Message too large: ${messageBytes.length} bytes`);
    }

    const ephemeral = generateEphemeralKeyPair();
    const sharedSecret = x25519ECDH(ephemeral.privateKey, recipientPublicKey);
    const info = concatBytes(ENCRYPTION_INFO_PREFIX, senderPublicKey, recipientPublicKey);
    const symmetricKey = hkdf(sha256, sharedSecret, ephemeral.publicKey, info, 32);
    const nonce = randomBytes(12);

    const cipher = chacha20poly1305(symmetricKey, nonce);
    const ciphertextWithTag = cipher.encrypt(messageBytes);

    const senderSharedSecret = x25519ECDH(ephemeral.privateKey, senderPublicKey);
    const senderInfo = concatBytes(SENDER_KEY_INFO_PREFIX, senderPublicKey);
    const senderEncryptionKey = hkdf(sha256, senderSharedSecret, ephemeral.publicKey, senderInfo, 32);

    const senderCipher = chacha20poly1305(senderEncryptionKey, nonce);
    const encryptedSenderKey = senderCipher.encrypt(symmetricKey);

    return {
        version: PROTOCOL.VERSION,
        protocolId: PROTOCOL.PROTOCOL_ID,
        senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce,
        encryptedSenderKey,
        ciphertext: ciphertextWithTag,
    };
}

export function decryptMessage(
    envelope: ChatEnvelope,
    myPrivateKey: Uint8Array,
    myPublicKey: Uint8Array
): DecryptedContent | null {
    const weAreSender = uint8ArrayEquals(myPublicKey, envelope.senderPublicKey);
    let plaintext: Uint8Array;

    if (weAreSender) {
        plaintext = decryptAsSender(envelope, myPrivateKey, myPublicKey);
    } else {
        plaintext = decryptAsRecipient(envelope, myPrivateKey, myPublicKey);
    }

    if (isKeyPublishPayload(plaintext)) {
        return null;
    }

    return parseMessagePayload(plaintext);
}

function decryptAsRecipient(
    envelope: ChatEnvelope,
    recipientPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array
): Uint8Array {
    const sharedSecret = x25519ECDH(recipientPrivateKey, envelope.ephemeralPublicKey);
    const info = concatBytes(ENCRYPTION_INFO_PREFIX, envelope.senderPublicKey, recipientPublicKey);
    const symmetricKey = hkdf(sha256, sharedSecret, envelope.ephemeralPublicKey, info, 32);
    const cipher = chacha20poly1305(symmetricKey, envelope.nonce);
    return cipher.decrypt(envelope.ciphertext);
}

function decryptAsSender(
    envelope: ChatEnvelope,
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array
): Uint8Array {
    const sharedSecret = x25519ECDH(senderPrivateKey, envelope.ephemeralPublicKey);
    const senderInfo = concatBytes(SENDER_KEY_INFO_PREFIX, senderPublicKey);
    const senderDecryptionKey = hkdf(sha256, sharedSecret, envelope.ephemeralPublicKey, senderInfo, 32);

    const senderCipher = chacha20poly1305(senderDecryptionKey, envelope.nonce);
    const symmetricKey = senderCipher.decrypt(envelope.encryptedSenderKey);

    const cipher = chacha20poly1305(symmetricKey, envelope.nonce);
    return cipher.decrypt(envelope.ciphertext);
}

function isKeyPublishPayload(data: Uint8Array): boolean {
    if (data.length === 0 || data[0] !== 0x7b) return false;
    try {
        const json = JSON.parse(new TextDecoder().decode(data));
        return json.type === 'key-publish';
    } catch {
        return false;
    }
}

function parseMessagePayload(data: Uint8Array): DecryptedContent {
    const text = new TextDecoder().decode(data);
    if (text.startsWith('{')) {
        try {
            const json = JSON.parse(text);
            if (typeof json.text === 'string') {
                return {
                    text: json.text,
                    replyToId: json.replyTo?.txid,
                    replyToPreview: json.replyTo?.preview,
                };
            }
        } catch {
            // Fall through
        }
    }
    return { text };
}

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
