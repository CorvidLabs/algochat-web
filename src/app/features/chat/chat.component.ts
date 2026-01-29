import { Component, inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { WalletService } from '../../core/services/wallet.service';
import { ChatService } from '../../core/services/chat.service';
import { ContactSettingsService } from '../../core/services/contact-settings.service';
import { PSKService } from '../../core/services/psk.service';
import { ContactSettingsDialogComponent } from './contact-settings-dialog.component';
import type { Message, ConversationData as Conversation } from '@corvidlabs/ts-algochat';
import QRCode from 'qrcode';

@Component({
    selector: 'app-chat',
    imports: [FormsModule, DatePipe, RouterLink, ContactSettingsDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="app-container">
            <!-- Header -->
            <header class="app-header">
                <section class="nes-container is-dark is-rounded flex items-center justify-between p-1">
                    <div class="flex items-center gap-1">
                        <i class="nes-icon coin is-small hide-mobile"></i>
                        <span class="text-success">AlgoChat</span>
                        <div class="info-menu-wrapper">
                            <button
                                class="nes-btn info-btn"
                                title="Info & Legal"
                                (click)="showInfoMenu.set(!showInfoMenu())"
                            >?</button>
                            @if (showInfoMenu()) {
                                <div class="info-menu">
                                    <a routerLink="/protocol" class="info-menu-item" (click)="showInfoMenu.set(false)">Protocol Spec</a>
                                    <a routerLink="/terms" class="info-menu-item" (click)="showInfoMenu.set(false)">Terms of Service</a>
                                    <a routerLink="/privacy" class="info-menu-item" (click)="showInfoMenu.set(false)">Privacy Policy</a>
                                    <a href="https://github.com/CorvidLabs/algochat-web" target="_blank" class="info-menu-item">GitHub</a>
                                </div>
                            }
                        </div>
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
                        <button
                            class="nes-btn qr-btn"
                            title="Show QR Code"
                            (click)="showQRCode()"
                        >
                            <span class="qr-icon">QR</span>
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
            <main class="app-main" [class.fullscreen]="isFullscreen()">
                <!-- Sidebar -->
                <aside class="sidebar" [class.mobile-hidden]="selectedAddress()" [class.hidden]="isFullscreen()">
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
                                    [class.self-chat]="isSelfChat(conv.participant)"
                                    (click)="selectConversation(conv)"
                                    (contextmenu)="onConversationContextMenu($event, conv.participant)"
                                    (touchstart)="onTouchStart($event, conv.participant)"
                                    (touchend)="onTouchEnd()"
                                    (touchmove)="onTouchEnd()"
                                >
                                    <p class="conv-address truncate">
                                        @if (isSelfChat(conv.participant)) {
                                            <i class="nes-icon is-small like favorite-star"></i>
                                        } @else if (contactSettings.isFavorite(conv.participant)) {
                                            <i class="nes-icon is-small star favorite-star"></i>
                                        }
                                        @if (pskService.hasPSK(conv.participant)) {
                                            <span class="psk-lock" title="Secure channel — messages use enhanced encryption (ECDH + PSK)">&#x1f6e1;</span>
                                        }
                                        {{ getDisplayName(conv.participant) }}
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
                                    @if (isSelfChat(selectedAddress()!)) {
                                        <i class="nes-icon is-small like favorite-star"></i>
                                    } @else if (contactSettings.isFavorite(selectedAddress()!)) {
                                        <i class="nes-icon is-small star favorite-star"></i>
                                    }
                                    {{ getDisplayName(selectedAddress()!) }}
                                    @if (pskService.hasPSK(selectedAddress()!)) {
                                        <span class="psk-header-badge" title="This conversation uses enhanced encryption (ECDH + Pre-Shared Key)">&#x1f6e1; Secured</span>
                                    }
                                </p>
                                @if (!isSelfChat(selectedAddress()!) && contactSettings.getSettings(selectedAddress()!).nickname) {
                                    <p class="text-xs text-muted truncate">{{ truncateAddress(selectedAddress()!) }}</p>
                                }
                            </div>
                            <button
                                class="nes-btn chat-header-btn"
                                [title]="isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'"
                                (click)="toggleFullscreen()"
                            >
                                @if (isFullscreen()) {
                                    <span>[]</span>
                                } @else {
                                    <span>[ ]</span>
                                }
                            </button>
                            <button
                                class="nes-btn chat-header-btn"
                                title="Contact settings"
                                (click)="openContactSettings(selectedAddress()!)"
                            >
                                <span>...</span>
                            </button>
                        </div>

                        <!-- Messages -->
                        <div class="messages-wrapper">
                            <div #messagesContainer class="nes-container is-dark is-rounded flex-1 mb-1 messages-container" (scroll)="onMessagesScroll($event)">
                            @if (loadingMoreMessages()) {
                                <div class="loading-more text-center p-1">
                                    <span class="loading-dots">Loading older messages...</span>
                                </div>
                            }
                            @for (msg of selectedMessages(); track msg.id) {
                                @if (hasContent(msg)) {
                                    <div class="message-bubble nes-container is-rounded"
                                         [class.sent]="msg.direction === 'sent'"
                                         [class.received]="msg.direction === 'received'"
                                         [class.pending]="isPending(msg)">
                                        @if (msg.replyContext) {
                                            <div class="reply-quote">{{ msg.replyContext.preview }}</div>
                                        }
                                        <p class="message-content">{{ msg.content }}</p>
                                        <div class="message-footer">
                                            @if (isProtocolPSK(msg)) {
                                                <span class="protocol-badge psk" title="Encrypted with ECDH + Pre-Shared Key (v1.1)">
                                                    &#x1f6e1; Secured
                                                </span>
                                            }
                                            @if (hasAmount(msg)) {
                                                <span class="message-amount" [class.sent]="msg.direction === 'sent'" [class.received]="msg.direction === 'received'">
                                                    {{ msg.direction === 'sent' ? '-' : '+' }}{{ formatMicroAlgos(msg.amount!) }} ALGO
                                                </span>
                                            }
                                            @if (isPending(msg)) {
                                                <span class="message-status pending">
                                                    <span class="sending-spinner"></span>
                                                    Sending...
                                                </span>
                                            } @else if (isFailed(msg)) {
                                                <span class="message-status failed">Failed</span>
                                            } @else {
                                                <span class="message-time">{{ msg.timestamp | date:'short' }}</span>
                                            }
                                        </div>
                                    </div>
                                }
                            } @empty {
                                <div class="empty-state h-full">
                                    <i class="nes-icon is-large comment"></i>
                                    <p class="text-xs">No messages yet</p>
                                </div>
                            }
                            </div>

                            @if (hasNewMessages()) {
                                <button
                                    class="new-messages-btn nes-btn is-primary"
                                    (click)="scrollToNewMessages()"
                                >
                                    New messages
                                </button>
                            }
                        </div>

                        <!-- Input -->
                        <div class="nes-container is-dark is-rounded p-1">
                            <div class="flex gap-1">
                                <textarea
                                    class="nes-textarea is-dark flex-1"
                                    rows="2"
                                    [ngModel]="newMessage()"
                                    (ngModelChange)="newMessage.set($event)"
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
                                    <div class="algo-amount-badge" [class.is-error]="sendAmountExceedsBalance()">
                                        <span class="algo-amount-value">{{ formatAlgo(sendAmount()!) }} ALGO</span>
                                        <button
                                            type="button"
                                            class="algo-amount-clear"
                                            title="Remove ALGO"
                                            (click)="sendAmount.set(null)"
                                        >X</button>
                                    </div>
                                    @if (sendAmountExceedsBalance()) {
                                        <span class="algo-amount-error">
                                            Max: {{ formatAlgo(maxSendableAlgo()) }} ALGO
                                        </span>
                                    }
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
                                            [ngModel]="algoInputValue()"
                                            (ngModelChange)="algoInputValue.set($event)"
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
                                @if (keyPublished() === false) {
                                    <i class="nes-icon is-large star"></i>
                                    <p class="text-sm text-warning mb-1">Publish Your Key</p>
                                    <p class="text-xs text-muted mb-2 onboarding-text">
                                        Before others can message you, you need to publish your encryption key to the blockchain.
                                        This costs ~0.001 ALGO and only needs to be done once.
                                    </p>
                                    @if (canPublishKey()) {
                                        <button
                                            class="nes-btn is-warning"
                                            [class.is-disabled]="publishing()"
                                            [disabled]="publishing()"
                                            (click)="publishKey()"
                                        >
                                            @if (publishing()) {
                                                <span class="loading-dots">Publishing...</span>
                                            } @else {
                                                Publish Key
                                            }
                                        </button>
                                    } @else {
                                        <p class="text-xs text-error">Need at least 0.1 ALGO to publish</p>
                                    }
                                } @else {
                                    <i class="nes-icon is-large star"></i>
                                    <p class="text-sm">Select a conversation or start a new chat</p>
                                }
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
                                [ngModel]="newChatAddress()"
                                (ngModelChange)="newChatAddress.set($event)"
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
                    [isSelfChat]="isSelfChat(contactSettingsAddress()!)"
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

            <!-- QR Code Dialog -->
            @if (showQRDialog()) {
                <div class="nes-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-title" (click)="onQROverlayClick($event)">
                    <section class="nes-container is-dark is-rounded dialog-box qr-dialog">
                        <h3 id="qr-title" class="mb-2 text-warning">Your Address</h3>

                        <div class="qr-code-container">
                            @if (qrCodeDataUrl()) {
                                <img [src]="qrCodeDataUrl()" alt="QR Code for wallet address" class="qr-code-img" />
                            } @else {
                                <div class="qr-loading">
                                    <span class="loading-dots">Generating...</span>
                                </div>
                            }
                        </div>

                        <p class="text-xs text-center word-break mt-1 qr-address">{{ wallet.address() }}</p>

                        <div class="flex gap-1 justify-center mt-2">
                            <button class="nes-btn is-primary" (click)="copyAddress(); showQRDialog.set(false)">
                                Copy
                            </button>
                            <button class="nes-btn" (click)="showQRDialog.set(false)">Close</button>
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
    protected readonly pskService = inject(PSKService);
    private readonly cdr = inject(ChangeDetectorRef);

    private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

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
    protected readonly pendingMessages = signal<Set<string>>(new Set());
    protected readonly failedMessages = signal<Set<string>>(new Set());
    private readonly optimisticPskIds = signal<Set<string>>(new Set());
    protected readonly contactSettingsAddress = signal<string | null>(null);
    protected readonly showBlockedContacts = signal(false);
    protected readonly showInfoMenu = signal(false);
    protected readonly showQRDialog = signal(false);
    protected readonly qrCodeDataUrl = signal<string | null>(null);

    // Pagination state
    protected readonly hasMoreMessages = signal(true);
    protected readonly loadingMoreMessages = signal(false);

    // Fullscreen mode
    protected readonly isFullscreen = signal(false);

    // New messages indicator
    protected readonly hasNewMessages = signal(false);
    private lastSeenMessageId: string | null = null;
    private isNearBottom = true;

    private static readonly SELECTED_CONVO_KEY = 'algochat_selected_conversation';

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
        const myAddress = this.wallet.address();
        let convos = this.conversations()
            .filter(c => !this.contactSettings.isBlocked(c.participant));

        // Ensure Notes (self-chat) is always present
        if (myAddress && !convos.some(c => c.participant === myAddress)) {
            convos = [{ participant: myAddress, messages: [] }, ...convos];
        }

        return convos.sort((a, b) => {
            // Self-chat (Notes) always first
            const aSelf = a.participant === myAddress ? 0 : 1;
            const bSelf = b.participant === myAddress ? 0 : 1;
            if (aSelf !== bSelf) return aSelf - bSelf;
            // Then favorites
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

    // Algorand constants (in microAlgos)
    private static readonly MIN_BALANCE = 100_000n; // 0.1 ALGO
    private static readonly TX_FEE = 1_000n; // 0.001 ALGO

    protected readonly canPublishKey = computed(() => this.balance() >= 100_000n);

    protected readonly formattedBalance = computed(() => {
        const bal = this.balance();
        return (Number(bal) / 1_000_000).toFixed(3) + ' ALGO';
    });

    /** Maximum ALGO that can be sent (balance - min balance - fee) */
    protected readonly maxSendableAlgo = computed(() => {
        const bal = this.balance();
        const reserved = ChatComponent.MIN_BALANCE + ChatComponent.TX_FEE;
        if (bal <= reserved) return 0;
        return Number(bal - reserved) / 1_000_000;
    });

    /** Check if the selected send amount exceeds what can be sent */
    protected readonly sendAmountExceedsBalance = computed(() => {
        const amount = this.sendAmount();
        if (!amount) return false;
        return amount > this.maxSendableAlgo();
    });

    protected readonly canSend = computed(() => {
        const hasMessage = this.newMessage().trim().length > 0;
        const hasRecipient = this.selectedAddress() !== null;
        const withinBudget = !this.sendAmountExceedsBalance();
        return hasMessage && hasRecipient && withinBudget;
    });

    async ngOnInit(): Promise<void> {
        // Initialize services (requires wallet to be connected for encryption)
        await this.contactSettings.initialize();
        await this.pskService.initialize();

        // Auto-generate PSK for self-chat (Notes) so it always uses the most secure protocol
        const myAddress = this.wallet.address();
        if (myAddress && !this.pskService.hasPSK(myAddress)) {
            const psk = this.pskService.generatePSK();
            this.pskService.storePSK(myAddress, psk);
        }

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
            // Check for new received messages
            const currentMessages = this.selectedMessages();
            const currentIds = new Set(currentMessages.map(m => m.id));
            const newReceivedMessages = messages.filter(
                m => !currentIds.has(m.id) && m.direction === 'received'
            );

            this.selectedMessages.set(messages);

            // Show indicator if there are new received messages and user isn't at bottom
            if (newReceivedMessages.length > 0 && !this.isNearBottom) {
                this.hasNewMessages.set(true);
            }
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

        // Restore selected conversation after data loads
        this.restoreSelectedConversation();
    }

    protected async selectConversation(conv: Conversation): Promise<void> {
        this.selectedAddress.set(conv.participant);
        this.selectedMessages.set(conv.messages);

        // Reset pagination state
        this.hasMoreMessages.set(true);
        this.loadingMoreMessages.set(false);

        // Save to localStorage
        this.saveSelectedConversation(conv.participant);

        // Scroll to bottom after initial messages load
        this.cdr.detectChanges();
        this.scrollToBottom();

        // Refresh messages
        const messages = await this.chatService.fetchMessages(conv.participant);
        this.selectedMessages.set(messages);

        // Scroll again after fresh messages loaded
        this.cdr.detectChanges();
        this.scrollToBottom();
    }

    protected async sendMessage(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
        }

        const address = this.selectedAddress();
        const message = this.newMessage().trim();

        if (!address || !message) return;

        // Auto-publish our key if not yet published and we have balance
        if (!this.keyPublished() && this.canPublishKey()) {
            await this.publishKey();
        }

        // Find recipient public key
        const conv = this.conversations().find((c) => c.participant === address);
        let pubKey = conv?.participantPublicKey;

        if (!pubKey) {
            pubKey = (await this.chatService.discoverPublicKey(address)) ?? undefined;
        }

        if (!pubKey) {
            alert(
                'Cannot find recipient\'s encryption key.\n\n' +
                'They need to publish their key first by clicking the star button in their header, ' +
                'or send a message to someone.'
            );
            return;
        }

        // Calculate amount in microAlgos (default 0 ALGO)
        const amountAlgo = this.sendAmount();
        const amountMicroAlgos = amountAlgo ? Math.floor(amountAlgo * 1_000_000) : undefined;

        // Generate a temporary ID for optimistic update
        const tempId = `pending-${Date.now()}`;

        // Add optimistic message immediately
        const newMsg: Message = {
            id: tempId,
            sender: this.wallet.address(),
            recipient: address,
            content: message,
            timestamp: new Date(),
            confirmedRound: 0,
            direction: 'sent',
            amount: amountMicroAlgos ?? 0,
        };

        this.selectedMessages.update((msgs) => [...msgs, newMsg]);
        this.pendingMessages.update((set) => new Set(set).add(tempId));
        // Mark optimistic message as PSK if secure channel is active
        if (this.pskService.hasPSK(address)) {
            this.optimisticPskIds.update(set => new Set(set).add(tempId));
        }
        this.newMessage.set('');
        this.sendAmount.set(null);

        // Force change detection and scroll after render
        this.cdr.detectChanges();
        this.scrollToBottom();

        // Send the message
        try {
            const txid = await this.chatService.sendMessage(address, pubKey, message, amountMicroAlgos);

            if (txid) {
                // Update the message with real txid and remove from pending
                this.selectedMessages.update((msgs) =>
                    msgs.map((m) => (m.id === tempId ? { ...m, id: txid } : m))
                );
                this.pendingMessages.update((set) => {
                    const newSet = new Set(set);
                    newSet.delete(tempId);
                    return newSet;
                });
                this.optimisticPskIds.update(set => {
                    const newSet = new Set(set);
                    newSet.delete(tempId);
                    return newSet;
                });
            } else {
                // Mark as failed and log the error from chatService
                const serviceError = this.chatService.error();
                console.error('[AlgoChat] Failed to send message:', serviceError ?? 'Unknown error');
                this.pendingMessages.update((set) => {
                    const newSet = new Set(set);
                    newSet.delete(tempId);
                    return newSet;
                });
                this.failedMessages.update((set) => new Set(set).add(tempId));
            }
        } catch (error) {
            // Mark as failed and log the error
            console.error('[AlgoChat] Failed to send message:', error);
            this.pendingMessages.update((set) => {
                const newSet = new Set(set);
                newSet.delete(tempId);
                return newSet;
            });
            this.failedMessages.update((set) => new Set(set).add(tempId));
        }
    }

    protected isPending(msg: Message): boolean {
        return this.pendingMessages().has(msg.id);
    }

    protected isFailed(msg: Message): boolean {
        return this.failedMessages().has(msg.id);
    }

    protected isProtocolPSK(msg: Message): boolean {
        return this.chatService.isPSKMessageId(msg.id) || this.optimisticPskIds().has(msg.id);
    }

    protected hasContent(msg: Message): boolean {
        // Filter out messages with no content, empty content, or key-publish messages
        if (!msg.content) return false;
        if (typeof msg.content !== 'string') return false;
        const trimmed = msg.content.trim();
        if (!trimmed) return false;
        // Filter out key-publish JSON
        if (trimmed.startsWith('{') && trimmed.includes('key-publish')) return false;
        return true;
    }

    protected hasAmount(msg: Message): boolean {
        if (!msg.amount) return false;
        const amount = typeof msg.amount === 'bigint' ? Number(msg.amount) : msg.amount;
        return amount > 0;
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
        this.pskService.clear();
        localStorage.removeItem(ChatComponent.SELECTED_CONVO_KEY);
        this.wallet.disconnect();
        this.router.navigate(['/login']);
    }

    protected truncateAddress(address: string): string {
        if (address.length <= 12) return address;
        return address.slice(0, 6) + '...' + address.slice(-4);
    }

    protected getDisplayName(address: string): string {
        if (address === this.wallet.address()) {
            return 'Notes';
        }
        return this.contactSettings.getDisplayName(address);
    }

    protected isSelfChat(address: string): boolean {
        return address === this.wallet.address();
    }

    protected goBack(): void {
        this.selectedAddress.set(null);
        this.selectedMessages.set([]);
        localStorage.removeItem(ChatComponent.SELECTED_CONVO_KEY);
    }

    protected async copyAddress(): Promise<void> {
        await navigator.clipboard.writeText(this.wallet.address());
        this.addressCopied.set(true);
        setTimeout(() => this.addressCopied.set(false), 1500);
    }

    protected async showQRCode(): Promise<void> {
        this.showQRDialog.set(true);
        this.qrCodeDataUrl.set(null);

        try {
            const dataUrl = await QRCode.toDataURL(this.wallet.address(), {
                width: 200,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff',
                },
            });
            this.qrCodeDataUrl.set(dataUrl);
            this.cdr.detectChanges();
        } catch (err) {
            console.error('[AlgoChat] Failed to generate QR code:', err);
        }
    }

    protected onQROverlayClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('nes-dialog-overlay')) {
            this.showQRDialog.set(false);
        }
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

    protected formatMicroAlgos(microAlgos: number | bigint): string {
        // Convert microAlgos to ALGO and format (handle both number and BigInt)
        const amount = typeof microAlgos === 'bigint' ? Number(microAlgos) : microAlgos;
        const algo = amount / 1_000_000;
        return algo.toFixed(6).replace(/\.?0+$/, '');
    }

    protected cancelAlgoInput(): void {
        this.showAlgoInput.set(false);
        this.algoInputValue.set(null);
    }

    private scrollToBottom(): void {
        // Use requestAnimationFrame to ensure DOM is fully updated
        requestAnimationFrame(() => {
            const container = this.messagesContainer()?.nativeElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    }

    private saveSelectedConversation(address: string): void {
        localStorage.setItem(ChatComponent.SELECTED_CONVO_KEY, address);
    }

    private restoreSelectedConversation(): void {
        const saved = localStorage.getItem(ChatComponent.SELECTED_CONVO_KEY);
        if (saved) {
            const conv = this.conversations().find(c => c.participant === saved);
            if (conv) {
                this.selectConversation(conv);
            }
        }
    }

    protected onMessagesScroll(event: Event): void {
        const container = event.target as HTMLElement;

        // Track if user is near bottom (within 100px)
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        this.isNearBottom = distanceFromBottom < 100;

        // Clear new messages indicator when user scrolls to bottom
        if (this.isNearBottom && this.hasNewMessages()) {
            this.hasNewMessages.set(false);
        }

        // If scrolled near top (within 100px), load more
        if (container.scrollTop < 100 && this.hasMoreMessages() && !this.loadingMoreMessages()) {
            this.loadMoreMessages();
        }
    }

    protected scrollToNewMessages(): void {
        this.scrollToBottom();
        this.hasNewMessages.set(false);
    }

    protected toggleFullscreen(): void {
        this.isFullscreen.update(v => !v);
    }

    protected async loadMoreMessages(): Promise<void> {
        const address = this.selectedAddress();
        if (!address) return;

        this.loadingMoreMessages.set(true);

        const currentMessages = this.selectedMessages();
        // Filter out pending messages (confirmedRound = 0) when finding oldest
        const confirmedMessages = currentMessages.filter(m => {
            const round = typeof m.confirmedRound === 'bigint' ? Number(m.confirmedRound) : m.confirmedRound;
            return round > 0;
        });
        if (confirmedMessages.length === 0) {
            this.loadingMoreMessages.set(false);
            this.hasMoreMessages.set(false);
            return;
        }

        // Convert BigInt to number for Math.min
        const rounds = confirmedMessages.map(m =>
            typeof m.confirmedRound === 'bigint' ? Number(m.confirmedRound) : m.confirmedRound
        );
        const oldestRound = Math.min(...rounds);

        // Fetch older messages
        const olderMessages = await this.chatService.fetchMessagesBefore(address, oldestRound, 50);

        if (olderMessages.length < 50) {
            this.hasMoreMessages.set(false);
        }

        if (olderMessages.length > 0) {
            // Preserve scroll position when prepending
            const container = this.messagesContainer()?.nativeElement;
            const previousHeight = container?.scrollHeight ?? 0;

            // Prepend older messages (dedupe by id)
            const existingIds = new Set(currentMessages.map(m => m.id));
            const newMessages = olderMessages.filter(m => !existingIds.has(m.id));
            this.selectedMessages.update(msgs => [...newMessages, ...msgs]);

            // Restore scroll position after render
            this.cdr.detectChanges();
            if (container) {
                const newHeight = container.scrollHeight;
                container.scrollTop = newHeight - previousHeight;
            }
        }

        this.loadingMoreMessages.set(false);
    }
}
