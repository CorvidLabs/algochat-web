import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit } from '@angular/core';
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
                <!-- Unlock Screen (when encrypted session exists) -->
                @if (showUnlockScreen()) {
                    <section class="nes-container is-dark is-rounded">
                        <h1 class="text-center mb-2">
                            <i class="nes-icon coin is-large"></i>
                        </h1>
                        <h2 class="text-center mb-2 text-success">AlgoChat</h2>
                        <p class="text-center text-sm text-muted mb-2">
                            Welcome back! Enter your password to unlock.
                        </p>

                        @if (unlockError()) {
                            <div class="nes-container is-rounded is-error mb-2">
                                <p class="text-xs">{{ unlockError() }}</p>
                            </div>
                        }

                        <div class="nes-field">
                            <label for="unlock-password">Password</label>
                            <input
                                id="unlock-password"
                                type="password"
                                class="nes-input is-dark"
                                [(ngModel)]="unlockPassword"
                                placeholder="Enter your password..."
                                (keydown.enter)="unlock()"
                            />
                        </div>

                        <button
                            class="nes-btn is-primary w-full"
                            [class.is-disabled]="!unlockPassword().trim() || unlocking()"
                            [disabled]="!unlockPassword().trim() || unlocking()"
                            (click)="unlock()"
                        >
                            @if (unlocking()) {
                                <span class="loading-dots">Unlocking...</span>
                            } @else {
                                Unlock
                            }
                        </button>

                        <div class="text-center mt-2">
                            <button class="nes-btn" (click)="forgetDevice()">
                                Use Different Account
                            </button>
                        </div>
                    </section>
                } @else {
                    <!-- Normal Login Screen -->
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
                            <span class="text-xs">Remember me on this device</span>
                        </label>

                        @if (!rememberMe()) {
                            <p class="text-xs text-muted mb-1">
                                Your key is encrypted in memory for this tab only.
                            </p>
                        }

                        @if (rememberMe()) {
                            <div class="nes-field mt-1">
                                <label for="password">Encryption Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    class="nes-input is-dark"
                                    [(ngModel)]="password"
                                    placeholder="Create a password to protect your key..."
                                />
                            </div>
                            <div class="nes-field mt-1">
                                <label for="confirm-password">Confirm Password</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    class="nes-input is-dark"
                                    [(ngModel)]="confirmPassword"
                                    placeholder="Confirm your password..."
                                />
                                @if (password().length >= 6 && confirmPassword().length > 0 && password() !== confirmPassword()) {
                                    <p class="text-xs text-error mt-1">Passwords do not match</p>
                                }
                            </div>
                            <p class="text-xs text-muted mt-1">
                                Min 6 characters. Your mnemonic will be encrypted with AES-256.
                            </p>
                        }

                        <button
                            class="nes-btn is-primary w-full"
                            [class.is-disabled]="!canConnect() || connecting()"
                            [disabled]="!canConnect() || connecting()"
                            (click)="connect()"
                        >
                            @if (connecting()) {
                                <span class="loading-dots">Connecting...</span>
                            } @else {
                                Connect
                            }
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
                                    Save this mnemonic! Fund with ALGO to start chatting.
                                </p>
                            </div>
                        }
                    </section>
                }

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
export class LoginComponent implements OnInit {
    private readonly wallet = inject(WalletService);
    private readonly router = inject(Router);

    // Login form
    protected readonly mnemonic = signal('');
    protected readonly rememberMe = signal(false);
    protected readonly password = signal('');
    protected readonly confirmPassword = signal('');
    protected readonly error = signal<string | null>(null);
    protected readonly connecting = signal(false);
    protected readonly generatedMnemonic = signal<string | null>(null);
    protected readonly generatedAddress = signal<string | null>(null);

    // Unlock form
    protected readonly showUnlockScreen = signal(false);
    protected readonly unlockPassword = signal('');
    protected readonly unlockError = signal<string | null>(null);
    protected readonly unlocking = signal(false);

    // Rate limiting for unlock attempts
    private unlockAttempts = 0;
    private lockoutUntil = 0;

    protected readonly canConnect = computed(() => {
        const hasMnemonic = this.mnemonic().trim().length > 0;
        const needsPassword = this.rememberMe();
        const hasPassword = this.password().trim().length >= 6;
        const passwordsMatch = this.password() === this.confirmPassword();
        return hasMnemonic && (!needsPassword || (hasPassword && passwordsMatch));
    });

    ngOnInit(): void {
        // Check if there's an encrypted session to unlock
        if (this.wallet.hasStoredSession()) {
            this.showUnlockScreen.set(true);
        }
    }

    protected async connect(): Promise<void> {
        this.error.set(null);
        this.connecting.set(true);

        const words = this.mnemonic().trim();
        if (!words) {
            this.connecting.set(false);
            return;
        }

        if (!this.wallet.validateMnemonic(words)) {
            this.error.set('Invalid mnemonic. Please enter 25 words.');
            this.connecting.set(false);
            return;
        }

        const remember = this.rememberMe();
        const pwd = remember ? this.password().trim() : undefined;

        if (remember && (!pwd || pwd.length < 6)) {
            this.error.set('Password must be at least 6 characters.');
            this.connecting.set(false);
            return;
        }

        const success = await this.wallet.connect(words, remember, pwd);
        this.connecting.set(false);

        if (success) {
            this.router.navigate(['/chat']);
        } else {
            this.error.set('Failed to connect. Please check your mnemonic.');
        }
    }

    protected async unlock(): Promise<void> {
        this.unlockError.set(null);

        // Check if locked out
        const now = Date.now();
        if (now < this.lockoutUntil) {
            const secondsLeft = Math.ceil((this.lockoutUntil - now) / 1000);
            this.unlockError.set(`Too many attempts. Try again in ${secondsLeft}s.`);
            return;
        }

        this.unlocking.set(true);

        const pwd = this.unlockPassword().trim();
        if (!pwd) {
            this.unlocking.set(false);
            return;
        }

        const success = await this.wallet.unlockWithPassword(pwd);
        this.unlocking.set(false);

        if (success) {
            this.unlockAttempts = 0;
            this.router.navigate(['/chat']);
        } else {
            this.unlockAttempts++;
            // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
            const delay = Math.min(Math.pow(2, this.unlockAttempts) * 1000, 30000);
            this.lockoutUntil = Date.now() + delay;
            this.unlockError.set('Incorrect password. Please try again.');
        }
    }

    protected forgetDevice(): void {
        this.wallet.clearStoredSession();
        this.showUnlockScreen.set(false);
        this.unlockPassword.set('');
        this.unlockError.set(null);
    }

    protected generateNew(): void {
        const { mnemonic, address } = this.wallet.generateAccount();
        this.generatedMnemonic.set(mnemonic);
        this.generatedAddress.set(address);
        this.mnemonic.set(mnemonic);
    }
}
