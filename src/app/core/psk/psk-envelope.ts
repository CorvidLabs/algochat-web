/**
 * PSK Protocol v1.1 - Envelope Encoding/Decoding
 *
 * Wire format (130-byte header):
 *   [0]:     version (0x01)
 *   [1]:     protocolId (0x02)
 *   [2..5]:  counter (big-endian u32)
 *   [6..37]: senderPublicKey (32 bytes)
 *   [38..69]: ephemeralPublicKey (32 bytes)
 *   [70..81]: nonce (12 bytes)
 *   [82..129]: encryptedSenderKey (48 bytes)
 *   [130..]:  ciphertext + tag
 */

import { PSK_PROTOCOL, type PSKEnvelope } from './psk-types';

export class PSKEnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKEnvelopeError';
    }
}

/**
 * Encodes a PSKEnvelope to bytes for transaction note.
 */
export function encodePSKEnvelope(envelope: PSKEnvelope): Uint8Array {
    const totalSize = PSK_PROTOCOL.HEADER_SIZE + envelope.ciphertext.length;
    const result = new Uint8Array(totalSize);
    let offset = 0;

    // Version and protocol
    result[offset++] = envelope.version;
    result[offset++] = envelope.protocolId;

    // Counter (4 bytes, big-endian)
    new DataView(result.buffer).setUint32(offset, envelope.counter, false);
    offset += 4;

    // Sender public key (32 bytes)
    result.set(envelope.senderPublicKey, offset);
    offset += 32;

    // Ephemeral public key (32 bytes)
    result.set(envelope.ephemeralPublicKey, offset);
    offset += 32;

    // Nonce (12 bytes)
    result.set(envelope.nonce, offset);
    offset += 12;

    // Encrypted sender key (48 bytes)
    result.set(envelope.encryptedSenderKey, offset);
    offset += 48;

    // Ciphertext + tag
    result.set(envelope.ciphertext, offset);

    return result;
}

/**
 * Decodes bytes from transaction note to PSKEnvelope.
 */
export function decodePSKEnvelope(data: Uint8Array): PSKEnvelope {
    if (data.length < 2) {
        throw new PSKEnvelopeError(`Data too short: ${data.length} bytes`);
    }

    const version = data[0];
    const protocolId = data[1];

    if (version !== PSK_PROTOCOL.VERSION) {
        throw new PSKEnvelopeError(`Unsupported version: ${version}`);
    }

    if (protocolId !== PSK_PROTOCOL.PROTOCOL_ID) {
        throw new PSKEnvelopeError(`Not a PSK envelope: protocol ${protocolId}`);
    }

    const minSize = PSK_PROTOCOL.HEADER_SIZE + PSK_PROTOCOL.TAG_SIZE;
    if (data.length < minSize) {
        throw new PSKEnvelopeError(`Data too short: ${data.length} bytes, need at least ${minSize}`);
    }

    const counter = new DataView(data.buffer, data.byteOffset).getUint32(2, false);

    return {
        version,
        protocolId,
        counter,
        senderPublicKey: data.slice(6, 38),
        ephemeralPublicKey: data.slice(38, 70),
        nonce: data.slice(70, 82),
        encryptedSenderKey: data.slice(82, 130),
        ciphertext: data.slice(130),
    };
}

/**
 * Checks if data is a PSK v1.1 message (version=0x01, protocol=0x02).
 */
export function isPSKMessage(data: Uint8Array): boolean {
    return (
        data.length >= PSK_PROTOCOL.HEADER_SIZE + PSK_PROTOCOL.TAG_SIZE &&
        data[0] === PSK_PROTOCOL.VERSION &&
        data[1] === PSK_PROTOCOL.PROTOCOL_ID
    );
}
