# algochat-web

[![Deploy](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat-web/deploy.yml?label=Deploy&branch=main)](https://github.com/CorvidLabs/algochat-web/actions/workflows/deploy.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat-web)](https://github.com/CorvidLabs/algochat-web/blob/main/LICENSE)

End-to-end encrypted messaging on Algorand. Built with Angular and NES.css.

**Live App**: [corvidlabs.github.io/algochat-web](https://corvidlabs.github.io/algochat-web/)

## Features

- **Client-Side Only** - No backend servers, runs entirely in browser
- **End-to-End Encryption** - X25519 + ChaCha20-Poly1305
- **Forward Secrecy** - Per-message ephemeral keys
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
│   ├── crypto/          # Encryption implementation
│   │   ├── keys.ts      # X25519 key derivation
│   │   ├── encryption.ts # Message encrypt/decrypt
│   │   └── envelope.ts  # Wire format encoding
│   ├── services/
│   │   ├── wallet.service.ts  # Account management
│   │   └── chat.service.ts    # Blockchain operations
│   └── types.ts         # TypeScript interfaces
├── features/
│   ├── login/           # Mnemonic login page
│   └── chat/            # Main chat interface
└── app.routes.ts        # Route configuration
```

## Protocol

Implements the [AlgoChat Protocol v1](https://github.com/CorvidLabs/protocol-algochat).

### Cryptographic Primitives

| Function | Algorithm |
|----------|-----------|
| Key Agreement | X25519 ECDH |
| Encryption | ChaCha20-Poly1305 |
| Key Derivation | HKDF-SHA256 |

## Security Notes

- Private keys never leave the browser
- Mnemonic stored in memory only (cleared on disconnect)
- All cryptographic operations use audited @noble libraries
- Messages encrypted client-side before blockchain submission

## Related Projects

- [protocol-algochat](https://github.com/CorvidLabs/protocol-algochat) - Protocol specification
- [ts-algochat](https://github.com/CorvidLabs/ts-algochat) - TypeScript implementation
- [swift-algochat](https://github.com/CorvidLabs/swift-algochat) - Swift implementation

## License

MIT License - See [LICENSE](LICENSE) for details.
