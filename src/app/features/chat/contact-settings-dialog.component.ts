import { Component, inject, input, output, signal, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactSettingsService, type ContactSettings } from '../../core/services/contact-settings.service';
import { PSKService } from '../../core/services/psk.service';
import { WalletService } from '../../core/services/wallet.service';
import QRCode from 'qrcode';

@Component({
    selector: 'app-contact-settings-dialog',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="nes-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="contact-settings-title" (click)="onOverlayClick($event)">
            <section class="nes-container is-dark is-rounded dialog-box contact-settings-dialog">
                <h3 id="contact-settings-title" class="mb-2 text-warning">{{ isSelfChat() ? 'Notes Settings' : 'Contact Settings' }}</h3>

                @if (!isSelfChat()) {
                    <!-- Nickname -->
                    <div class="nes-field mb-2">
                        <label for="nickname-input" class="text-success">Nickname</label>
                        <input
                            id="nickname-input"
                            type="text"
                            class="nes-input is-dark"
                            [(ngModel)]="nickname"
                            placeholder="Enter nickname..."
                            maxlength="20"
                            autocomplete="off"
                        />
                    </div>

                    <!-- Toggles -->
                    <div class="settings-toggles">
                        <label class="settings-toggle">
                            <input
                                type="checkbox"
                                class="nes-checkbox is-dark"
                                [checked]="currentSettings().isFavorite"
                                (change)="toggleFavorite()"
                            />
                            <span>Favorite</span>
                        </label>

                        <label class="settings-toggle">
                            <input
                                type="checkbox"
                                class="nes-checkbox is-dark"
                                [checked]="currentSettings().isMuted"
                                (change)="toggleMuted()"
                            />
                            <span>Muted</span>
                        </label>

                        <label class="settings-toggle text-error">
                            <input
                                type="checkbox"
                                class="nes-checkbox is-dark"
                                [checked]="currentSettings().isBlocked"
                                (change)="toggleBlocked()"
                            />
                            <span>Blocked</span>
                        </label>
                    </div>

                    @if (currentSettings().isBlocked) {
                        <div class="nes-container is-rounded is-warning mt-1 p-1">
                            <p class="text-xs">Blocked contacts are hidden from your list.</p>
                        </div>
                    }
                }

                <!-- Secure Channel (PSK) -->
                <div class="psk-section mt-2">
                    <h4 class="text-success mb-1 text-xs">Secure Channel</h4>

                    @if (hasPSK()) {
                        <div class="psk-status-active">
                            <span class="psk-badge">&#x1f6e1; Secured</span>
                            @if (isSelfChat()) {
                                <p class="text-xs text-muted mt-1">Your notes are double-encrypted automatically.</p>
                            } @else {
                                <p class="text-xs text-muted mt-1">Messages are double-encrypted with a shared secret key.</p>
                                <div class="flex gap-1 mt-1">
                                    <button class="nes-btn psk-action-btn" (click)="showPSKQR()">Show QR</button>
                                    <button class="nes-btn is-error psk-action-btn" (click)="removePSK()">Remove</button>
                                </div>
                            }
                        </div>
                    } @else {
                        <div class="protocol-info-box mb-1">
                            <p class="text-xs text-muted">All messages are encrypted. Set up a secure channel to add a second layer of encryption using a shared secret exchanged via QR code.</p>
                        </div>
                        <div class="flex gap-1">
                            <button class="nes-btn is-success psk-action-btn" (click)="generatePSK()">Set Up</button>
                            <button class="nes-btn psk-action-btn" (click)="showImportPSK.set(true)">Import</button>
                        </div>
                    }

                    @if (showImportPSK()) {
                        <div class="psk-import mt-1">
                            <div class="nes-field">
                                <label for="psk-uri-input" class="text-xs">Paste exchange URI</label>
                                <input
                                    id="psk-uri-input"
                                    type="text"
                                    class="nes-input is-dark"
                                    [(ngModel)]="importURI"
                                    placeholder="algochat-psk://v1?..."
                                    autocomplete="off"
                                />
                            </div>
                            @if (importError()) {
                                <p class="text-xs text-error mt-1">{{ importError() }}</p>
                            }
                            <div class="flex gap-1 mt-1">
                                <button
                                    class="nes-btn is-primary psk-action-btn"
                                    [disabled]="!importURI.trim()"
                                    (click)="importPSK()"
                                >Import</button>
                                <button class="nes-btn psk-action-btn" (click)="showImportPSK.set(false); importURI = ''; importError.set(null)">Cancel</button>
                            </div>
                        </div>
                    }

                    @if (pskQRDataUrl()) {
                        <div class="psk-qr-display mt-1">
                            <div class="qr-code-container">
                                <img [src]="pskQRDataUrl()" alt="PSK exchange QR code" class="qr-code-img" />
                            </div>
                            <p class="text-xs text-muted mt-1 text-center">Scan with the other device to import.</p>
                            <div class="psk-uri-copy mt-1">
                                <input
                                    type="text"
                                    class="nes-input is-dark text-xs"
                                    [value]="pskExchangeURI()"
                                    readonly
                                />
                                <button class="nes-btn psk-action-btn" (click)="copyPSKURI()">
                                    @if (uriCopied()) { Copied! } @else { Copy }
                                </button>
                            </div>
                            <div class="flex justify-center mt-1">
                                <button class="nes-btn psk-action-btn" (click)="pskQRDataUrl.set(null)">Close</button>
                            </div>
                        </div>
                    }
                </div>

                <div class="flex gap-1 justify-center mt-2">
                    <button class="nes-btn" (click)="close.emit()">Cancel</button>
                    <button class="nes-btn is-primary" (click)="saveAndClose()">Save</button>
                </div>
            </section>
        </div>
    `,
})
export class ContactSettingsDialogComponent implements OnInit {
    private readonly contactSettings = inject(ContactSettingsService);
    private readonly pskService = inject(PSKService);
    private readonly wallet = inject(WalletService);
    private readonly cdr = inject(ChangeDetectorRef);

    readonly address = input.required<string>();
    readonly isSelfChat = input(false);
    readonly close = output<void>();

    protected readonly currentSettings = signal<ContactSettings>({});
    protected nickname = '';

    // PSK state
    protected readonly hasPSK = signal(false);
    protected readonly showImportPSK = signal(false);
    protected importURI = '';
    protected readonly importError = signal<string | null>(null);
    protected readonly pskQRDataUrl = signal<string | null>(null);
    protected readonly pskExchangeURI = signal('');
    protected readonly uriCopied = signal(false);

    // Track PSK for this contact so QR can be re-shown
    private currentPSK: Uint8Array | null = null;

    ngOnInit(): void {
        const settings = this.contactSettings.getSettings(this.address());
        this.currentSettings.set(settings);
        this.nickname = settings.nickname ?? '';
        this.hasPSK.set(this.pskService.hasPSK(this.address()));

        if (this.hasPSK()) {
            this.currentPSK = this.pskService.getPSK(this.address());
        }
    }

    protected toggleFavorite(): void {
        this.contactSettings.toggleFavorite(this.address());
        this.currentSettings.set(this.contactSettings.getSettings(this.address()));
    }

    protected toggleMuted(): void {
        this.contactSettings.toggleMuted(this.address());
        this.currentSettings.set(this.contactSettings.getSettings(this.address()));
    }

    protected toggleBlocked(): void {
        this.contactSettings.toggleBlocked(this.address());
        this.currentSettings.set(this.contactSettings.getSettings(this.address()));
    }

    protected async generatePSK(): Promise<void> {
        const psk = this.pskService.generatePSK();
        this.pskService.storePSK(this.address(), psk);
        this.currentPSK = psk;
        this.hasPSK.set(true);

        // Generate exchange URI and QR
        const myAddress = this.wallet.address();
        const uri = this.pskService.createExchangeURI(myAddress, psk);
        this.pskExchangeURI.set(uri);

        try {
            const dataUrl = await QRCode.toDataURL(uri, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' },
            });
            this.pskQRDataUrl.set(dataUrl);
            this.cdr.detectChanges();
        } catch (err) {
            console.error('[AlgoChat] Failed to generate PSK QR:', err);
        }
    }

    protected importPSK(): void {
        this.importError.set(null);

        try {
            const { address, psk } = this.pskService.importFromURI(this.importURI.trim());

            // Validate that the address in the URI matches the contact or store accordingly
            if (address !== this.address()) {
                this.importError.set('URI address does not match this contact.');
                return;
            }

            this.pskService.storePSK(address, psk);
            this.currentPSK = psk;
            this.hasPSK.set(true);
            this.showImportPSK.set(false);
            this.importURI = '';
        } catch {
            this.importError.set('Invalid PSK exchange URI.');
        }
    }

    protected async showPSKQR(): Promise<void> {
        if (!this.currentPSK) return;

        const myAddress = this.wallet.address();
        const uri = this.pskService.createExchangeURI(myAddress, this.currentPSK);
        this.pskExchangeURI.set(uri);

        try {
            const dataUrl = await QRCode.toDataURL(uri, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' },
            });
            this.pskQRDataUrl.set(dataUrl);
            this.cdr.detectChanges();
        } catch (err) {
            console.error('[AlgoChat] Failed to generate PSK QR:', err);
        }
    }

    protected removePSK(): void {
        this.pskService.removePSK(this.address());
        this.currentPSK = null;
        this.hasPSK.set(false);
        this.pskQRDataUrl.set(null);
    }

    protected async copyPSKURI(): Promise<void> {
        await navigator.clipboard.writeText(this.pskExchangeURI());
        this.uriCopied.set(true);
        setTimeout(() => this.uriCopied.set(false), 1500);
    }

    protected saveAndClose(): void {
        const currentNickname = this.currentSettings().nickname ?? '';
        if (this.nickname !== currentNickname) {
            this.contactSettings.setNickname(this.address(), this.nickname);
        }
        this.close.emit();
    }

    protected onOverlayClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('nes-dialog-overlay')) {
            this.close.emit();
        }
    }
}
