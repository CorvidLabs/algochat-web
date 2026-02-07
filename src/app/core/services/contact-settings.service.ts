import { Injectable, signal } from '@angular/core';
import {
    encryptForStorage,
    decryptFromStorage,
    isEncryptedData,
    isSessionEncryptedData,
    hasPasswordContext,
    reEncryptStorageKey,
} from '../utils/storage-crypto';

export interface ContactSettings {
    nickname?: string;
    isFavorite?: boolean;
    isBlocked?: boolean;
    isMuted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ContactSettingsService {
    private static readonly STORAGE_KEY = 'algochat_contacts';

    private readonly _settings = signal<Record<string, ContactSettings>>({});
    private initialized = false;
    private savePromise: Promise<void> | null = null;

    readonly settings = this._settings.asReadonly();

    /**
     * Initialize the service by loading and decrypting contacts.
     * Must be called after wallet is connected/unlocked.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this.load();
        this.initialized = true;
    }

    /**
     * Re-initializes contact settings after the encryption context changes.
     * Call this after `unlockWithPassword()` to re-decrypt data that may
     * have been encrypted with a session key in a previous tab.
     */
    async reinitialize(): Promise<void> {
        this.initialized = false;
        this.savePromise = null;

        if (hasPasswordContext()) {
            await reEncryptStorageKey(ContactSettingsService.STORAGE_KEY);
        }

        await this.load();
        this.initialized = true;
    }

    private async load(): Promise<void> {
        try {
            const stored = localStorage.getItem(ContactSettingsService.STORAGE_KEY);
            if (!stored) {
                this._settings.set({});
                return;
            }

            // Check if data is encrypted
            if (isEncryptedData(stored) || isSessionEncryptedData(stored)) {
                const decrypted = await decryptFromStorage(stored);
                if (decrypted) {
                    this._settings.set(JSON.parse(decrypted));

                    // Upgrade session-encrypted data to password encryption
                    if (isSessionEncryptedData(stored) && hasPasswordContext()) {
                        this.save();
                    }
                } else {
                    // Decryption failed (wrong password or session key lost)
                    // Start fresh but don't delete - might unlock later
                    this._settings.set({});
                }
            } else {
                // Legacy unencrypted data - migrate to encrypted
                const data = JSON.parse(stored);
                this._settings.set(data);
                // Re-save to encrypt
                this.save();
            }
        } catch {
            // Invalid data, reset
            this._settings.set({});
        }
    }

    private save(): void {
        // Fire-and-forget save with error handling
        const doSave = async (): Promise<void> => {
            try {
                const data = JSON.stringify(this._settings());
                const encrypted = await encryptForStorage(data);
                localStorage.setItem(ContactSettingsService.STORAGE_KEY, encrypted);
            } catch (err) {
                console.error('[AlgoChat] Failed to save contacts:', err);
            }
        };

        // Chain saves to avoid race conditions
        this.savePromise = (this.savePromise ?? Promise.resolve()).then(doSave);
    }

    getSettings(address: string): ContactSettings {
        return this._settings()[address] ?? {};
    }

    setNickname(address: string, nickname: string): void {
        const trimmed = nickname.trim();
        this._settings.update(settings => {
            const current = settings[address] ?? {};
            if (trimmed) {
                return { ...settings, [address]: { ...current, nickname: trimmed } };
            } else {
                // Remove nickname if empty
                const { nickname: _, ...rest } = current;
                const hasOtherSettings = Object.keys(rest).some(k => rest[k as keyof typeof rest]);
                if (hasOtherSettings) {
                    return { ...settings, [address]: rest };
                } else {
                    const { [address]: _, ...remaining } = settings;
                    return remaining;
                }
            }
        });
        this.save();
    }

    toggleFavorite(address: string): void {
        this._settings.update(settings => {
            const current = settings[address] ?? {};
            const newFavorite = !current.isFavorite;
            if (newFavorite) {
                return { ...settings, [address]: { ...current, isFavorite: true } };
            } else {
                const { isFavorite: _, ...rest } = current;
                const hasOtherSettings = Object.keys(rest).some(k => rest[k as keyof typeof rest]);
                if (hasOtherSettings) {
                    return { ...settings, [address]: rest };
                } else {
                    const { [address]: _, ...remaining } = settings;
                    return remaining;
                }
            }
        });
        this.save();
    }

    toggleBlocked(address: string): void {
        this._settings.update(settings => {
            const current = settings[address] ?? {};
            const newBlocked = !current.isBlocked;
            if (newBlocked) {
                return { ...settings, [address]: { ...current, isBlocked: true } };
            } else {
                const { isBlocked: _, ...rest } = current;
                const hasOtherSettings = Object.keys(rest).some(k => rest[k as keyof typeof rest]);
                if (hasOtherSettings) {
                    return { ...settings, [address]: rest };
                } else {
                    const { [address]: _, ...remaining } = settings;
                    return remaining;
                }
            }
        });
        this.save();
    }

    toggleMuted(address: string): void {
        this._settings.update(settings => {
            const current = settings[address] ?? {};
            const newMuted = !current.isMuted;
            if (newMuted) {
                return { ...settings, [address]: { ...current, isMuted: true } };
            } else {
                const { isMuted: _, ...rest } = current;
                const hasOtherSettings = Object.keys(rest).some(k => rest[k as keyof typeof rest]);
                if (hasOtherSettings) {
                    return { ...settings, [address]: rest };
                } else {
                    const { [address]: _, ...remaining } = settings;
                    return remaining;
                }
            }
        });
        this.save();
    }

    getDisplayName(address: string): string {
        const settings = this._settings()[address];
        if (settings?.nickname) {
            return settings.nickname;
        }
        return this.truncateAddress(address);
    }

    private truncateAddress(address: string): string {
        if (address.length <= 12) return address;
        return address.slice(0, 6) + '...' + address.slice(-4);
    }

    isBlocked(address: string): boolean {
        return this._settings()[address]?.isBlocked ?? false;
    }

    isMuted(address: string): boolean {
        return this._settings()[address]?.isMuted ?? false;
    }

    isFavorite(address: string): boolean {
        return this._settings()[address]?.isFavorite ?? false;
    }

    getFavorites(): string[] {
        const settings = this._settings();
        return Object.entries(settings)
            .filter(([_, s]) => s.isFavorite)
            .map(([address]) => address);
    }

    getBlocked(): string[] {
        const settings = this._settings();
        return Object.entries(settings)
            .filter(([_, s]) => s.isBlocked)
            .map(([address]) => address);
    }

    clear(): void {
        this._settings.set({});
        localStorage.removeItem(ContactSettingsService.STORAGE_KEY);
    }
}
