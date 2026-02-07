/**
 * PSK Protocol v1.1 - Angular Service
 *
 * Manages PSK state, encryption/decryption, and counter tracking
 * for pre-shared key messaging sessions.
 *
 * SECURITY: All PSK state (including the initial pre-shared key) is encrypted
 * via AES-GCM before being persisted to localStorage. See storage-crypto.ts
 * for details on the encryption strategy.
 */

import { Injectable, signal } from '@angular/core';
import { type PSKState } from './psk-types';
import {
    createPSKState,
    advanceSendCounter,
    validateReceiveCounter,
    recordReceivedCounter,
    serializePSKState,
    deserializePSKState,
} from './psk-state';
import { pskEncryptMessage, pskDecryptMessage, type PSKDecryptedContent } from './psk-encryption';
import { encodePSKEnvelope, decodePSKEnvelope, isPSKMessage } from './psk-envelope';
import { createPSKExchangeURI, parsePSKExchangeURI, generatePSK, type PSKExchangeURI } from './psk-exchange';
import type { PSKEnvelope } from './psk-types';
import {
    encryptForStorage,
    decryptFromStorage,
    isEncryptedData,
    isSessionEncryptedData,
} from '../utils/storage-crypto';

const PSK_STORAGE_PREFIX = 'algochat_psk_';

@Injectable({ providedIn: 'root' })
export class PSKService {
    /** Active PSK sessions keyed by participant address */
    private readonly sessions = new Map<string, PSKState>();

    /** Signal for reactive UI updates */
    readonly activeSessions = signal<string[]>([]);

    /**
     * Initializes a PSK session with a participant.
     *
     * @param address - Participant's Algorand address
     * @param initialPSK - 32-byte pre-shared key
     */
    initSession(address: string, initialPSK: Uint8Array): void {
        const state = createPSKState(initialPSK);
        this.sessions.set(address, state);
        this.updateActiveSessions();
        this.persistState(address, state);
    }

    /**
     * Checks if a PSK session exists for a participant.
     */
    hasSession(address: string): boolean {
        return this.sessions.has(address);
    }

    /**
     * Gets the PSK state for a participant.
     */
    getState(address: string): PSKState | undefined {
        return this.sessions.get(address);
    }

    /**
     * Removes a PSK session.
     */
    removeSession(address: string): void {
        this.sessions.delete(address);
        this.updateActiveSessions();
        this.removePersistedState(address);
    }

    /**
     * Encrypts a message for a PSK session.
     *
     * @returns Encoded envelope bytes ready for a transaction note
     */
    encrypt(
        address: string,
        plaintext: string,
        senderPublicKey: Uint8Array,
        recipientPublicKey: Uint8Array
    ): Uint8Array {
        const state = this.sessions.get(address);
        if (!state) {
            throw new Error(`No PSK session for ${address}`);
        }

        const counter = advanceSendCounter(state);
        const envelope = pskEncryptMessage(
            plaintext,
            senderPublicKey,
            recipientPublicKey,
            state.initialPSK,
            counter
        );

        this.persistState(address, state);
        return encodePSKEnvelope(envelope);
    }

    /**
     * Decrypts a PSK message from a participant.
     *
     * @returns Decrypted content, or null if decryption fails or message is filtered
     */
    decrypt(
        address: string,
        noteBytes: Uint8Array,
        myPrivateKey: Uint8Array,
        myPublicKey: Uint8Array
    ): PSKDecryptedContent | null {
        const state = this.sessions.get(address);
        if (!state) {
            return null;
        }

        if (!isPSKMessage(noteBytes)) {
            return null;
        }

        const envelope = decodePSKEnvelope(noteBytes);

        // Validate counter
        if (!validateReceiveCounter(state, envelope.counter)) {
            return null;
        }

        const decrypted = pskDecryptMessage(
            envelope,
            myPrivateKey,
            myPublicKey,
            state.initialPSK
        );

        if (decrypted) {
            recordReceivedCounter(state, envelope.counter);
            this.persistState(address, state);
        }

        return decrypted;
    }

    /**
     * Checks if a transaction note is a PSK message.
     */
    isPSKMessage(noteBytes: Uint8Array): boolean {
        return isPSKMessage(noteBytes);
    }

    /**
     * Decodes a PSK envelope without decrypting.
     */
    decodeEnvelope(noteBytes: Uint8Array): PSKEnvelope {
        return decodePSKEnvelope(noteBytes);
    }

    /**
     * Generates a new random PSK.
     */
    generatePSK(): Uint8Array {
        return generatePSK();
    }

    /**
     * Creates a PSK exchange URI for sharing.
     */
    createExchangeURI(address: string, psk: Uint8Array, label: string): string {
        return createPSKExchangeURI(address, psk, label);
    }

    /**
     * Parses a PSK exchange URI.
     */
    parseExchangeURI(uri: string): PSKExchangeURI {
        return parsePSKExchangeURI(uri);
    }

    /**
     * Loads all persisted PSK sessions from localStorage.
     * Handles both encrypted (current) and legacy plaintext data,
     * re-encrypting any plaintext data found during migration.
     */
    async loadPersistedSessions(): Promise<void> {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PSK_STORAGE_PREFIX)) {
                keys.push(key);
            }
        }

        for (const key of keys) {
            const address = key.slice(PSK_STORAGE_PREFIX.length);
            const stored = localStorage.getItem(key);
            if (!stored) continue;

            try {
                if (isEncryptedData(stored) || isSessionEncryptedData(stored)) {
                    // Data is already encrypted -- decrypt it
                    const json = await decryptFromStorage(stored);
                    if (json) {
                        const state = deserializePSKState(json);
                        this.sessions.set(address, state);
                    } else {
                        // Decryption failed (session key lost or wrong password).
                        // Leave the encrypted blob in storage for a future unlock attempt.
                        console.warn(`[PSK] Could not decrypt session for ${address} (key unavailable)`);
                    }
                } else {
                    // SECURITY: Legacy plaintext data detected. Parse it and
                    // immediately re-encrypt before proceeding.
                    const state = deserializePSKState(stored);
                    this.sessions.set(address, state);
                    // Re-persist with encryption to eliminate the plaintext copy
                    await this.persistState(address, state);
                    console.warn(`[PSK] Migrated plaintext session for ${address} to encrypted storage`);
                }
            } catch {
                console.warn(`[PSK] Failed to load session for ${address}`);
            }
        }
        this.updateActiveSessions();
    }

    /**
     * Clears all PSK sessions.
     */
    clearAll(): void {
        for (const address of this.sessions.keys()) {
            this.removePersistedState(address);
        }
        this.sessions.clear();
        this.updateActiveSessions();
    }

    private async persistState(address: string, state: PSKState): Promise<void> {
        try {
            const json = serializePSKState(state);
            const encrypted = await encryptForStorage(json);
            localStorage.setItem(PSK_STORAGE_PREFIX + address, encrypted);
        } catch {
            console.warn(`[PSK] Failed to persist state for ${address}`);
        }
    }

    private removePersistedState(address: string): void {
        localStorage.removeItem(PSK_STORAGE_PREFIX + address);
    }

    private updateActiveSessions(): void {
        this.activeSessions.set(Array.from(this.sessions.keys()));
    }
}
