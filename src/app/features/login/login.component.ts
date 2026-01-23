import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WalletService } from '../../core/services/wallet.service';

@Component({
    selector: 'app-login',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="login-container">
            <div class="login-box">
                <section class="nes-container is-dark is-rounded">
                    <h1 class="text-center mb-2">
                        <i class="nes-icon coin is-large"></i>
                    </h1>
                    <h2 class="text-center mb-2" style="color: #92cc41;">AlgoChat</h2>
                    <p class="text-center text-sm text-muted mb-2">
                        Encrypted messaging on Algorand
                    </p>

                    @if (error()) {
                        <div class="nes-container is-rounded" style="background: #e76e55; margin-bottom: 1rem;">
                            <p class="text-xs">{{ error() }}</p>
                        </div>
                    }

                    <div class="nes-field">
                        <label for="mnemonic" style="color: #f7d51d;">25-Word Mnemonic</label>
                        <textarea
                            id="mnemonic"
                            class="nes-textarea is-dark"
                            rows="4"
                            [(ngModel)]="mnemonic"
                            placeholder="Enter your Algorand mnemonic..."
                        ></textarea>
                    </div>

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
                            <p class="text-xs" style="color: #f7d51d;">New Account Generated:</p>
                            <p class="text-xs mb-1" style="word-break: break-all;">
                                {{ generatedAddress() }}
                            </p>
                            <p class="text-xs" style="color: #92cc41; word-break: break-all;">
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
            </div>
        </div>
    `,
})
export class LoginComponent {
    private readonly wallet = inject(WalletService);
    private readonly router = inject(Router);

    protected readonly mnemonic = signal('');
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

        const success = this.wallet.connect(words);
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
