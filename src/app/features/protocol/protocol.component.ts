import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-protocol',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="legal-container">
            <div class="legal-box">
                <section class="nes-container is-dark is-rounded">
                    <h1 class="text-warning mb-2">AlgoChat Protocol</h1>
                    <p class="text-xs text-muted mb-2">Encrypted annotations for Algorand transactions</p>

                    <div class="legal-content">
                        <h3 class="text-success">Overview</h3>
                        <p>
                            AlgoChat attaches end-to-end encrypted messages to Algorand payment transactions.
                            Messages are stored in the transaction <code>note</code> field (max 1024 bytes)
                            and are permanently recorded on-chain.
                        </p>

                        <h3 class="text-success">Cryptographic Primitives</h3>
                        <div class="protocol-table">
                            <div class="protocol-row">
                                <span class="protocol-label">Key Agreement</span>
                                <span class="protocol-value">X25519 ECDH (RFC 7748)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Encryption</span>
                                <span class="protocol-value">ChaCha20-Poly1305 (RFC 8439)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Key Derivation</span>
                                <span class="protocol-value">HKDF-SHA256 (RFC 5869)</span>
                            </div>
                        </div>
                        <p class="text-xs text-muted">Same primitives used by Signal, WireGuard, and TLS 1.3.</p>


                        <h3 class="text-primary">v1 Standard (Protocol ID: 0x01)</h3>
                        <p>
                            The base protocol uses ephemeral X25519 ECDH key exchange per message.
                            Each message generates a fresh ephemeral key pair, providing forward secrecy.
                        </p>

                        <h4 class="text-warning">Wire Format</h4>
                        <div class="wire-format">
                            <code>[version: 1][protocol: 1][sender_pubkey: 32][ephemeral_pubkey: 32][nonce: 12][encrypted_sender_key: 48][ciphertext: variable]</code>
                        </div>

                        <div class="protocol-table">
                            <div class="protocol-row">
                                <span class="protocol-label">Header size</span>
                                <span class="protocol-value">126 bytes (fixed)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Max plaintext</span>
                                <span class="protocol-value">882 bytes</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Total envelope</span>
                                <span class="protocol-value">1024 bytes (Algorand note limit)</span>
                            </div>
                        </div>


                        <h3 class="text-success">v1.1 PSK (Protocol ID: 0x02)</h3>
                        <p>
                            Adds a pre-shared key (PSK) layer on top of ECDH, creating hybrid encryption.
                            The PSK is exchanged out-of-band via QR code. A two-level ratchet derives
                            unique keys per message from the initial PSK.
                        </p>

                        <h4 class="text-warning">Wire Format</h4>
                        <div class="wire-format">
                            <code>[version: 1][protocol: 2][ratchet_counter: 4][sender_pubkey: 32][ephemeral_pubkey: 32][nonce: 12][encrypted_sender_key: 48][ciphertext: variable]</code>
                        </div>

                        <div class="protocol-table">
                            <div class="protocol-row">
                                <span class="protocol-label">Header size</span>
                                <span class="protocol-value">130 bytes (126 + 4-byte counter)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Max plaintext</span>
                                <span class="protocol-value">878 bytes</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Session size</span>
                                <span class="protocol-value">100 messages per ratchet session</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Counter window</span>
                                <span class="protocol-value">200 messages (replay protection)</span>
                            </div>
                        </div>

                        <h4 class="text-warning">Key Ratcheting</h4>
                        <p>
                            The PSK is never used directly. Instead, a two-level derivation produces unique keys:
                        </p>
                        <div class="wire-format">
                            <code>initialPSK -> sessionPSK (per 100 msgs) -> positionPSK (per msg)</code>
                        </div>
                        <p>
                            This provides session-level forward secrecy: compromising a session key
                            does not reveal messages from other sessions.
                        </p>


                        <h3 class="text-success">Security Properties</h3>
                        <div class="protocol-table">
                            <div class="protocol-row">
                                <span class="protocol-label">Confidentiality</span>
                                <span class="protocol-value text-success">Protected (E2EE)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Integrity</span>
                                <span class="protocol-value text-success">Protected (AEAD)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Forward secrecy</span>
                                <span class="protocol-value text-success">Protected (ephemeral keys)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Replay protection</span>
                                <span class="protocol-value text-success">Protected (blockchain + PSK counter)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Metadata privacy</span>
                                <span class="protocol-value text-error">Not protected (on-chain)</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Traffic analysis</span>
                                <span class="protocol-value text-error">Not protected</span>
                            </div>
                        </div>


                        <h3 class="text-success">Transport</h3>
                        <p>Messages are the <code>note</code> field of standard Algorand payment transactions:</p>
                        <div class="wire-format">
                            <code>sender  -> recipient<br/>amount  = 0 ALGO (or any amount)<br/>note    = &lt;encrypted envelope&gt;<br/>fee     = ~0.001 ALGO</code>
                        </div>


                        <h3 class="text-success">v1 vs v1.1 Comparison</h3>
                        <div class="protocol-table">
                            <div class="protocol-row header">
                                <span class="protocol-label"></span>
                                <span class="protocol-value">v1 Standard</span>
                                <span class="protocol-value">v1.1 PSK</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Protocol ID</span>
                                <span class="protocol-value">0x01</span>
                                <span class="protocol-value">0x02</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Key exchange</span>
                                <span class="protocol-value">ECDH only</span>
                                <span class="protocol-value">ECDH + PSK</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Setup</span>
                                <span class="protocol-value">Automatic</span>
                                <span class="protocol-value">QR code exchange</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Max message</span>
                                <span class="protocol-value">882 bytes</span>
                                <span class="protocol-value">878 bytes</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Header</span>
                                <span class="protocol-value">126 bytes</span>
                                <span class="protocol-value">130 bytes</span>
                            </div>
                            <div class="protocol-row">
                                <span class="protocol-label">Quantum defense</span>
                                <span class="protocol-value text-error">No</span>
                                <span class="protocol-value text-success">Defense-in-depth</span>
                            </div>
                        </div>


                        <h3 class="text-success">Specification</h3>
                        <p>
                            The full protocol specification is open source:
                            <a href="https://github.com/CorvidLabs/protocol-algochat" target="_blank" class="text-primary">github.com/CorvidLabs/protocol-algochat</a>
                        </p>
                    </div>

                    <div class="flex justify-center mt-2">
                        <a routerLink="/chat" class="nes-btn is-primary">Back to Chat</a>
                    </div>
                </section>
            </div>
        </div>
    `,
})
export class ProtocolComponent {}
