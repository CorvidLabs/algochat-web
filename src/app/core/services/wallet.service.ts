import { Injectable, signal, computed } from '@angular/core';
import {
    createChatAccountFromMnemonic,
    createRandomChatAccount,
    validateMnemonic,
    validateAddress,
    type ChatAccount,
} from 'ts-algochat';

const SESSION_KEY = 'algochat_session';
const PERSIST_KEY = 'algochat_persist';

@Injectable({ providedIn: 'root' })
export class WalletService {
    private readonly _account = signal<ChatAccount | null>(null);

    readonly account = this._account.asReadonly();
    readonly connected = computed(() => this._account() !== null);
    readonly address = computed(() => this._account()?.address ?? '');

    constructor() {
        this.restoreSession();
    }

    connect(mnemonic: string, remember = false): boolean {
        try {
            const chatAccount = createChatAccountFromMnemonic(mnemonic);
            this._account.set(chatAccount);

            if (remember) {
                localStorage.setItem(PERSIST_KEY, mnemonic);
                sessionStorage.removeItem(SESSION_KEY);
            } else {
                sessionStorage.setItem(SESSION_KEY, mnemonic);
                localStorage.removeItem(PERSIST_KEY);
            }

            return true;
        } catch {
            return false;
        }
    }

    disconnect(): void {
        this._account.set(null);
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(PERSIST_KEY);
    }

    private restoreSession(): void {
        const mnemonic = localStorage.getItem(PERSIST_KEY) ?? sessionStorage.getItem(SESSION_KEY);
        if (mnemonic) {
            const isPersisted = localStorage.getItem(PERSIST_KEY) !== null;
            this.connect(mnemonic, isPersisted);
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
