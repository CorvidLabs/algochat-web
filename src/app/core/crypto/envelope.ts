import { ChatEnvelope, PROTOCOL } from '../types';

export class EnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

export function encodeEnvelope(envelope: ChatEnvelope): Uint8Array {
    const totalSize = 2 + 32 + 32 + 12 + 48 + envelope.ciphertext.length;
    const result = new Uint8Array(totalSize);
    let offset = 0;

    result[offset++] = envelope.version;
    result[offset++] = envelope.protocolId;
    result.set(envelope.senderPublicKey, offset);
    offset += 32;
    result.set(envelope.ephemeralPublicKey, offset);
    offset += 32;
    result.set(envelope.nonce, offset);
    offset += 12;
    result.set(envelope.encryptedSenderKey, offset);
    offset += 48;
    result.set(envelope.ciphertext, offset);

    return result;
}

export function decodeEnvelope(data: Uint8Array): ChatEnvelope {
    if (data.length < 2) {
        throw new EnvelopeError(`Data too short: ${data.length} bytes`);
    }

    const version = data[0];
    const protocolId = data[1];

    if (protocolId !== PROTOCOL.PROTOCOL_ID) {
        throw new EnvelopeError(`Unsupported protocol: ${protocolId}`);
    }

    if (version !== PROTOCOL.VERSION) {
        throw new EnvelopeError(`Unsupported version: ${version}`);
    }

    const minSize = PROTOCOL.HEADER_SIZE + PROTOCOL.TAG_SIZE;
    if (data.length < minSize) {
        throw new EnvelopeError(`Data too short: ${data.length} bytes`);
    }

    return {
        version,
        protocolId,
        senderPublicKey: data.slice(2, 34),
        ephemeralPublicKey: data.slice(34, 66),
        nonce: data.slice(66, 78),
        encryptedSenderKey: data.slice(78, 126),
        ciphertext: data.slice(126),
    };
}

export function isChatMessage(data: Uint8Array): boolean {
    return data.length >= 2 && data[0] === PROTOCOL.VERSION && data[1] === PROTOCOL.PROTOCOL_ID;
}
