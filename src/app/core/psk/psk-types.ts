/**
 * PSK Protocol v1.1 - Types and Constants
 *
 * Pre-shared key messaging protocol for AlgoChat.
 * Adds counter-based ratcheting and hybrid ECDH+PSK encryption.
 */

/** Protocol constants for PSK v1.1 */
export const PSK_PROTOCOL = {
    VERSION: 0x01,
    PROTOCOL_ID: 0x02,
    HEADER_SIZE: 130,
    TAG_SIZE: 16,
    ENCRYPTED_SENDER_KEY_SIZE: 48,
    MAX_PAYLOAD_SIZE: 878,
    SESSION_SIZE: 100,
    COUNTER_WINDOW: 200,
} as const;

/** HKDF domain separation constants */
export const PSK_HKDF = {
    SESSION_SALT: 'AlgoChat-PSK-Session',
    POSITION_SALT: 'AlgoChat-PSK-Position',
    HYBRID_INFO_PREFIX: 'AlgoChatV1-PSK',
    SENDER_KEY_INFO_PREFIX: 'AlgoChatV1-PSK-SenderKey',
} as const;

/** Parsed PSK envelope from transaction note */
export interface PSKEnvelope {
    version: number;
    protocolId: number;
    counter: number;
    senderPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    nonce: Uint8Array;
    encryptedSenderKey: Uint8Array;
    ciphertext: Uint8Array;
}

/** Mutable PSK state for counter tracking */
export interface PSKState {
    /** Initial pre-shared key (32 bytes) */
    initialPSK: Uint8Array;
    /** Current send counter (monotonically increasing) */
    sendCounter: number;
    /** Highest received counter */
    receiveCounter: number;
    /** Set of received counters within the window (for replay protection) */
    receivedCounters: Set<number>;
}
