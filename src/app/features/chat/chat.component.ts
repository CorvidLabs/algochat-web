import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { WalletService } from '../../core/services/wallet.service';
import { ChatService } from '../../core/services/chat.service';
import type { Message, Conversation } from '../../core/types';

@Component({
    selector: 'app-chat',
    imports: [FormsModule, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="app-container">
            <!-- Header -->
            <header class="app-header">
                <section class="nes-container is-dark is-rounded flex items-center justify-between p-1">
                    <div class="flex items-center gap-1">
                        <i class="nes-icon coin is-small"></i>
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
                                <i class="nes-icon is-small trophy"></i>
                                <span>Copied!</span>
                            } @else {
                                <i class="nes-icon is-small coin"></i>
                                <span>{{ truncateAddress(wallet.address()) }}</span>
                            }
                        </button>
                        @if (keyPublished() === true) {
                            <span class="nes-text is-success text-xs" title="Key published - others can message you">OK</span>
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
                <aside class="sidebar">
                    <section class="nes-container is-dark is-rounded h-full flex flex-col overflow-hidden">
                        <div class="flex items-center justify-between mb-1 p-1">
                            <span class="text-sm text-warning">Chats</span>
                            <button class="nes-btn is-primary" (click)="showNewChat.set(true)">
                                <i class="nes-icon is-small star"></i>
                            </button>
                        </div>

                        <div class="flex-1 overflow-auto">
                            @for (conv of conversations(); track conv.participant) {
                                <div
                                    class="conversation-item"
                                    [class.active]="selectedAddress() === conv.participant"
                                    (click)="selectConversation(conv)"
                                >
                                    <p class="text-xs truncate">{{ truncateAddress(conv.participant) }}</p>
                                    @if (conv.messages.length > 0) {
                                        <p class="text-xs text-muted truncate">
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
                    </section>
                </aside>

                <!-- Chat Area -->
                <section class="chat-area">
                    @if (selectedAddress()) {
                        <!-- Chat Header -->
                        <div class="nes-container is-dark is-rounded mb-1 p-1">
                            <p class="text-xs truncate">{{ selectedAddress() }}</p>
                        </div>

                        <!-- Messages -->
                        <div class="nes-container is-dark is-rounded flex-1 overflow-auto mb-1">
                            @for (msg of selectedMessages(); track msg.id) {
                                <div class="message-bubble nes-container is-rounded" [class.sent]="msg.direction === 'sent'" [class.received]="msg.direction === 'received'">
                                    @if (msg.replyContext) {
                                        <div class="reply-quote">{{ msg.replyContext.preview }}</div>
                                    }
                                    <p class="text-sm">{{ msg.content }}</p>
                                    <p class="text-xs text-muted">{{ msg.timestamp | date:'short' }}</p>
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
                                    class="nes-btn is-success"
                                    [class.is-disabled]="!canSend()"
                                    [disabled]="!canSend()"
                                    (click)="sendMessage()"
                                >
                                    Send
                                </button>
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
        </div>
    `,
})
export class ChatComponent implements OnInit {
    protected readonly wallet = inject(WalletService);
    private readonly chatService = inject(ChatService);
    private readonly router = inject(Router);

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

    protected readonly canPublishKey = computed(() => this.balance() >= 100_000n);

    protected readonly formattedBalance = computed(() => {
        const bal = this.balance();
        return (Number(bal) / 1_000_000).toFixed(3) + ' ALGO';
    });

    protected readonly canSend = computed(() => {
        return this.newMessage().trim().length > 0 && this.selectedAddress() !== null;
    });

    async ngOnInit(): Promise<void> {
        if (!this.wallet.connected()) {
            this.router.navigate(['/login']);
            return;
        }

        await this.loadData();
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

        const txid = await this.chatService.sendMessage(address, pubKey, message);

        if (txid) {
            this.newMessage.set('');

            // Add optimistic message
            const newMsg: Message = {
                id: txid,
                sender: this.wallet.address(),
                recipient: address,
                content: message,
                timestamp: new Date(),
                confirmedRound: 0,
                direction: 'sent',
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
        this.wallet.disconnect();
        this.router.navigate(['/login']);
    }

    protected truncateAddress(address: string): string {
        if (address.length <= 12) return address;
        return address.slice(0, 6) + '...' + address.slice(-4);
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
}
