export interface X25519KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

export interface ChatEnvelope {
    version: number;
    protocolId: number;
    senderPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    nonce: Uint8Array;
    encryptedSenderKey: Uint8Array;
    ciphertext: Uint8Array;
}

export interface DecryptedContent {
    text: string;
    replyToId?: string;
    replyToPreview?: string;
}

export interface ReplyContext {
    messageId: string;
    preview: string;
}

export type MessageDirection = 'sent' | 'received';

export interface Message {
    id: string;
    sender: string;
    recipient: string;
    content: string;
    timestamp: Date;
    confirmedRound: number;
    direction: MessageDirection;
    replyContext?: ReplyContext;
}

export interface Conversation {
    participant: string;
    participantPublicKey?: Uint8Array;
    messages: Message[];
    lastFetchedRound?: number;
}

export const PROTOCOL = {
    VERSION: 0x01,
    PROTOCOL_ID: 0x01,
    HEADER_SIZE: 126,
    TAG_SIZE: 16,
    ENCRYPTED_SENDER_KEY_SIZE: 48,
    MAX_PAYLOAD_SIZE: 882,
    MIN_PAYMENT: 1000,
} as const;
