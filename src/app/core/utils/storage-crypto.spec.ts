/**
 * Storage Crypto - Tests
 *
 * Tests for AES-GCM encryption/decryption, password mode, session mode,
 * storage helpers, and re-encryption.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    encryptWithPassword,
    decryptWithPassword,
    isEncryptedData,
    encryptForSession,
    decryptFromSession,
    isSessionEncryptedData,
    setPasswordContext,
    clearPasswordContext,
    hasPasswordContext,
    encryptForStorage,
    decryptFromStorage,
    reEncryptStorageKey,
} from './storage-crypto';

// Mock localStorage for Node test environment
const store: Record<string, string> = {};
const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Reset password context between tests
beforeEach(() => {
    clearPasswordContext();
    localStorageMock.clear();
});

afterEach(() => {
    clearPasswordContext();
    localStorageMock.clear();
});

describe('Password Encryption', () => {
    const password = 'test-password-123';

    it('encrypts and decrypts roundtrip', async () => {
        const plaintext = 'Hello, encrypted world!';
        const encrypted = await encryptWithPassword(plaintext, password);
        const decrypted = await decryptWithPassword(encrypted, password);
        expect(decrypted).toBe(plaintext);
    });

    it('produces valid JSON with salt, iv, ciphertext', async () => {
        const encrypted = await encryptWithPassword('test', password);
        const parsed = JSON.parse(encrypted);
        expect(parsed).toHaveProperty('salt');
        expect(parsed).toHaveProperty('iv');
        expect(parsed).toHaveProperty('ciphertext');
    });

    it('produces different ciphertext each time (random salt/iv)', async () => {
        const plaintext = 'same input';
        const encrypted1 = await encryptWithPassword(plaintext, password);
        const encrypted2 = await encryptWithPassword(plaintext, password);
        expect(encrypted1).not.toBe(encrypted2);
    });

    it('returns null with wrong password', async () => {
        const encrypted = await encryptWithPassword('secret', password);
        const decrypted = await decryptWithPassword(encrypted, 'wrong-password');
        expect(decrypted).toBeNull();
    });

    it('returns null for invalid JSON input', async () => {
        const decrypted = await decryptWithPassword('not-json', password);
        expect(decrypted).toBeNull();
    });

    it('handles empty string plaintext', async () => {
        const encrypted = await encryptWithPassword('', password);
        const decrypted = await decryptWithPassword(encrypted, password);
        expect(decrypted).toBe('');
    });

    it('handles unicode content', async () => {
        const plaintext = 'Hello \u{1F44B} encrypted \u{1F512}';
        const encrypted = await encryptWithPassword(plaintext, password);
        const decrypted = await decryptWithPassword(encrypted, password);
        expect(decrypted).toBe(plaintext);
    });

    it('handles long plaintext', async () => {
        const plaintext = 'a'.repeat(10000);
        const encrypted = await encryptWithPassword(plaintext, password);
        const decrypted = await decryptWithPassword(encrypted, password);
        expect(decrypted).toBe(plaintext);
    });
});

describe('isEncryptedData', () => {
    it('returns true for password-encrypted data', async () => {
        const encrypted = await encryptWithPassword('test', 'pass');
        expect(isEncryptedData(encrypted)).toBeTruthy();
    });

    it('returns false for plain text', () => {
        expect(isEncryptedData('plain text')).toBeFalsy();
    });

    it('returns false for invalid JSON', () => {
        expect(isEncryptedData('{invalid')).toBeFalsy();
    });

    it('returns false for JSON without required fields', () => {
        expect(isEncryptedData(JSON.stringify({ salt: 'a', iv: 'b' }))).toBeFalsy();
        expect(isEncryptedData(JSON.stringify({ foo: 'bar' }))).toBeFalsy();
    });

    it('returns true for JSON with salt, iv, and ciphertext', () => {
        expect(isEncryptedData(JSON.stringify({ salt: 'a', iv: 'b', ciphertext: 'c' }))).toBeTruthy();
    });
});

describe('Session Encryption', () => {
    it('encrypts and decrypts roundtrip', async () => {
        const plaintext = 'session secret';
        const encrypted = await encryptForSession(plaintext);
        const decrypted = await decryptFromSession(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('produces valid JSON with iv and ciphertext (no salt)', async () => {
        const encrypted = await encryptForSession('test');
        const parsed = JSON.parse(encrypted);
        expect(parsed).toHaveProperty('iv');
        expect(parsed).toHaveProperty('ciphertext');
        expect(parsed).not.toHaveProperty('salt');
    });

    it('produces different ciphertext each time (random iv)', async () => {
        const encrypted1 = await encryptForSession('same');
        const encrypted2 = await encryptForSession('same');
        expect(encrypted1).not.toBe(encrypted2);
    });

    it('handles unicode content', async () => {
        const plaintext = '\u{1F680} rocket session';
        const encrypted = await encryptForSession(plaintext);
        const decrypted = await decryptFromSession(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('returns null for invalid input', async () => {
        const decrypted = await decryptFromSession('not-json');
        expect(decrypted).toBeNull();
    });

    it('returns null for tampered ciphertext', async () => {
        const encrypted = await encryptForSession('test');
        const parsed = JSON.parse(encrypted);
        // Tamper with the ciphertext
        parsed.ciphertext = btoa('tampered-data-that-is-long-enough');
        const decrypted = await decryptFromSession(JSON.stringify(parsed));
        expect(decrypted).toBeNull();
    });
});

describe('isSessionEncryptedData', () => {
    it('returns true for session-encrypted data', async () => {
        const encrypted = await encryptForSession('test');
        expect(isSessionEncryptedData(encrypted)).toBe(true);
    });

    it('returns false for password-encrypted data (has salt)', async () => {
        const encrypted = await encryptWithPassword('test', 'pass');
        expect(isSessionEncryptedData(encrypted)).toBe(false);
    });

    it('returns false for plain text', () => {
        expect(isSessionEncryptedData('plain')).toBe(false);
    });

    it('returns false for invalid JSON', () => {
        expect(isSessionEncryptedData('{bad')).toBe(false);
    });
});

describe('Password Context', () => {
    it('starts without password context', () => {
        expect(hasPasswordContext()).toBe(false);
    });

    it('sets password context', () => {
        setPasswordContext('my-password');
        expect(hasPasswordContext()).toBe(true);
    });

    it('clears password context', () => {
        setPasswordContext('my-password');
        clearPasswordContext();
        expect(hasPasswordContext()).toBe(false);
    });
});

describe('encryptForStorage / decryptFromStorage', () => {
    it('uses session encryption when no password context', async () => {
        const encrypted = await encryptForStorage('session data');
        // Should be session-encrypted (no salt)
        expect(isSessionEncryptedData(encrypted)).toBeTruthy();
        expect(isEncryptedData(encrypted)).toBeFalsy();

        const decrypted = await decryptFromStorage(encrypted);
        expect(decrypted).toBe('session data');
    });

    it('uses password encryption when password context is set', async () => {
        setPasswordContext('storage-pass');
        const encrypted = await encryptForStorage('password data');
        // Should be password-encrypted (has salt)
        expect(isEncryptedData(encrypted)).toBeTruthy();

        const decrypted = await decryptFromStorage(encrypted);
        expect(decrypted).toBe('password data');
    });

    it('returns null when decryption fails', async () => {
        const decrypted = await decryptFromStorage('not-encrypted');
        expect(decrypted).toBeNull();
    });

    it('decrypts session data without password context', async () => {
        const encrypted = await encryptForSession('no-password');
        const decrypted = await decryptFromStorage(encrypted);
        expect(decrypted).toBe('no-password');
    });

    it('decrypts password data with correct password context', async () => {
        setPasswordContext('correct-pass');
        const encrypted = await encryptWithPassword('secret', 'correct-pass');
        const decrypted = await decryptFromStorage(encrypted);
        expect(decrypted).toBe('secret');
    });

    it('returns null for password data with wrong password context', async () => {
        const encrypted = await encryptWithPassword('secret', 'original-pass');
        setPasswordContext('wrong-pass');
        // isEncryptedData is true, password decrypt will fail, session decrypt won't match
        const decrypted = await decryptFromStorage(encrypted);
        expect(decrypted).toBeNull();
    });
});

describe('reEncryptStorageKey', () => {
    it('returns false when key does not exist', async () => {
        const result = await reEncryptStorageKey('nonexistent');
        expect(result).toBe(false);
    });

    it('upgrades session-encrypted to password-encrypted', async () => {
        // Store session-encrypted data
        const encrypted = await encryptForSession('upgrade-me');
        localStorage.setItem('test-key', encrypted);
        expect(isSessionEncryptedData(localStorage.getItem('test-key')!)).toBe(true);

        // Set password context and re-encrypt
        setPasswordContext('upgrade-pass');
        const result = await reEncryptStorageKey('test-key');
        expect(result).toBe(true);

        // Verify it's now password-encrypted
        const stored = localStorage.getItem('test-key')!;
        expect(isEncryptedData(stored)).toBeTruthy();

        // Verify data is still accessible
        const decrypted = await decryptWithPassword(stored, 'upgrade-pass');
        expect(decrypted).toBe('upgrade-me');
    });

    it('does not re-encrypt when no password context', async () => {
        const encrypted = await encryptForSession('keep-session');
        localStorage.setItem('test-key', encrypted);

        const result = await reEncryptStorageKey('test-key');
        expect(result).toBe(false);

        // Data unchanged
        expect(localStorage.getItem('test-key')).toBe(encrypted);
    });

    it('does not re-encrypt already password-encrypted data', async () => {
        setPasswordContext('existing-pass');
        const encrypted = await encryptWithPassword('already-encrypted', 'existing-pass');
        localStorage.setItem('test-key', encrypted);

        const result = await reEncryptStorageKey('test-key');
        expect(result).toBe(false);
    });
});
