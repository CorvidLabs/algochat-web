import { Injectable, inject, signal } from '@angular/core';
import algosdk from 'algosdk';
import { WalletService } from './wallet.service';
import { encryptMessage, decryptMessage, encodeEnvelope, decodeEnvelope, isChatMessage } from '../crypto';
import type { Message, Conversation } from '../types';

const TESTNET_ALGOD = 'https://testnet-api.algonode.cloud';
const TESTNET_INDEXER = 'https://testnet-idx.algonode.cloud';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly wallet = inject(WalletService);
    private readonly algodClient = new algosdk.Algodv2('', TESTNET_ALGOD, '');
    private readonly indexerClient = new algosdk.Indexer('', TESTNET_INDEXER, '');

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
            const envelope = encryptMessage(
                message,
                account.encryptionKeys.privateKey,
                account.encryptionKeys.publicKey,
                recipientPublicKey
            );

            const note = encodeEnvelope(envelope);
            const params = await this.algodClient.getTransactionParams().do();

            const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                sender: account.address,
                receiver: recipientAddress,
                amount: 1000,
                note,
                suggestedParams: params,
            });

            const signedTxn = txn.signTxn(account.account.sk);
            const { txid } = await this.algodClient.sendRawTransaction(signedTxn).do();

            return txid;
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
            const response = await this.indexerClient
                .searchForTransactions()
                .address(account.address)
                .limit(limit)
                .do();

            const messages: Message[] = [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const tx of (response.transactions || []) as any[]) {
                if (tx.txType !== 'pay' || !tx.note) continue;

                const noteBytes = base64ToBytes(tx.note);
                if (!isChatMessage(noteBytes)) continue;

                const sender: string = tx.sender;
                const receiver: string | undefined = tx.paymentTransaction?.receiver;
                if (!receiver) continue;

                let direction: 'sent' | 'received';

                if (sender === account.address) {
                    if (receiver !== participantAddress) continue;
                    direction = 'sent';
                } else {
                    if (sender !== participantAddress) continue;
                    if (receiver !== account.address) continue;
                    direction = 'received';
                }

                try {
                    const envelope = decodeEnvelope(noteBytes);
                    const decrypted = decryptMessage(
                        envelope,
                        account.encryptionKeys.privateKey,
                        account.encryptionKeys.publicKey
                    );

                    if (!decrypted) continue;

                    // Skip key-publish messages
                    if (decrypted.text === 'key-publish') continue;

                    console.log('[fetchMessages] Found message:', decrypted.text.substring(0, 20));

                    messages.push({
                        id: tx.id,
                        sender,
                        recipient: receiver,
                        content: decrypted.text,
                        timestamp: new Date((tx.roundTime ?? 0) * 1000),
                        confirmedRound: tx.confirmedRound ?? 0,
                        direction,
                        replyContext: decrypted.replyToId
                            ? { messageId: decrypted.replyToId, preview: decrypted.replyToPreview || '' }
                            : undefined,
                    });
                } catch {
                    continue;
                }
            }

            return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to fetch messages');
            return [];
        } finally {
            this.loading.set(false);
        }
    }

    async discoverPublicKey(address: string): Promise<Uint8Array | null> {
        console.log('[discoverPublicKey] Looking up:', address);

        // If looking up our own address, return our key directly
        const account = this.wallet.account();
        console.log('[discoverPublicKey] Our address:', account?.address);
        console.log('[discoverPublicKey] Match self?', account && address === account.address);

        if (account && address === account.address) {
            console.log('[discoverPublicKey] Returning own key directly');
            return account.encryptionKeys.publicKey;
        }

        try {
            console.log('[discoverPublicKey] Querying indexer...');
            const response = await this.indexerClient
                .searchForTransactions()
                .address(address)
                .limit(200)
                .do();

            console.log('[discoverPublicKey] Found transactions:', response.transactions?.length ?? 0);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const tx of (response.transactions || []) as any[]) {
                if (tx.sender !== address || !tx.note) continue;

                const noteBytes = base64ToBytes(tx.note);
                if (!isChatMessage(noteBytes)) continue;

                try {
                    const envelope = decodeEnvelope(noteBytes);
                    console.log('[discoverPublicKey] Found key in tx:', tx.id);
                    return envelope.senderPublicKey;
                } catch {
                    continue;
                }
            }

            console.log('[discoverPublicKey] No key found');
            return null;
        } catch (err) {
            console.error('[discoverPublicKey] Error:', err);
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
            // Send a self-transaction with our public key embedded
            const envelope = encryptMessage(
                'key-publish',
                account.encryptionKeys.privateKey,
                account.encryptionKeys.publicKey,
                account.encryptionKeys.publicKey // encrypt to self
            );

            const note = encodeEnvelope(envelope);
            const params = await this.algodClient.getTransactionParams().do();

            const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                sender: account.address,
                receiver: account.address, // self-transaction
                amount: 0,
                note,
                suggestedParams: params,
            });

            const signedTxn = txn.signTxn(account.account.sk);
            const { txid } = await this.algodClient.sendRawTransaction(signedTxn).do();

            return txid;
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
            const info = await this.algodClient.accountInformation(account.address).do();
            return info.amount;
        } catch {
            return 0n;
        }
    }

    async fetchConversations(): Promise<Conversation[]> {
        const account = this.wallet.account();
        console.log('[fetchConversations] Account:', account?.address ?? 'null');

        if (!account) {
            console.log('[fetchConversations] No account, returning empty');
            return [];
        }

        try {
            console.log('[fetchConversations] Querying indexer for:', account.address);
            const response = await this.indexerClient
                .searchForTransactions()
                .address(account.address)
                .limit(100)
                .do();

            console.log('[fetchConversations] Found transactions:', response.transactions?.length ?? 0);

            const conversationsMap = new Map<string, Conversation>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const tx of (response.transactions || []) as any[]) {
                if (tx.txType !== 'pay' || !tx.note) continue;

                const noteBytes = base64ToBytes(tx.note);
                if (!isChatMessage(noteBytes)) continue;

                const sender: string = tx.sender;
                const receiver: string | undefined = tx.paymentTransaction?.receiver;
                if (!receiver) continue;

                try {
                    const envelope = decodeEnvelope(noteBytes);
                    const decrypted = decryptMessage(
                        envelope,
                        account.encryptionKeys.privateKey,
                        account.encryptionKeys.publicKey
                    );

                    if (!decrypted) continue;

                    // Skip key-publish transactions (self-tx with "key-publish" content)
                    if (sender === receiver && decrypted.text === 'key-publish') continue;

                    const otherParty = sender === account.address ? receiver : sender;
                    const direction: 'sent' | 'received' = sender === account.address ? 'sent' : 'received';

                    const message: Message = {
                        id: tx.id,
                        sender,
                        recipient: receiver,
                        content: decrypted.text,
                        timestamp: new Date((tx.roundTime ?? 0) * 1000),
                        confirmedRound: tx.confirmedRound ?? 0,
                        direction,
                    };

                    if (!conversationsMap.has(otherParty)) {
                        conversationsMap.set(otherParty, {
                            participant: otherParty,
                            messages: [],
                        });
                    }

                    conversationsMap.get(otherParty)!.messages.push(message);

                    // Store public key if we received a message
                    if (direction === 'received') {
                        const conv = conversationsMap.get(otherParty)!;
                        conv.participantPublicKey = envelope.senderPublicKey;
                    }
                } catch {
                    continue;
                }
            }

            // Sort messages and conversations
            const conversations = Array.from(conversationsMap.values());
            for (const conv of conversations) {
                conv.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            }

            // Sort by most recent message
            conversations.sort((a, b) => {
                const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
                const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
                return bLast - aLast;
            });

            console.log('[fetchConversations] Returning', conversations.length, 'conversations');
            return conversations;
        } catch (err) {
            console.error('[fetchConversations] Error:', err);
            return [];
        }
    }
}

function base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
