import { Injectable, signal, computed } from '@angular/core';
import {
    createChatAccountFromMnemonic,
    createRandomChatAccount,
    validateMnemonic,
    validateAddress,
    type ChatAccount,
} from 'ts-algochat';
import {
    encryptWithPassword,
    decryptWithPassword,
    isEncryptedData,
    encryptForSession,
    decryptFromSession,
    setPasswordContext,
    clearPasswordContext,
} from '../utils/storage-crypto';

const SESSION_KEY = 'algochat_session';
const PERSIST_KEY = 'algochat_persist';

@Injectable({ providedIn: 'root' })
export class WalletService {
    private readonly _account = signal<ChatAccount | null>(null);

    readonly account = this._account.asReadonly();
    readonly connected = computed(() => this._account() !== null);
    readonly address = computed(() => this._account()?.address ?? '');

    constructor() {
        // Only restore session storage (unencrypted, tab-only)
        this.restoreSessionStorage();
    }

    /**
     * Connects with a mnemonic.
     * If remember=true, requires a password to encrypt the mnemonic.
     */
    async connect(mnemonic: string, remember = false, password?: string): Promise<boolean> {
        try {
            const chatAccount = createChatAccountFromMnemonic(mnemonic);
            this._account.set(chatAccount);

            if (remember && password) {
                // Encrypt and store in localStorage
                const encrypted = await encryptWithPassword(mnemonic, password);
                localStorage.setItem(PERSIST_KEY, encrypted);
                sessionStorage.removeItem(SESSION_KEY);
                // Cache password for contact encryption
                setPasswordContext(password);
            } else if (!remember) {
                // Encrypt with session key (key in memory only, dies with tab)
                const sessionEncrypted = await encryptForSession(mnemonic);
                sessionStorage.setItem(SESSION_KEY, sessionEncrypted);
                localStorage.removeItem(PERSIST_KEY);
                // Clear password context - use session key for contacts
                clearPasswordContext();
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks if there's encrypted data stored in localStorage
     */
    hasStoredSession(): boolean {
        const stored = localStorage.getItem(PERSIST_KEY);
        return stored !== null && isEncryptedData(stored);
    }

    /**
     * Attempts to restore session from localStorage using the provided password
     * Returns true if successful, false if wrong password or no data
     */
    async unlockWithPassword(password: string): Promise<boolean> {
        const stored = localStorage.getItem(PERSIST_KEY);
        if (!stored) return false;

        const mnemonic = await decryptWithPassword(stored, password);
        if (!mnemonic) return false;

        try {
            const chatAccount = createChatAccountFromMnemonic(mnemonic);
            this._account.set(chatAccount);
            // Keep it in session too for this tab (encrypted)
            const sessionEncrypted = await encryptForSession(mnemonic);
            sessionStorage.setItem(SESSION_KEY, sessionEncrypted);
            // Cache password for contact encryption
            setPasswordContext(password);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Clears stored encrypted session (forget this device)
     */
    clearStoredSession(): void {
        localStorage.removeItem(PERSIST_KEY);
    }

    disconnect(): void {
        this._account.set(null);
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(PERSIST_KEY);
        clearPasswordContext();
    }

    private async restoreSessionStorage(): Promise<void> {
        // Only restore from sessionStorage (encrypted with session key)
        const encrypted = sessionStorage.getItem(SESSION_KEY);
        if (encrypted) {
            try {
                const mnemonic = await decryptFromSession(encrypted);
                if (mnemonic) {
                    const chatAccount = createChatAccountFromMnemonic(mnemonic);
                    this._account.set(chatAccount);
                } else {
                    // Key was lost (new tab/page), clear stale data
                    sessionStorage.removeItem(SESSION_KEY);
                }
            } catch {
                sessionStorage.removeItem(SESSION_KEY);
            }
        }
    }

    validateMnemonic(mnemonic: string): boolean {
        return validateMnemonic(mnemonic);
    }

    validateAddress(address: string): boolean {
        return validateAddress(address);
    }

    generateAccount(): { mnemonic: string; address: string } {
        const { account, mnemonic } = createRandomChatAccount();
        return { mnemonic, address: account.address };
    }

    getPublicKeyBase64(): string {
        const account = this._account();
        if (!account) return '';
        return btoa(String.fromCharCode(...account.encryptionKeys.publicKey));
    }
}
