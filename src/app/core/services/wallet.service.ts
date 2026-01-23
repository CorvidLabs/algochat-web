import { Injectable, signal, computed } from '@angular/core';
import algosdk from 'algosdk';
import { deriveEncryptionKeys } from '../crypto';
import type { X25519KeyPair } from '../types';

export interface ChatAccount {
    address: string;
    account: algosdk.Account;
    encryptionKeys: X25519KeyPair;
}

const STORAGE_KEY = 'algochat_session';

@Injectable({ providedIn: 'root' })
export class WalletService {
    private readonly _account = signal<ChatAccount | null>(null);

    readonly account = this._account.asReadonly();
    readonly connected = computed(() => this._account() !== null);
    readonly address = computed(() => this._account()?.address ?? '');

    constructor() {
        this.restoreSession();
    }

    connect(mnemonic: string): boolean {
        try {
            const account = algosdk.mnemonicToSecretKey(mnemonic);
            const seed = account.sk.slice(0, 32);
            const encryptionKeys = deriveEncryptionKeys(seed);

            const chatAccount: ChatAccount = {
                address: account.addr.toString(),
                account,
                encryptionKeys,
            };

            this._account.set(chatAccount);

            // Store encrypted mnemonic in session (not localStorage for security)
            sessionStorage.setItem(STORAGE_KEY, mnemonic);

            return true;
        } catch {
            return false;
        }
    }

    disconnect(): void {
        this._account.set(null);
        sessionStorage.removeItem(STORAGE_KEY);
    }

    private restoreSession(): void {
        const mnemonic = sessionStorage.getItem(STORAGE_KEY);
        if (mnemonic) {
            this.connect(mnemonic);
        }
    }

    validateMnemonic(mnemonic: string): boolean {
        try {
            algosdk.mnemonicToSecretKey(mnemonic);
            return true;
        } catch {
            return false;
        }
    }

    validateAddress(address: string): boolean {
        return algosdk.isValidAddress(address);
    }

    generateAccount(): { mnemonic: string; address: string } {
        const account = algosdk.generateAccount();
        const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
        return { mnemonic, address: account.addr.toString() };
    }

    getPublicKeyBase64(): string {
        const account = this._account();
        if (!account) return '';
        return btoa(String.fromCharCode(...account.encryptionKeys.publicKey));
    }
}
