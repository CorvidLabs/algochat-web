import { Injectable, inject, signal } from '@angular/core';
import { WalletService } from './wallet.service';
import {
    AlgorandService,
    type Message,
    type Conversation,
    decryptMessage,
    decodeEnvelope,
    isChatMessage,
} from 'ts-algochat';

const MAINNET_CONFIG = {
    algodToken: '',
    algodServer: 'https://mainnet-api.algonode.cloud',
    indexerToken: '',
    indexerServer: 'https://mainnet-idx.algonode.cloud',
};

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly wallet = inject(WalletService);
    private readonly algorand = new AlgorandService(MAINNET_CONFIG);

    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    async sendMessage(
        recipientAddress: string,
        recipientPublicKey: Uint8Array,
        message: string
    ): Promise<string | null> {
        const account = this.wallet.account();
        if (!account) {
            this.error.set('Not connected');
            return null;
        }

        this.loading.set(true);
        this.error.set(null);

        try {
            const result = await this.algorand.sendMessage(
                account,
                recipientAddress,
                recipientPublicKey,
                message
            );
            return result.txid;
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to send message');
            return null;
        } finally {
            this.loading.set(false);
        }
    }

    async fetchMessages(participantAddress: string, limit = 50): Promise<Message[]> {
        const account = this.wallet.account();
        if (!account) return [];

        this.loading.set(true);
        this.error.set(null);

        try {
            return await this.algorand.fetchMessages(account, participantAddress, undefined, limit);
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to fetch messages');
            return [];
        } finally {
            this.loading.set(false);
        }
    }

    async discoverPublicKey(address: string): Promise<Uint8Array | null> {
        const account = this.wallet.account();

        // Return own key directly
        if (account && address === account.address) {
            return account.encryptionKeys.publicKey;
        }

        try {
            return await this.algorand.discoverPublicKey(address);
        } catch {
            return null;
        }
    }

    async hasPublishedKey(): Promise<boolean> {
        const account = this.wallet.account();
        if (!account) return false;

        const pubKey = await this.discoverPublicKey(account.address);
        return pubKey !== null;
    }

    async publishKey(): Promise<string | null> {
        const account = this.wallet.account();
        if (!account) {
            this.error.set('Not connected');
            return null;
        }

        this.loading.set(true);
        this.error.set(null);

        try {
            return await this.algorand.publishKey(account);
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to publish key');
            return null;
        } finally {
            this.loading.set(false);
        }
    }

    async getBalance(): Promise<bigint> {
        const account = this.wallet.account();
        if (!account) return 0n;

        try {
            return await this.algorand.getBalance(account.address);
        } catch {
            return 0n;
        }
    }

    async fetchConversations(): Promise<Conversation[]> {
        const account = this.wallet.account();
        if (!account) return [];

        try {
            // Fetch all messages, then group by participant
            // Note: AlgorandService.fetchMessages requires a participant, so we need
            // to query the indexer directly for conversation discovery
            const response = await fetch(
                `${MAINNET_CONFIG.indexerServer}/v2/accounts/${account.address}/transactions?limit=100`
            );
            const data = await response.json();

            const conversationsMap = new Map<string, Conversation>();

            for (const tx of data.transactions ?? []) {
                if (tx['tx-type'] !== 'pay' || !tx.note) continue;

                const noteBytes = base64UrlToBytes(tx.note);
                if (!isChatMessage(noteBytes)) continue;

                const sender: string = tx.sender;
                const receiver: string | undefined = tx['payment-transaction']?.receiver;
                if (!receiver) continue;

                try {
                    const envelope = decodeEnvelope(noteBytes);
                    const decrypted = decryptMessage(
                        envelope,
                        account.encryptionKeys.privateKey,
                        account.encryptionKeys.publicKey
                    );

                    if (!decrypted) continue;
                    if (sender === receiver && decrypted.text === 'key-publish') continue;

                    const otherParty = sender === account.address ? receiver : sender;
                    const direction: 'sent' | 'received' = sender === account.address ? 'sent' : 'received';

                    const message: Message = {
                        id: tx.id,
                        sender,
                        recipient: receiver,
                        content: decrypted.text,
                        timestamp: new Date((tx['round-time'] ?? 0) * 1000),
                        confirmedRound: tx['confirmed-round'] ?? 0,
                        direction,
                    };

                    if (!conversationsMap.has(otherParty)) {
                        conversationsMap.set(otherParty, {
                            participant: otherParty,
                            messages: [],
                        });
                    }

                    conversationsMap.get(otherParty)!.messages.push(message);

                    if (direction === 'received') {
                        const conv = conversationsMap.get(otherParty)!;
                        conv.participantPublicKey = envelope.senderPublicKey;
                    }
                } catch {
                    continue;
                }
            }

            const conversations = Array.from(conversationsMap.values());
            for (const conv of conversations) {
                conv.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            }

            conversations.sort((a, b) => {
                const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
                const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
                return bLast - aLast;
            });

            return conversations;
        } catch {
            return [];
        }
    }
}

function base64UrlToBytes(base64: string | Uint8Array): Uint8Array {
    if (base64 instanceof Uint8Array) return base64;
    if (typeof base64 !== 'string') return new Uint8Array(0);

    const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standardBase64 + '='.repeat((4 - (standardBase64.length % 4)) % 4);

    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
