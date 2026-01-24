import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WalletService } from '../../core/services/wallet.service';

@Component({
    selector: 'app-login',
    imports: [FormsModule, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="login-container">
            <div class="login-box">
                <section class="nes-container is-dark is-rounded">
                    <h1 class="text-center mb-2">
                        <i class="nes-icon coin is-large"></i>
                    </h1>
                    <h2 class="text-center mb-2 text-success">AlgoChat</h2>
                    <p class="text-center text-sm text-muted mb-2">
                        Encrypted messaging on Algorand
                    </p>

                    @if (error()) {
                        <div class="nes-container is-rounded is-error mb-2">
                            <p class="text-xs">{{ error() }}</p>
                        </div>
                    }

                    <div class="nes-field">
                        <label for="mnemonic">25-Word Mnemonic</label>
                        <textarea
                            id="mnemonic"
                            class="nes-textarea is-dark"
                            rows="4"
                            [(ngModel)]="mnemonic"
                            placeholder="Enter your Algorand mnemonic..."
                        ></textarea>
                    </div>

                    <label class="mb-1">
                        <input
                            type="checkbox"
                            class="nes-checkbox is-dark"
                            [checked]="rememberMe()"
                            (change)="rememberMe.set($any($event.target).checked)"
                        />
                        <span class="text-xs">Remember me</span>
                    </label>

                    <button
                        class="nes-btn is-primary w-full"
                        [class.is-disabled]="!mnemonic().trim()"
                        [disabled]="!mnemonic().trim()"
                        (click)="connect()"
                    >
                        Connect
                    </button>

                    <div class="text-center mt-2">
                        <button class="nes-btn" (click)="generateNew()">
                            Generate New Account
                        </button>
                    </div>

                    @if (generatedMnemonic()) {
                        <div class="nes-container is-dark is-rounded mt-2">
                            <p class="text-xs text-warning">New Account Generated:</p>
                            <p class="text-xs mb-1 word-break">
                                {{ generatedAddress() }}
                            </p>
                            <p class="text-xs text-success word-break">
                                {{ generatedMnemonic() }}
                            </p>
                            <p class="text-xs text-muted mt-2">
                                Save this mnemonic! Fund with TestNet ALGO from dispenser.
                            </p>
                        </div>
                    }
                </section>

                <p class="text-center text-xs text-muted mt-2">
                    <i class="nes-icon is-small heart"></i>
                    End-to-end encrypted with X25519 + ChaCha20
                </p>
                <p class="text-center text-xs text-muted mt-1">
                    <a routerLink="/terms" class="legal-link">Terms</a>
                    <span class="legal-separator">|</span>
                    <a routerLink="/privacy" class="legal-link">Privacy</a>
                </p>
            </div>
        </div>
    `,
})
export class LoginComponent {
    private readonly wallet = inject(WalletService);
    private readonly router = inject(Router);

    protected readonly mnemonic = signal('');
    protected readonly rememberMe = signal(false);
    protected readonly error = signal<string | null>(null);
    protected readonly generatedMnemonic = signal<string | null>(null);
    protected readonly generatedAddress = signal<string | null>(null);

    protected connect(): void {
        this.error.set(null);

        const words = this.mnemonic().trim();
        if (!words) return;

        if (!this.wallet.validateMnemonic(words)) {
            this.error.set('Invalid mnemonic. Please enter 25 words.');
            return;
        }

        const success = this.wallet.connect(words, this.rememberMe());
        if (success) {
            this.router.navigate(['/chat']);
        } else {
            this.error.set('Failed to connect. Please check your mnemonic.');
        }
    }

    protected generateNew(): void {
        const { mnemonic, address } = this.wallet.generateAccount();
        this.generatedMnemonic.set(mnemonic);
        this.generatedAddress.set(address);
        this.mnemonic.set(mnemonic);
    }
}
