import { Injectable, signal, computed } from '@angular/core';
import algosdk from 'algosdk';
import { deriveEncryptionKeys } from '../crypto';
import type { X25519KeyPair } from '../types';

export interface ChatAccount {
    address: string;
    account: algosdk.Account;
    encryptionKeys: X25519KeyPair;
}

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
            const account = algosdk.mnemonicToSecretKey(mnemonic);
            const seed = account.sk.slice(0, 32);
            const encryptionKeys = deriveEncryptionKeys(seed);

            const chatAccount: ChatAccount = {
                address: account.addr.toString(),
                account,
                encryptionKeys,
            };

            this._account.set(chatAccount);

            // Store mnemonic - localStorage if remember, sessionStorage otherwise
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
        // Check localStorage first (persisted), then sessionStorage
        const mnemonic = localStorage.getItem(PERSIST_KEY) ?? sessionStorage.getItem(SESSION_KEY);
        console.log('[WalletService] restoreSession, has mnemonic:', !!mnemonic);

        if (mnemonic) {
            // Restore with same persistence setting
            const isPersisted = localStorage.getItem(PERSIST_KEY) !== null;
            const success = this.connect(mnemonic, isPersisted);
            console.log('[WalletService] Session restored:', success, 'address:', this._account()?.address);
        } else {
            console.log('[WalletService] No stored session found');
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
