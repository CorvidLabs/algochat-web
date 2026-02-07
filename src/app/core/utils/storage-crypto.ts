/**
 * Storage Crypto - AES-GCM encryption for localStorage
 *
 * Uses Web Crypto API with PBKDF2 key derivation for secure storage.
 *
 * SECURITY OVERVIEW
 * =================
 * This module protects sensitive data (PSK keys, wallet mnemonics, contacts)
 * that must survive in browser storage. Two modes are supported:
 *
 * 1. **Password mode ("Remember me")** -- Data is encrypted with AES-256-GCM
 *    using a key derived from the user's password via PBKDF2 (100 000 iterations,
 *    SHA-256). A fresh random salt and IV are generated for each encryption.
 *    Data persists across tabs and browser restarts; the password must be
 *    re-entered to decrypt.
 *
 * 2. **Session mode (default)** -- Data is encrypted with AES-256-GCM using a
 *    random CryptoKey generated once per tab and held only in memory (the key
 *    is non-extractable). Data encrypted this way becomes unrecoverable once
 *    the tab or page is closed, providing forward secrecy for transient sessions.
 *
 * LIMITATIONS / KNOWN RISKS
 * -------------------------
 * - **XSS**: If an attacker achieves script execution in the page context they
 *   can call `decryptFromStorage()` while the session key or password context
 *   is live, thereby recovering plaintext secrets. Encryption-at-rest mitigates
 *   passive inspection of localStorage (e.g. browser extensions, shared
 *   machines) but is NOT a defence against active XSS.
 *
 * - **Session key lifetime**: The in-memory session key lives for the duration
 *   of the tab. Users should be encouraged to close the tab / disconnect when
 *   they are finished to minimise the window of exposure.
 *
 * - All callers storing key material MUST use `encryptForStorage()` /
 *   `decryptFromStorage()` rather than writing to localStorage directly.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_SIZE = 16;
const IV_SIZE = 12;

interface EncryptedData {
    salt: string;      // Base64 encoded
    iv: string;        // Base64 encoded
    ciphertext: string; // Base64 encoded
}

/**
 * Derives an AES-GCM key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a string with AES-GCM using a password
 */
export async function encryptWithPassword(plaintext: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
    const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

    const key = await deriveKey(password, salt);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        encoder.encode(plaintext)
    );

    const data: EncryptedData = {
        salt: uint8ArrayToBase64(salt),
        iv: uint8ArrayToBase64(iv),
        ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    };

    return JSON.stringify(data);
}

/**
 * Decrypts a string encrypted with encryptWithPassword
 * Returns null if decryption fails (wrong password)
 */
export async function decryptWithPassword(encrypted: string, password: string): Promise<string | null> {
    try {
        const data: EncryptedData = JSON.parse(encrypted);
        const salt = base64ToUint8Array(data.salt);
        const iv = base64ToUint8Array(data.iv);
        const ciphertext = base64ToUint8Array(data.ciphertext);

        const key = await deriveKey(password, salt);

        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            key,
            ciphertext.buffer as ArrayBuffer
        );

        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    } catch {
        return null;
    }
}

/**
 * Checks if a string looks like encrypted data
 */
export function isEncryptedData(data: string): boolean {
    try {
        const parsed = JSON.parse(data);
        return parsed.salt && parsed.iv && parsed.ciphertext;
    } catch {
        return false;
    }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// ============================================================
// Session Encryption - Random key stored only in memory
// ============================================================

interface SessionEncryptedData {
    iv: string;        // Base64 encoded
    ciphertext: string; // Base64 encoded
}

/** In-memory session key - never persisted, dies with tab */
let sessionKey: CryptoKey | null = null;

/**
 * Generates a random AES-256 key for session encryption.
 * Key exists only in memory and is lost when the tab closes.
 */
async function getOrCreateSessionKey(): Promise<CryptoKey> {
    if (!sessionKey) {
        sessionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // not extractable
            ['encrypt', 'decrypt']
        );
    }
    return sessionKey;
}

/**
 * Encrypts data using the in-memory session key.
 * Fast (no PBKDF2), protects sessionStorage from inspection.
 */
export async function encryptForSession(plaintext: string): Promise<string> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
    const key = await getOrCreateSessionKey();

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        encoder.encode(plaintext)
    );

    const data: SessionEncryptedData = {
        iv: uint8ArrayToBase64(iv),
        ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    };

    return JSON.stringify(data);
}

/**
 * Decrypts data encrypted with encryptForSession.
 * Returns null if decryption fails (key was regenerated after tab close).
 */
export async function decryptFromSession(encrypted: string): Promise<string | null> {
    try {
        const data: SessionEncryptedData = JSON.parse(encrypted);
        const iv = base64ToUint8Array(data.iv);
        const ciphertext = base64ToUint8Array(data.ciphertext);
        const key = await getOrCreateSessionKey();

        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            key,
            ciphertext.buffer as ArrayBuffer
        );

        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    } catch {
        return null;
    }
}

/**
 * Checks if a string looks like session-encrypted data
 */
export function isSessionEncryptedData(data: string): boolean {
    try {
        const parsed = JSON.parse(data);
        return parsed.iv && parsed.ciphertext && !parsed.salt;
    } catch {
        return false;
    }
}

// ============================================================
// Password Context - For encrypting contacts in "Remember me" mode
// ============================================================

/** Cached password for "Remember me" mode - never persisted */
let cachedPassword: string | null = null;

/**
 * Sets the password context for contact encryption.
 * Called when user connects with "Remember me" or unlocks.
 */
export function setPasswordContext(password: string): void {
    cachedPassword = password;
}

/**
 * Clears the password context.
 * Called on disconnect.
 */
export function clearPasswordContext(): void {
    cachedPassword = null;
}

/**
 * Checks if we're in "Remember me" mode (have a password).
 */
export function hasPasswordContext(): boolean {
    return cachedPassword !== null;
}

/**
 * Encrypts data for storage using the appropriate method:
 * - If password context is set (Remember me): uses password encryption
 * - Otherwise: uses session key encryption
 */
export async function encryptForStorage(plaintext: string): Promise<string> {
    if (cachedPassword) {
        return encryptWithPassword(plaintext, cachedPassword);
    }
    return encryptForSession(plaintext);
}

/**
 * Decrypts data from storage.
 * Tries password decryption first (if context set), then session decryption.
 * Returns null if decryption fails.
 */
export async function decryptFromStorage(encrypted: string): Promise<string | null> {
    // Check if it's password-encrypted data (has salt)
    if (isEncryptedData(encrypted) && cachedPassword) {
        return decryptWithPassword(encrypted, cachedPassword);
    }
    // Check if it's session-encrypted data
    if (isSessionEncryptedData(encrypted)) {
        return decryptFromSession(encrypted);
    }
    return null;
}
