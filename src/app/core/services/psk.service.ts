/**
 * PSK Storage Service
 *
 * Manages persistent storage of pre-shared keys and their counter state.
 *
 * SECURITY: PSK entries (including the base64-encoded key material) are
 * encrypted with AES-GCM before being written to localStorage. The encryption
 * key is either derived from the user's password (PBKDF2, "Remember me" mode)
 * or is a random session key held only in memory (lost when the tab closes).
 *
 * Legacy plaintext data is automatically migrated to encrypted form on first
 * load. See storage-crypto.ts for implementation details.
 */
import { Injectable, signal } from '@angular/core';
import {
    createPSKState,
    createPSKExchangeURI,
    parsePSKExchangeURI,
    type PSKState,
} from '@corvidlabs/ts-algochat';
import {
    encryptForStorage,
    decryptFromStorage,
    isEncryptedData,
    isSessionEncryptedData,
} from '../utils/storage-crypto';

interface PSKEntry {
    psk: string; // base64-encoded 32-byte key (encrypted at rest in localStorage)
    state: SerializedPSKState;
}

interface SerializedPSKState {
    sendCounter: number;
    peerLastCounter: number;
    seenCounters: number[];
}

@Injectable({ providedIn: 'root' })
export class PSKService {
    private static readonly STORAGE_KEY = 'algochat_psk';

    private readonly _entries = signal<Record<string, PSKEntry>>({});
    private initialized = false;
    private savePromise: Promise<void> | null = null;

    readonly entries = this._entries.asReadonly();

    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this.load();
        this.initialized = true;
    }

    generatePSK(): Uint8Array {
        const psk = new Uint8Array(32);
        crypto.getRandomValues(psk);
        return psk;
    }

    storePSK(address: string, psk: Uint8Array): void {
        const entry: PSKEntry = {
            psk: uint8ArrayToBase64(psk),
            state: serializeState(createPSKState()),
        };
        this._entries.update(entries => ({ ...entries, [address]: entry }));
        this.save();
    }

    getPSK(address: string): Uint8Array | null {
        const entry = this._entries()[address];
        if (!entry) return null;
        return base64ToUint8Array(entry.psk);
    }

    hasPSK(address: string): boolean {
        return address in this._entries();
    }

    removePSK(address: string): void {
        this._entries.update(entries => {
            const { [address]: _, ...remaining } = entries;
            return remaining;
        });
        this.save();
    }

    getState(address: string): PSKState {
        const entry = this._entries()[address];
        if (!entry) return createPSKState();
        return deserializeState(entry.state);
    }

    setState(address: string, state: PSKState): void {
        const entry = this._entries()[address];
        if (!entry) return;
        this._entries.update(entries => ({
            ...entries,
            [address]: { ...entry, psk: entry.psk, state: serializeState(state) },
        }));
        this.save();
    }

    createExchangeURI(myAddress: string, psk: Uint8Array, label?: string): string {
        return createPSKExchangeURI(myAddress, psk, label);
    }

    importFromURI(uri: string): { address: string; psk: Uint8Array; label?: string } {
        return parsePSKExchangeURI(uri);
    }

    clear(): void {
        this._entries.set({});
        localStorage.removeItem(PSKService.STORAGE_KEY);
        this.initialized = false;
    }

    private async load(): Promise<void> {
        try {
            const stored = localStorage.getItem(PSKService.STORAGE_KEY);
            if (!stored) {
                this._entries.set({});
                return;
            }

            if (isEncryptedData(stored) || isSessionEncryptedData(stored)) {
                const decrypted = await decryptFromStorage(stored);
                if (decrypted) {
                    this._entries.set(JSON.parse(decrypted));
                } else {
                    // Decryption failed (session key lost or wrong password).
                    // Do NOT fall back to parsing as JSON -- that would only
                    // succeed if the data were plaintext, which we must not
                    // silently accept.
                    this._entries.set({});
                }
            } else {
                // SECURITY: Legacy plaintext PSK data found in localStorage.
                // This is a migration path only -- parse, load into memory,
                // and immediately re-encrypt to eliminate the plaintext copy.
                console.warn('[AlgoChat] Migrating plaintext PSK data to encrypted storage');
                const data = JSON.parse(stored);
                this._entries.set(data);
                this.save();
            }
        } catch {
            this._entries.set({});
        }
    }

    private save(): void {
        const doSave = async (): Promise<void> => {
            try {
                const data = JSON.stringify(this._entries());
                const encrypted = await encryptForStorage(data);
                localStorage.setItem(PSKService.STORAGE_KEY, encrypted);
            } catch (err) {
                console.error('[AlgoChat] Failed to save PSK data:', err);
            }
        };

        this.savePromise = (this.savePromise ?? Promise.resolve()).then(doSave);
    }
}

function serializeState(state: PSKState): SerializedPSKState {
    return {
        sendCounter: state.sendCounter,
        peerLastCounter: state.peerLastCounter,
        seenCounters: Array.from(state.seenCounters),
    };
}

function deserializeState(serialized: SerializedPSKState): PSKState {
    return {
        sendCounter: serialized.sendCounter,
        peerLastCounter: serialized.peerLastCounter,
        seenCounters: new Set(serialized.seenCounters),
    };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
