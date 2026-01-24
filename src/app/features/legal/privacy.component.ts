import { Component, ChangeDetectionStrategy, ElementRef, inject, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WalletService } from '../../core/services/wallet.service';

@Component({
    selector: 'app-privacy',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="legal-container">
            <div class="legal-box">
                <section class="nes-container is-dark is-rounded">
                    <h1 class="text-warning mb-2">Privacy Policy</h1>
                    <p class="text-xs text-muted mb-2">Last updated: January 2026</p>

                    <div class="legal-content">
                        <h3 class="text-success">1. Overview</h3>
                        <p>
                            AlgoChat is designed with privacy as a core principle. We collect minimal data
                            and your messages are end-to-end encrypted.
                        </p>

                        <h3 class="text-success">2. Data We Do NOT Collect</h3>
                        <ul>
                            <li>We do not collect your name, email, or personal information</li>
                            <li>We do not store your mnemonic or private keys on our servers</li>
                            <li>We do not have access to the content of your encrypted messages</li>
                            <li>We do not track your IP address or location</li>
                            <li>We do not use analytics or tracking cookies</li>
                        </ul>

                        <h3 class="text-success">3. Data Stored Locally</h3>
                        <p>If you enable "Remember me", your mnemonic is encrypted with AES-256-GCM
                           using a password you provide (minimum 8 characters). The encryption key
                           is derived using PBKDF2 with 100,000 iterations. This encrypted data is
                           stored in your browser's localStorage and never leaves your device.</p>
                        <ul>
                            <li>Encrypted mnemonic (localStorage, AES-256-GCM encrypted)</li>
                            <li>Contact nicknames and settings (localStorage, unencrypted)</li>
                            <li>Selected conversation preference (localStorage, unencrypted)</li>
                        </ul>
                        <p>Without "Remember me", your mnemonic is encrypted with a random key
                           that exists only in memory. When you close the tab, the key is lost
                           and the encrypted data becomes unreadable.</p>

                        <h3 class="text-success">4. Blockchain Data</h3>
                        <p>
                            Messages sent through AlgoChat are recorded on the Algorand blockchain.
                            While message content is encrypted, the following is publicly visible:
                        </p>
                        <ul>
                            <li>Your wallet address (sender)</li>
                            <li>Recipient wallet address</li>
                            <li>Transaction timestamp</li>
                            <li>Transaction amount</li>
                            <li>Encrypted message data (unreadable without keys)</li>
                        </ul>

                        <h3 class="text-success">5. Third-Party Services</h3>
                        <p>The Service connects to:</p>
                        <ul>
                            <li><strong>Algorand nodes</strong> (AlgoNode) - to submit and query transactions</li>
                        </ul>
                        <p>These services have their own privacy policies.</p>

                        <h3 class="text-success">6. Encryption</h3>
                        <p>
                            All messages are encrypted using X25519 key exchange and ChaCha20-Poly1305
                            authenticated encryption. Only you and your recipient can read message content.
                        </p>

                        <h3 class="text-success">7. Data Retention</h3>
                        <p>
                            We do not retain any user data. Blockchain data is permanent and immutable.
                            Local browser data can be cleared by you at any time.
                        </p>

                        <h3 class="text-success">8. Your Rights</h3>
                        <p>
                            Since we don't collect personal data, there is nothing to request, modify,
                            or delete from our systems. You control your local data and blockchain
                            interactions.
                        </p>

                        <h3 class="text-success">9. Children's Privacy</h3>
                        <p>
                            The Service is not intended for users under 18. We do not knowingly provide
                            services to minors.
                        </p>

                        <h3 class="text-success">10. Changes to Policy</h3>
                        <p>
                            We may update this policy. Changes will be posted on this page with an
                            updated date.
                        </p>

                        <h3 class="text-success">11. Contact</h3>
                        <p>
                            For privacy questions, contact us at
                            <a href="https://github.com/CorvidLabs" class="text-primary">github.com/CorvidLabs</a>
                        </p>
                    </div>

                    <div class="text-center mt-2">
                        @if (wallet.connected()) {
                            <a routerLink="/chat" class="nes-btn is-primary">Back to Chat</a>
                        } @else {
                            <a routerLink="/login" class="nes-btn is-primary">Back to Login</a>
                        }
                    </div>
                </section>
            </div>
        </div>
    `,
    styles: [`
        .legal-container {
            min-height: 100vh;
            padding: 2rem;
            background: var(--theme-primary-bg);
        }
        .legal-box {
            max-width: 800px;
            margin: 0 auto;
        }
        .legal-content {
            max-height: 60vh;
            overflow-y: auto;
            padding-right: 0.5rem;
        }
        .legal-content h3 {
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            font-size: 14px;
        }
        .legal-content p, .legal-content ul {
            font-size: 12px;
            line-height: 1.8;
            margin-bottom: 1rem;
        }
        .legal-content ul {
            padding-left: 1.5rem;
        }
        .legal-content li {
            margin-bottom: 0.5rem;
        }
        .legal-content a {
            text-decoration: underline;
        }
    `],
})
export class PrivacyComponent implements AfterViewInit {
    protected readonly wallet = inject(WalletService);
    private readonly elementRef = inject(ElementRef);

    ngAfterViewInit(): void {
        const content = this.elementRef.nativeElement.querySelector('.legal-content');
        if (content) {
            content.scrollTop = 0;
        }
    }
}
