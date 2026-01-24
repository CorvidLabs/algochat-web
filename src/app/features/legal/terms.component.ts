import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-terms',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="legal-container">
            <div class="legal-box">
                <section class="nes-container is-dark is-rounded">
                    <h1 class="text-warning mb-2">Terms of Service</h1>
                    <p class="text-xs text-muted mb-2">Last updated: January 2026</p>

                    <div class="legal-content">
                        <h3 class="text-success">1. Acceptance of Terms</h3>
                        <p>
                            By accessing or using AlgoChat ("the Service"), you agree to be bound by these
                            Terms of Service. If you do not agree, do not use the Service.
                        </p>

                        <h3 class="text-success">2. Description of Service</h3>
                        <p>
                            AlgoChat is a web-based interface for sending encrypted messages on the Algorand
                            blockchain. The Service is provided as a convenience layer over open-source
                            technology. The underlying protocol is open-source and can be used independently.
                        </p>

                        <h3 class="text-success">3. User Responsibilities</h3>
                        <ul>
                            <li>You are solely responsible for securing your wallet mnemonic/private keys</li>
                            <li>You are responsible for all activity conducted through your wallet</li>
                            <li>You must comply with all applicable laws in your jurisdiction</li>
                            <li>You must not use the Service for illegal purposes, harassment, or spam</li>
                        </ul>

                        <h3 class="text-success">4. No Warranty</h3>
                        <p>
                            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DO NOT GUARANTEE
                            UPTIME, RELIABILITY, OR SECURITY. USE AT YOUR OWN RISK.
                        </p>

                        <h3 class="text-success">5. Limitation of Liability</h3>
                        <p>
                            CorvidLabs shall not be liable for any damages arising from use of the Service,
                            including but not limited to: loss of funds, loss of data, security breaches,
                            or interruption of service.
                        </p>

                        <h3 class="text-success">6. Blockchain Transactions</h3>
                        <p>
                            All messages sent through AlgoChat are recorded on the Algorand blockchain.
                            Blockchain transactions are irreversible. We cannot delete, modify, or reverse
                            any messages once sent.
                        </p>

                        <h3 class="text-success">7. Termination</h3>
                        <p>
                            We reserve the right to terminate or suspend access to the Service at any time,
                            for any reason, without notice. The open-source nature of the protocol means
                            you can always run your own instance.
                        </p>

                        <h3 class="text-success">8. Changes to Terms</h3>
                        <p>
                            We may modify these terms at any time. Continued use of the Service after
                            changes constitutes acceptance of the new terms.
                        </p>

                        <h3 class="text-success">9. Contact</h3>
                        <p>
                            For questions about these terms, contact us at
                            <a href="https://github.com/CorvidLabs" class="text-primary">github.com/CorvidLabs</a>
                        </p>
                    </div>

                    <div class="text-center mt-2">
                        <a routerLink="/login" class="nes-btn is-primary">Back to Login</a>
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
export class TermsComponent {}
