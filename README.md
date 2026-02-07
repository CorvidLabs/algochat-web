# algochat-web

[![Deploy](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat-web/CD.yml?label=Deploy&branch=main)](https://github.com/CorvidLabs/algochat-web/actions/workflows/CD.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat-web)](https://github.com/CorvidLabs/algochat-web/blob/main/LICENSE)

End-to-end encrypted messaging on Algorand. Built with Angular and NES.css.

**Live App**: [corvidlabs.github.io/algochat-web](https://corvidlabs.github.io/algochat-web/)

## Features

- **Client-Side Only** - No backend servers, runs entirely in browser
- **End-to-End Encryption** - X25519 + ChaCha20-Poly1305
- **Forward Secrecy** - Per-message ephemeral keys
- **PSK v1.1 Protocol** - Pre-shared key messaging with counter-based ratcheting
- **Mobile Responsive** - Works on desktop, tablet, and mobile
- **Retro UI** - NES.css 8-bit styling

## Tech Stack

- **Framework**: Angular 21 (standalone components, signals)
- **Styling**: NES.css + SCSS
- **Crypto**: @noble/curves, @noble/ciphers, @noble/hashes
- **Blockchain**: algosdk v3
- **Runtime**: Bun

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run start

# Build for production
bun run build

# Build for GitHub Pages
bun run build:gh-pages
```

## Architecture

```
src/app/
├── core/
│   ├── psk/               # PSK v1.1 protocol implementation
│   │   ├── psk-types.ts   # Constants and interfaces
│   │   ├── psk-ratchet.ts # Two-level HKDF ratchet
│   │   ├── psk-envelope.ts # Wire format (130-byte header)
│   │   ├── psk-encryption.ts # Hybrid ECDH+PSK encrypt/decrypt
│   │   ├── psk-state.ts   # Counter management with window
│   │   ├── psk-exchange.ts # Exchange URI generation/parsing
│   │   ├── psk.service.ts # Angular service wrapper
│   │   └── index.ts       # Barrel export
│   ├── services/
│   │   ├── wallet.service.ts  # Account management
│   │   └── chat.service.ts    # Blockchain operations
│   └── utils/
│       └── storage-crypto.ts  # AES-GCM encrypted storage
├── features/
│   ├── login/           # Mnemonic login page
│   └── chat/            # Main chat interface
└── app.routes.ts        # Route configuration
```

## Protocol

Implements the [AlgoChat Protocol v1](https://github.com/CorvidLabs/protocol-algochat) and PSK v1.1 extension.

### Cryptographic Primitives

| Function | Algorithm |
|----------|-----------|
| Key Agreement | X25519 ECDH |
| Encryption | ChaCha20-Poly1305 |
| Key Derivation | HKDF-SHA256 |

### PSK v1.1 Protocol

Pre-shared key messaging adds counter-based ratcheting and hybrid ECDH+PSK encryption:

- **Two-level ratchet**: session = counter / 100, position = counter % 100
- **Hybrid encryption**: ECDH shared secret combined with ratcheted PSK via HKDF
- **Replay protection**: Sliding counter window of +/- 200
- **Wire format**: 130-byte header (version + protocol + 4-byte counter + keys + nonce + encrypted sender key)
- **Key exchange**: `algochat-psk://v1?addr=...&psk=<base64url>&label=...` URI scheme

## Security Notes

- Private keys never leave the browser
- Mnemonic stored in memory only (cleared on disconnect)
- All cryptographic operations use audited @noble libraries
- Messages encrypted client-side before blockchain submission
- PSK sessions provide additional authentication layer beyond ECDH

## Related Projects

- [protocol-algochat](https://github.com/CorvidLabs/protocol-algochat) - Protocol specification
- [ts-algochat](https://github.com/CorvidLabs/ts-algochat) - TypeScript implementation
- [swift-algochat](https://github.com/CorvidLabs/swift-algochat) - Swift implementation

## License

MIT License - See [LICENSE](LICENSE) for details.
