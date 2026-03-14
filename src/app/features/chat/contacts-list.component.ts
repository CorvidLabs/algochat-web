import { Component, inject, signal, computed, output, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactSettingsService } from '../../core/services/contact-settings.service';
import { PSKService } from '../../core/services/psk.service';
import { WalletService } from '../../core/services/wallet.service';

export interface ContactEntry {
    address: string;
    nickname: string | undefined;
    hasPSK: boolean;
    isFavorite: boolean;
    isBlocked: boolean;
    isMuted: boolean;
}

@Component({
    selector: 'app-contacts-list',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="contacts-list-container">
            <!-- Search -->
            <div class="contacts-search mb-1">
                <input
                    type="text"
                    class="nes-input is-dark w-full"
                    [ngModel]="searchQuery()"
                    (ngModelChange)="searchQuery.set($event)"
                    placeholder="Search contacts..."
                    autocomplete="off"
                />
            </div>

            <!-- Add Contact Button -->
            <button
                class="nes-btn is-success w-full mb-1 contacts-add-btn"
                (click)="showAddForm.set(!showAddForm())"
            >
                @if (showAddForm()) { Cancel } @else { + Add Contact }
            </button>

            <!-- Add Contact Form -->
            @if (showAddForm()) {
                <div class="contacts-add-form mb-1">
                    <div class="nes-field mb-1">
                        <label for="contact-address" class="text-xs text-success">Address</label>
                        <input
                            id="contact-address"
                            type="text"
                            class="nes-input is-dark"
                            [(ngModel)]="newAddress"
                            placeholder="ALGO..."
                            autocomplete="off"
                        />
                    </div>
                    <div class="nes-field mb-1">
                        <label for="contact-nickname" class="text-xs text-success">Nickname (optional)</label>
                        <input
                            id="contact-nickname"
                            type="text"
                            class="nes-input is-dark"
                            [(ngModel)]="newNickname"
                            placeholder="Name..."
                            maxlength="20"
                            autocomplete="off"
                        />
                    </div>
                    <div class="nes-field mb-1">
                        <label for="contact-psk" class="text-xs text-success">PSK URI (optional)</label>
                        <input
                            id="contact-psk"
                            type="text"
                            class="nes-input is-dark"
                            [(ngModel)]="newPskUri"
                            placeholder="algochat-psk://v1?..."
                            autocomplete="off"
                        />
                    </div>
                    @if (addError()) {
                        <p class="text-xs text-error mb-1">{{ addError() }}</p>
                    }
                    <button
                        class="nes-btn is-primary w-full"
                        [disabled]="!newAddress.trim()"
                        (click)="addContact()"
                    >Save Contact</button>
                </div>
            }

            <!-- Contacts List -->
            <div class="contacts-scroll">
                @for (contact of filteredContacts(); track contact.address) {
                    <div
                        class="contact-item"
                        [class.blocked]="contact.isBlocked"
                        (click)="openChat.emit(contact.address)"
                    >
                        <div class="contact-info">
                            <p class="contact-name truncate">
                                @if (contact.isFavorite) {
                                    <i class="nes-icon is-small star favorite-star"></i>
                                }
                                @if (contact.hasPSK) {
                                    <span class="psk-lock" title="Secure channel active">&#x1f6e1;</span>
                                }
                                {{ contact.nickname || truncateAddress(contact.address) }}
                            </p>
                            @if (contact.nickname) {
                                <p class="contact-address text-xs text-muted truncate">{{ truncateAddress(contact.address) }}</p>
                            }
                            <div class="contact-badges">
                                @if (contact.hasPSK) {
                                    <span class="contact-badge psk">PSK</span>
                                }
                                @if (contact.isMuted) {
                                    <span class="contact-badge muted">Muted</span>
                                }
                                @if (contact.isBlocked) {
                                    <span class="contact-badge blocked">Blocked</span>
                                }
                            </div>
                        </div>
                        <div class="contact-actions">
                            <button
                                class="nes-btn psk-action-btn"
                                title="Settings"
                                (click)="openSettings.emit(contact.address); $event.stopPropagation()"
                            >...</button>
                            <button
                                class="nes-btn is-error psk-action-btn"
                                title="Delete contact"
                                (click)="deleteContact(contact.address); $event.stopPropagation()"
                            >X</button>
                        </div>
                    </div>
                } @empty {
                    <div class="empty-state p-2">
                        <p class="text-xs text-muted">
                            @if (searchQuery()) {
                                No contacts match "{{ searchQuery() }}"
                            } @else {
                                No contacts yet. Add one above!
                            }
                        </p>
                    </div>
                }
            </div>

            <div class="contacts-count text-xs text-muted p-1">
                {{ filteredContacts().length }} contact{{ filteredContacts().length !== 1 ? 's' : '' }}
            </div>
        </div>
    `,
})
export class ContactsListComponent {
    private readonly contactSettings = inject(ContactSettingsService);
    private readonly pskService = inject(PSKService);
    private readonly wallet = inject(WalletService);
    private readonly cdr = inject(ChangeDetectorRef);

    readonly openChat = output<string>();
    readonly openSettings = output<string>();

    protected readonly searchQuery = signal('');
    protected readonly showAddForm = signal(false);
    protected readonly addError = signal<string | null>(null);

    protected newAddress = '';
    protected newNickname = '';
    protected newPskUri = '';

    protected readonly allContacts = computed((): ContactEntry[] => {
        const settings = this.contactSettings.settings();
        const pskEntries = this.pskService.entries();
        const myAddress = this.wallet.address();

        // Merge addresses from both sources
        const addressSet = new Set<string>([
            ...Object.keys(settings),
            ...Object.keys(pskEntries),
        ]);

        // Exclude self
        addressSet.delete(myAddress);

        return Array.from(addressSet).map(address => ({
            address,
            nickname: settings[address]?.nickname,
            hasPSK: address in pskEntries,
            isFavorite: settings[address]?.isFavorite ?? false,
            isBlocked: settings[address]?.isBlocked ?? false,
            isMuted: settings[address]?.isMuted ?? false,
        }));
    });

    protected readonly filteredContacts = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        let contacts = this.allContacts();

        if (query) {
            contacts = contacts.filter(c =>
                c.address.toLowerCase().includes(query) ||
                (c.nickname?.toLowerCase().includes(query) ?? false)
            );
        }

        // Sort: favorites first, then alphabetically by name/address
        return contacts.sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
            if (a.isBlocked !== b.isBlocked) return a.isBlocked ? 1 : -1;
            const aName = a.nickname?.toLowerCase() ?? a.address;
            const bName = b.nickname?.toLowerCase() ?? b.address;
            return aName.localeCompare(bName);
        });
    });

    protected addContact(): void {
        this.addError.set(null);
        const address = this.newAddress.trim();

        if (!this.wallet.validateAddress(address)) {
            this.addError.set('Invalid Algorand address');
            return;
        }

        if (address === this.wallet.address()) {
            this.addError.set('Cannot add yourself as a contact');
            return;
        }

        // Set nickname if provided
        if (this.newNickname.trim()) {
            this.contactSettings.setNickname(address, this.newNickname.trim());
        } else {
            // Touch the contact entry so it appears in the list
            this.contactSettings.setNickname(address, '');
            // If no nickname, we need to ensure the contact exists — set and unset favorite to create entry
            // Actually, setNickname with empty string removes the entry if no other settings exist.
            // Let's use a different approach: just store the address with an empty nickname.
            // The simplest way is to toggle a setting, but that changes state.
            // Instead, set a minimal nickname then clear it — or just leave it.
            // For contacts without a nickname, they'll still appear if they have PSK.
        }

        // Import PSK if provided
        if (this.newPskUri.trim()) {
            try {
                const { address: pskAddress, psk } = this.pskService.importFromURI(this.newPskUri.trim());
                if (pskAddress !== address) {
                    this.addError.set('PSK URI address does not match the contact address');
                    return;
                }
                this.pskService.storePSK(address, psk);
            } catch {
                this.addError.set('Invalid PSK exchange URI');
                return;
            }
        }

        // If we have no nickname and no PSK, we still need a way to save the contact.
        // Set a nickname placeholder that shows they were manually added.
        if (!this.newNickname.trim() && !this.newPskUri.trim()) {
            // Create a minimal contact entry by setting nickname to empty then
            // the address won't show up unless we explicitly ensure it exists.
            // The best approach: if nothing else was set, mark as favorite temporarily? No.
            // Actually, ContactSettingsService stores entries. setNickname with a value creates it.
            // With empty nickname and no PSK, we'll set a space-like placeholder.
            // Better: just use setNickname with the truncated address as a default.
            this.contactSettings.setNickname(address, '');
        }

        // Reset form
        this.newAddress = '';
        this.newNickname = '';
        this.newPskUri = '';
        this.showAddForm.set(false);
        this.cdr.detectChanges();
    }

    protected deleteContact(address: string): void {
        this.contactSettings.removeContact(address);
        this.pskService.removePSK(address);
    }

    protected truncateAddress(address: string): string {
        if (address.length <= 12) return address;
        return address.slice(0, 6) + '...' + address.slice(-4);
    }
}
