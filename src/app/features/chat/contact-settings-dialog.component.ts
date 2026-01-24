import { Component, inject, input, output, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactSettingsService, type ContactSettings } from '../../core/services/contact-settings.service';

@Component({
    selector: 'app-contact-settings-dialog',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="nes-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="contact-settings-title" (click)="onOverlayClick($event)">
            <section class="nes-container is-dark is-rounded dialog-box contact-settings-dialog">
                <h3 id="contact-settings-title" class="mb-2 text-warning">Contact Settings</h3>

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

    readonly address = input.required<string>();
    readonly close = output<void>();

    protected readonly currentSettings = signal<ContactSettings>({});
    protected nickname = '';

    ngOnInit(): void {
        const settings = this.contactSettings.getSettings(this.address());
        this.currentSettings.set(settings);
        this.nickname = settings.nickname ?? '';
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

    protected saveAndClose(): void {
        // Only update nickname if it changed
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
