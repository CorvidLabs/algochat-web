/**
 * PSK Protocol v1.1 - Key Exchange URI
 *
 * Generates and parses PSK exchange URIs for out-of-band key sharing.
 * Format: algochat-psk://v1?addr=<address>&psk=<base64url>&label=<label>
 */

export class PSKExchangeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKExchangeError';
    }
}

/** Parsed PSK exchange URI */
export interface PSKExchangeURI {
    address: string;
    psk: Uint8Array;
    label: string;
}

/**
 * Creates a PSK exchange URI.
 *
 * @param address - Algorand address of the PSK owner
 * @param psk - 32-byte pre-shared key
 * @param label - Human-readable label for the contact
 */
export function createPSKExchangeURI(
    address: string,
    psk: Uint8Array,
    label: string
): string {
    if (psk.length !== 32) {
        throw new PSKExchangeError(`PSK must be 32 bytes, got ${psk.length}`);
    }

    const pskBase64url = uint8ArrayToBase64url(psk);
    const encodedLabel = encodeURIComponent(label);

    return `algochat-psk://v1?addr=${address}&psk=${pskBase64url}&label=${encodedLabel}`;
}

/**
 * Parses a PSK exchange URI.
 *
 * @param uri - The PSK exchange URI string
 * @returns Parsed exchange data
 */
export function parsePSKExchangeURI(uri: string): PSKExchangeURI {
    if (!uri.startsWith('algochat-psk://v1?')) {
        throw new PSKExchangeError(`Invalid PSK URI scheme: ${uri.split('?')[0]}`);
    }

    const queryString = uri.slice('algochat-psk://v1?'.length);
    const params = new URLSearchParams(queryString);

    const address = params.get('addr');
    if (!address) {
        throw new PSKExchangeError('Missing addr parameter');
    }

    const pskBase64url = params.get('psk');
    if (!pskBase64url) {
        throw new PSKExchangeError('Missing psk parameter');
    }

    const psk = base64urlToUint8Array(pskBase64url);
    if (psk.length !== 32) {
        throw new PSKExchangeError(`PSK must be 32 bytes, got ${psk.length}`);
    }

    const label = params.get('label') ?? '';

    return {
        address,
        psk,
        label: decodeURIComponent(label),
    };
}

/**
 * Generates a random 32-byte PSK.
 */
export function generatePSK(): Uint8Array {
    const psk = new Uint8Array(32);
    crypto.getRandomValues(psk);
    return psk;
}

// --- Base64url helpers ---

function uint8ArrayToBase64url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64urlToUint8Array(base64url: string): Uint8Array {
    // Convert base64url to standard base64
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding
    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
