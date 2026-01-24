/**
 * Storage Crypto - AES-GCM encryption for localStorage
 *
 * Uses Web Crypto API with PBKDF2 key derivation for secure storage.
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
