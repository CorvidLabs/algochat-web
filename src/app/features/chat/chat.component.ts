import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { WalletService } from '../../core/services/wallet.service';
import { ChatService } from '../../core/services/chat.service';
import { ContactSettingsService } from '../../core/services/contact-settings.service';
import { ContactSettingsDialogComponent } from './contact-settings-dialog.component';
import type { Message, ConversationData as Conversation } from 'ts-algochat';

@Component({
    selector: 'app-chat',
    imports: [FormsModule, DatePipe, ContactSettingsDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="app-container">
            <!-- Header -->
            <header class="app-header">
                <section class="nes-container is-dark is-rounded flex items-center justify-between p-1">
                    <div class="flex items-center gap-1">
                        <i class="nes-icon coin is-small hide-mobile"></i>
                        <span class="text-success">AlgoChat</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <button
                            class="nes-btn address-chip"
                            [class.copied]="addressCopied()"
                            title="Copy address"
                            (click)="copyAddress()"
                        >
                            @if (addressCopied()) {
                                <i class="nes-icon is-small trophy hide-mobile"></i>
                                <span>Copied!</span>
                            } @else {
                                <i class="nes-icon is-small coin hide-mobile"></i>
                                <span>{{ truncateAddress(wallet.address()) }}</span>
                            }
                        </button>
                        @if (keyPublished() === true) {
                            <span class="nes-text is-success text-xs hide-mobile" title="Key published - others can message you">OK</span>
                        } @else {
                            <button
                                class="nes-btn is-warning"
                                [class.is-disabled]="publishing() || !canPublishKey()"
                                [disabled]="publishing() || !canPublishKey()"
                                [title]="canPublishKey() ? 'Publish your key so others can message you' : 'Need at least 0.1 ALGO'"
                                (click)="publishKey()"
                            >
                                @if (publishing()) {
                                    <span class="loading-dots">...</span>
                                } @else {
                                    <i class="nes-icon is-small star"></i>
                                }
                            </button>
                        }
                        <span class="nes-text is-primary text-xs">{{ formattedBalance() }}</span>
                        <button class="nes-btn is-error" title="Disconnect" (click)="disconnect()">
                            <i class="nes-icon close is-small"></i>
                        </button>
                    </div>
                </section>
            </header>

            <!-- Main -->
            <main class="app-main">
                <!-- Sidebar -->
                <aside class="sidebar" [class.mobile-hidden]="selectedAddress()">
                    <section class="nes-container is-dark is-rounded h-full flex flex-col overflow-hidden">
                        <div class="flex items-center justify-between mb-1 p-1">
                            <span class="text-sm text-warning">Chats</span>
                            <button class="nes-btn is-primary" (click)="showNewChat.set(true)">
                                <i class="nes-icon is-small star"></i>
                            </button>
                        </div>

                        <div class="flex-1 overflow-auto">
                            @for (conv of filteredConversations(); track conv.participant) {
                                <div
                                    class="conversation-item"
                                    [class.active]="selectedAddress() === conv.participant"
                                    [class.muted]="contactSettings.isMuted(conv.participant)"
                                    (click)="selectConversation(conv)"
                                    (contextmenu)="onConversationContextMenu($event, conv.participant)"
                                    (touchstart)="onTouchStart($event, conv.participant)"
                                    (touchend)="onTouchEnd()"
                                    (touchmove)="onTouchEnd()"
                                >
                                    <p class="conv-address truncate">
                                        @if (contactSettings.isFavorite(conv.participant)) {
                                            <i class="nes-icon is-small star favorite-star"></i>
                                        }
                                        {{ contactSettings.getDisplayName(conv.participant) }}
                                    </p>
                                    @if (conv.messages.length > 0) {
                                        <p class="conv-preview">
                                            {{ conv.messages[conv.messages.length - 1].content }}
                                        </p>
                                    }
                                </div>
                            } @empty {
                                <div class="empty-state p-2">
                                    <i class="nes-icon is-large heart is-empty"></i>
                                    <p class="text-xs">No conversations yet</p>
                                </div>
                            }
                        </div>

                        @if (blockedCount() > 0) {
                            <div class="sidebar-footer p-1">
                                <button
                                    class="nes-btn is-error blocked-btn"
                                    (click)="showBlockedContacts.set(true)"
                                >
                                    <i class="nes-icon close is-small"></i>
                                    {{ blockedCount() }} blocked
                                </button>
                            </div>
                        }
                    </section>
                </aside>

                <!-- Chat Area -->
                <section class="chat-area" [class.mobile-visible]="selectedAddress()">
                    @if (selectedAddress()) {
                        <!-- Chat Header -->
                        <div class="nes-container is-dark is-rounded mb-1 p-1 flex items-center">
                            <button class="nes-btn mobile-back-btn" (click)="goBack()">
                                <span>&lt;</span>
                            </button>
                            <div class="flex-1 min-w-0">
                                <p class="text-xs truncate">
                                    @if (contactSettings.isFavorite(selectedAddress()!)) {
                                        <i class="nes-icon is-small star favorite-star"></i>
                                    }
                                    {{ contactSettings.getDisplayName(selectedAddress()!) }}
                                </p>
                                @if (contactSettings.getSettings(selectedAddress()!).nickname) {
                                    <p class="text-xs text-muted truncate">{{ truncateAddress(selectedAddress()!) }}</p>
                                }
                            </div>
                            <button
                                class="nes-btn chat-header-menu"
                                title="Contact settings"
                                (click)="openContactSettings(selectedAddress()!)"
                            >
                                <span>...</span>
                            </button>
                        </div>

                        <!-- Messages -->
                        <div class="nes-container is-dark is-rounded flex-1 mb-1 messages-container">
                            @for (msg of selectedMessages(); track msg.id) {
                                <div class="message-bubble nes-container is-rounded" [class.sent]="msg.direction === 'sent'" [class.received]="msg.direction === 'received'">
                                    @if (msg.replyContext) {
                                        <div class="reply-quote">{{ msg.replyContext.preview }}</div>
                                    }
                                    <p class="text-sm">{{ msg.content }}</p>
                                    <div class="message-footer">
                                        @if (msg.amount && msg.amount > 1000) {
                                            <span class="message-amount" [class.sent]="msg.direction === 'sent'" [class.received]="msg.direction === 'received'">
                                                {{ msg.direction === 'sent' ? '-' : '+' }}{{ formatMicroAlgos(msg.amount) }} ALGO
                                            </span>
                                        }
                                        <span class="message-time">{{ msg.timestamp | date:'short' }}</span>
                                    </div>
                                </div>
                            } @empty {
                                <div class="empty-state h-full">
                                    <i class="nes-icon is-large comment"></i>
                                    <p class="text-xs">No messages yet</p>
                                </div>
                            }
                        </div>

                        <!-- Input -->
                        <div class="nes-container is-dark is-rounded p-1">
                            <div class="flex gap-1">
                                <textarea
                                    class="nes-textarea is-dark flex-1"
                                    rows="2"
                                    [(ngModel)]="newMessage"
                                    placeholder="Type a message..."
                                    (keydown.enter)="sendMessage($event)"
                                ></textarea>
                                <button
                                    class="nes-btn"
                                    [class.is-primary]="!sendAmount()"
                                    [class.is-success]="sendAmount()"
                                    [class.is-disabled]="!canSend()"
                                    [disabled]="!canSend()"
                                    (click)="sendMessage()"
                                >
                                    @if (sendAmount()) {
                                        Send {{ formatAlgo(sendAmount()!) }}A
                                    } @else {
                                        Send
                                    }
                                </button>
                            </div>
                            <div class="algo-amount-row">
                                @if (sendAmount()) {
                                    <div class="algo-amount-badge">
                                        <span class="algo-amount-value">{{ formatAlgo(sendAmount()!) }} ALGO</span>
                                        <button
                                            type="button"
                                            class="algo-amount-clear"
                                            title="Remove ALGO"
                                            (click)="sendAmount.set(null)"
                                        >X</button>
                                    </div>
                                } @else {
                                    <button
                                        type="button"
                                        class="algo-amount-add"
                                        (click)="showAlgoInput.set(true)"
                                    >
                                        + Add ALGO
                                    </button>
                                }

                                @if (showAlgoInput() && !sendAmount()) {
                                    <div class="algo-amount-input-row">
                                        <label for="algo-amount" class="algo-input-label">Amount:</label>
                                        <input
                                            id="algo-amount"
                                            type="number"
                                            class="nes-input is-dark algo-input"
                                            [(ngModel)]="algoInputValue"
                                            min="0.001"
                                            step="0.001"
                                            placeholder="0.001"
                                            (keydown.enter)="confirmAlgoAmount()"
                                            (keydown.escape)="cancelAlgoInput()"
                                        />
                                        <span class="algo-input-label">ALGO</span>
                                        <button
                                            type="button"
                                            class="nes-btn is-success"
                                            [disabled]="!algoInputValue() || algoInputValue()! < 0.001"
                                            (click)="confirmAlgoAmount()"
                                        >
                                            Add
                                        </button>
                                        <button
                                            type="button"
                                            class="nes-btn"
                                            (click)="cancelAlgoInput()"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                }
                            </div>
                        </div>
                    } @else {
                        <div class="nes-container is-dark is-rounded h-full">
                            <div class="empty-state h-full">
                                <i class="nes-icon is-large star"></i>
                                <p class="text-sm">Select a conversation or start a new chat</p>
                            </div>
                        </div>
                    }
                </section>
            </main>

            <!-- New Chat Dialog -->
            @if (showNewChat()) {
                <div class="nes-dialog-overlay">
                    <section class="nes-container is-dark is-rounded dialog-box">
                        <h3 class="mb-2 text-warning">New Chat</h3>

                        @if (newChatError()) {
                            <div class="nes-container is-rounded is-error mb-1">
                                <p class="text-xs">{{ newChatError() }}</p>
                            </div>
                        }

                        <div class="nes-field">
                            <label class="text-success">Recipient Address</label>
                            <input
                                type="text"
                                class="nes-input is-dark"
                                [(ngModel)]="newChatAddress"
                                placeholder="ALGO..."
                            />
                        </div>

                        <div class="flex gap-1 justify-center">
                            <button class="nes-btn" (click)="showNewChat.set(false)">Cancel</button>
                            <button
                                class="nes-btn is-primary"
                                [class.is-disabled]="!newChatAddress().trim()"
                                [disabled]="!newChatAddress().trim()"
                                (click)="startNewChat()"
                            >
                                Start Chat
                            </button>
                        </div>
                    </section>
                </div>
            }

            <!-- Contact Settings Dialog -->
            @if (showContactSettings()) {
                <app-contact-settings-dialog
                    [address]="contactSettingsAddress()!"
                    (close)="closeContactSettings()"
                />
            }

            <!-- Blocked Contacts Dialog -->
            @if (showBlockedContacts()) {
                <div class="nes-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="blocked-title" (click)="onBlockedOverlayClick($event)">
                    <section class="nes-container is-dark is-rounded dialog-box">
                        <h3 id="blocked-title" class="mb-2 text-warning">Blocked Contacts</h3>

                        <div class="blocked-list">
                            @for (address of blockedAddresses(); track address) {
                                <div class="blocked-item">
                                    <div class="blocked-info">
                                        <p class="text-xs">{{ contactSettings.getDisplayName(address) }}</p>
                                        <p class="text-xs text-muted word-break">{{ address }}</p>
                                    </div>
                                    <button
                                        class="nes-btn is-success"
                                        (click)="unblockContact(address)"
                                    >
                                        Unblock
                                    </button>
                                </div>
                            } @empty {
                                <p class="text-xs text-muted text-center">No blocked contacts</p>
                            }
                        </div>

                        <div class="flex justify-center mt-2">
                            <button class="nes-btn" (click)="showBlockedContacts.set(false)">Close</button>
                        </div>
                    </section>
                </div>
            }
        </div>
    `,
})
export class ChatComponent implements OnInit, OnDestroy {
    protected readonly wallet = inject(WalletService);
    private readonly chatService = inject(ChatService);
    private readonly router = inject(Router);
    protected readonly contactSettings = inject(ContactSettingsService);

    protected readonly conversations = signal<Conversation[]>([]);
    protected readonly selectedAddress = signal<string | null>(null);
    protected readonly selectedMessages = signal<Message[]>([]);
    protected readonly newMessage = signal('');
    protected readonly balance = signal(0n);
    protected readonly showNewChat = signal(false);
    protected readonly newChatAddress = signal('');
    protected readonly newChatError = signal<string | null>(null);
    protected readonly addressCopied = signal(false);
    protected readonly keyPublished = signal<boolean | null>(null); // null = checking
    protected readonly publishing = signal(false);
    protected readonly sendAmount = signal<number | null>(null);
    protected readonly showAlgoInput = signal(false);
    protected readonly algoInputValue = signal<number | null>(null);
    protected readonly showContactSettings = signal(false);
    protected readonly contactSettingsAddress = signal<string | null>(null);
    protected readonly showBlockedContacts = signal(false);

    protected readonly blockedCount = computed(() => {
        // Access settings to trigger reactivity
        this.contactSettings.settings();
        return this.contactSettings.getBlocked().length;
    });

    protected readonly blockedAddresses = computed(() => {
        this.contactSettings.settings();
        return this.contactSettings.getBlocked();
    });

    protected readonly filteredConversations = computed(() => {
        const settings = this.contactSettings.settings();
        return this.conversations()
            .filter(c => !this.contactSettings.isBlocked(c.participant))
            .sort((a, b) => {
                const aFav = this.contactSettings.isFavorite(a.participant) ? 0 : 1;
                const bFav = this.contactSettings.isFavorite(b.participant) ? 0 : 1;
                if (aFav !== bFav) return aFav - bFav;
                // Then by most recent message
                const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
                const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
                return bLast - aLast;
            });
    });

    // Auto-refresh intervals
    private balanceInterval?: ReturnType<typeof setInterval>;
    private conversationsInterval?: ReturnType<typeof setInterval>;
    private messagesInterval?: ReturnType<typeof setInterval>;

    private static readonly BALANCE_REFRESH_MS = 30_000; // 30 seconds
    private static readonly CONVERSATIONS_REFRESH_MS = 30_000; // 30 seconds
    private static readonly MESSAGES_REFRESH_MS = 10_000; // 10 seconds

    protected readonly canPublishKey = computed(() => this.balance() >= 100_000n);

    protected readonly formattedBalance = computed(() => {
        const bal = this.balance();
        return (Number(bal) / 1_000_000).toFixed(3) + ' ALGO';
    });

    protected readonly canSend = computed(() => {
        return this.newMessage().trim().length > 0 && this.selectedAddress() !== null;
    });

    async ngOnInit(): Promise<void> {
        // Auth guard ensures we're connected, so just load data
        await this.loadData();
        this.startAutoRefresh();
    }

    ngOnDestroy(): void {
        this.stopAutoRefresh();
    }

    private startAutoRefresh(): void {
        // Auto-refresh balance
        this.balanceInterval = setInterval(async () => {
            const balance = await this.chatService.getBalance();
            this.balance.set(balance);
        }, ChatComponent.BALANCE_REFRESH_MS);

        // Auto-refresh conversations list
        this.conversationsInterval = setInterval(async () => {
            await this.refreshConversations();
        }, ChatComponent.CONVERSATIONS_REFRESH_MS);

        // Auto-refresh active conversation messages
        this.messagesInterval = setInterval(async () => {
            const address = this.selectedAddress();
            if (address) {
                await this.refreshMessages(address);
            }
        }, ChatComponent.MESSAGES_REFRESH_MS);
    }

    private stopAutoRefresh(): void {
        if (this.balanceInterval) {
            clearInterval(this.balanceInterval);
            this.balanceInterval = undefined;
        }
        if (this.conversationsInterval) {
            clearInterval(this.conversationsInterval);
            this.conversationsInterval = undefined;
        }
        if (this.messagesInterval) {
            clearInterval(this.messagesInterval);
            this.messagesInterval = undefined;
        }
    }

    private async refreshConversations(): Promise<void> {
        const conversations = await this.chatService.fetchConversations();
        this.conversations.set(conversations);

        // If we have an active conversation, update its messages too
        const address = this.selectedAddress();
        if (address) {
            const activeConv = conversations.find(c => c.participant === address);
            if (activeConv) {
                this.selectedMessages.set(activeConv.messages);
            }
        }
    }

    private async refreshMessages(address: string): Promise<void> {
        const messages = await this.chatService.fetchMessages(address);
        // Only update if still viewing the same conversation
        if (this.selectedAddress() === address) {
            this.selectedMessages.set(messages);
        }
    }

    private async loadData(): Promise<void> {
        const [conversations, balance, hasKey] = await Promise.all([
            this.chatService.fetchConversations(),
            this.chatService.getBalance(),
            this.chatService.hasPublishedKey(),
        ]);

        this.conversations.set(conversations);
        this.balance.set(balance);
        this.keyPublished.set(hasKey);
    }

    protected async selectConversation(conv: Conversation): Promise<void> {
        this.selectedAddress.set(conv.participant);
        this.selectedMessages.set(conv.messages);

        // Refresh messages
        const messages = await this.chatService.fetchMessages(conv.participant);
        this.selectedMessages.set(messages);
    }

    protected async sendMessage(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
        }

        const address = this.selectedAddress();
        const message = this.newMessage().trim();

        console.log('[sendMessage] To:', address);
        console.log('[sendMessage] Message:', message);

        if (!address || !message) return;

        // Auto-publish our key if not yet published and we have balance
        if (!this.keyPublished() && this.canPublishKey()) {
            console.log('[sendMessage] Auto-publishing key...');
            await this.publishKey();
        }

        // Find recipient public key
        const conv = this.conversations().find((c) => c.participant === address);
        let pubKey = conv?.participantPublicKey;
        console.log('[sendMessage] Key from conversation cache:', !!pubKey);

        if (!pubKey) {
            console.log('[sendMessage] Discovering public key...');
            pubKey = (await this.chatService.discoverPublicKey(address)) ?? undefined;
            console.log('[sendMessage] Discovered key:', !!pubKey);
        }

        if (!pubKey) {
            console.log('[sendMessage] No key found, showing alert');
            alert(
                'Cannot find recipient\'s encryption key.\n\n' +
                'They need to publish their key first by clicking the star button in their header, ' +
                'or send a message to someone.'
            );
            return;
        }

        // Calculate amount in microAlgos (default 0.001 ALGO = 1000 microAlgos)
        const amountAlgo = this.sendAmount();
        const amountMicroAlgos = amountAlgo ? Math.floor(amountAlgo * 1_000_000) : undefined;

        const txid = await this.chatService.sendMessage(address, pubKey, message, amountMicroAlgos);

        if (txid) {
            this.newMessage.set('');
            this.sendAmount.set(null);

            // Add optimistic message
            const newMsg: Message = {
                id: txid,
                sender: this.wallet.address(),
                recipient: address,
                content: message,
                timestamp: new Date(),
                confirmedRound: 0,
                direction: 'sent',
                amount: amountMicroAlgos ?? 1000,
            };

            this.selectedMessages.update((msgs) => [...msgs, newMsg]);
        }
    }

    protected async startNewChat(): Promise<void> {
        this.newChatError.set(null);

        const address = this.newChatAddress().trim();

        if (!this.wallet.validateAddress(address)) {
            this.newChatError.set('Invalid Algorand address');
            return;
        }

        // Check if conversation exists
        const existing = this.conversations().find((c) => c.participant === address);
        if (existing) {
            this.selectConversation(existing);
            this.showNewChat.set(false);
            this.newChatAddress.set('');
            return;
        }

        // Create new conversation
        const newConv: Conversation = {
            participant: address,
            messages: [],
        };

        // Try to discover public key
        const pubKey = await this.chatService.discoverPublicKey(address);
        if (pubKey) {
            newConv.participantPublicKey = pubKey;
        }

        this.conversations.update((convs) => [newConv, ...convs]);
        this.selectConversation(newConv);
        this.showNewChat.set(false);
        this.newChatAddress.set('');
    }

    protected disconnect(): void {
        this.contactSettings.clear();
        this.wallet.disconnect();
        this.router.navigate(['/login']);
    }

    protected truncateAddress(address: string): string {
        if (address.length <= 12) return address;
        return address.slice(0, 6) + '...' + address.slice(-4);
    }

    protected goBack(): void {
        this.selectedAddress.set(null);
        this.selectedMessages.set([]);
    }

    protected async copyAddress(): Promise<void> {
        await navigator.clipboard.writeText(this.wallet.address());
        this.addressCopied.set(true);
        setTimeout(() => this.addressCopied.set(false), 1500);
    }

    protected async publishKey(): Promise<void> {
        if (this.publishing()) return;

        this.publishing.set(true);
        const txid = await this.chatService.publishKey();
        this.publishing.set(false);

        if (txid) {
            this.keyPublished.set(true);
            // Refresh balance after transaction
            const balance = await this.chatService.getBalance();
            this.balance.set(balance);
        }
    }

    protected openContactSettings(address: string): void {
        this.contactSettingsAddress.set(address);
        this.showContactSettings.set(true);
    }

    protected closeContactSettings(): void {
        this.showContactSettings.set(false);
        this.contactSettingsAddress.set(null);
    }

    protected onConversationContextMenu(event: MouseEvent, address: string): void {
        event.preventDefault();
        this.openContactSettings(address);
    }

    // Long-press support for mobile
    private longPressTimer?: ReturnType<typeof setTimeout>;
    private readonly LONG_PRESS_DURATION = 500; // ms

    protected onTouchStart(event: TouchEvent, address: string): void {
        this.longPressTimer = setTimeout(() => {
            event.preventDefault();
            this.openContactSettings(address);
        }, this.LONG_PRESS_DURATION);
    }

    protected onTouchEnd(): void {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }

    protected onBlockedOverlayClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('nes-dialog-overlay')) {
            this.showBlockedContacts.set(false);
        }
    }

    protected unblockContact(address: string): void {
        this.contactSettings.toggleBlocked(address);
        // Close dialog if no more blocked contacts
        if (this.blockedCount() === 0) {
            this.showBlockedContacts.set(false);
        }
    }

    protected confirmAlgoAmount(): void {
        const value = this.algoInputValue();
        if (value && value >= 0.001) {
            // Round to 6 decimal places (microAlgos precision) to avoid floating point issues
            const rounded = Math.round(value * 1_000_000) / 1_000_000;
            this.sendAmount.set(rounded);
        }
        this.showAlgoInput.set(false);
        this.algoInputValue.set(null);
    }

    protected formatAlgo(amount: number): string {
        // Format with up to 6 decimals, removing trailing zeros
        return amount.toFixed(6).replace(/\.?0+$/, '');
    }

    protected formatMicroAlgos(microAlgos: number): string {
        // Convert microAlgos to ALGO and format
        const algo = microAlgos / 1_000_000;
        return algo.toFixed(6).replace(/\.?0+$/, '');
    }

    protected cancelAlgoInput(): void {
        this.showAlgoInput.set(false);
        this.algoInputValue.set(null);
    }
}
