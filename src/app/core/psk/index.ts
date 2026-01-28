/**
 * PSK Protocol v1.1 - Barrel Export
 *
 * Pre-shared key messaging for AlgoChat.
 */

// Types and constants
export { PSK_PROTOCOL, PSK_HKDF, type PSKEnvelope, type PSKState } from './psk-types';

// Ratchet key derivation
export {
    deriveSessionPSK,
    derivePositionPSK,
    derivePSKAtCounter,
    deriveHybridSymmetricKey,
    deriveSenderKey,
} from './psk-ratchet';

// Envelope encoding/decoding
export {
    encodePSKEnvelope,
    decodePSKEnvelope,
    isPSKMessage,
    PSKEnvelopeError,
} from './psk-envelope';

// Counter state management
export {
    createPSKState,
    advanceSendCounter,
    validateReceiveCounter,
    recordReceivedCounter,
    serializePSKState,
    deserializePSKState,
    PSKCounterError,
} from './psk-state';

// Key exchange URI
export {
    createPSKExchangeURI,
    parsePSKExchangeURI,
    generatePSK,
    PSKExchangeError,
    type PSKExchangeURI,
} from './psk-exchange';

// Encryption/decryption
export {
    pskEncryptMessage,
    pskDecryptMessage,
    PSKEncryptionError,
    type PSKDecryptedContent,
} from './psk-encryption';

// Angular service
export { PSKService } from './psk.service';
