import { Injectable, inject, signal, effect } from '@angular/core';
import { WalletService } from './wallet.service';
import { PSKService } from './psk.service';
import { NetworkService } from './network.service';
import algosdk from 'algosdk';
import {
    AlgorandService,
    isChatMessage,
    decodeEnvelope,
    decryptMessage,
    isPSKMessage,
    decodePSKEnvelope,
    decryptPSKMessage,
    derivePSKAtCounter,
    encryptPSKMessage,
    encodePSKEnvelope,
    advanceSendCounter,
    validateCounter,
    recordReceive,
    type Message,
    type ConversationData as Conversation,
} from '@corvidlabs/ts-algochat';

/** Extract indexer transaction fields safely (algosdk v3 uses index signatures). */
function txField<Result>(tx: unknown, field: string): Result {
    return (tx as Record<string, unknown>)[field] as Result;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly wallet = inject(WalletService);
    private readonly pskService = inject(PSKService);
    private readonly networkService = inject(NetworkService);

    private algorand!: AlgorandService;
    private algodClient!: algosdk.Algodv2;
    private indexerClient!: algosdk.Indexer;

    constructor() {
        // Initialize clients from current network config
        this.rebuildClients();

        // Re-create clients whenever the network changes
        effect(() => {
            // Read the signal to subscribe
            this.networkService.config();
            this.rebuildClients();
        });
    }

    private rebuildClients(): void {
        const cfg = this.networkService.config();
        this.algorand = new AlgorandService(cfg);
        this.algodClient = new algosdk.Algodv2('', cfg.algodServer, '');
        this.indexerClient = new algosdk.Indexer('', cfg.indexerServer, '');
    }

    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    /** Set of message IDs that were encrypted with PSK (v1.1). */
    readonly pskMessageIds = signal<Set<string>>(new Set());

    async sendMessage(
        recipientAddress: string,
        recipientPublicKey: Uint8Array,
        message: string,
        amount?: number
    ): Promise<string | null> {
        const account = this.wallet.account();
        if (!account) {
            this.error.set('Not connected');
            return null;
        }

        this.loading.set(true);
        this.error.set(null);

        try {
            // Check if PSK is active for this contact
            if (this.pskService.hasPSK(recipientAddress)) {
                return await this.sendPSKMessage(recipientAddress, recipientPublicKey, message, amount);
            }

            // Fallback to base protocol
            const result = await this.algorand.sendMessage(
                account,
                recipientAddress,
                recipientPublicKey,
                message,
                { amount: amount ?? 0, waitForConfirmation: true }
            );
            return result.txid;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            console.error('[AlgoChat] sendMessage error:', err);
            this.error.set(errorMessage);
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
            return await this.fetchDualProtocolMessages(participantAddress, undefined, limit);
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to fetch messages');
            return [];
        } finally {
            this.loading.set(false);
        }
    }

    async fetchMessagesBefore(
        participantAddress: string,
        beforeRound: number,
        limit = 50
    ): Promise<Message[]> {
        const account = this.wallet.account();
        if (!account) return [];

        try {
            return await this.fetchDualProtocolMessages(participantAddress, undefined, limit, beforeRound);
        } catch {
            return [];
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

        try {
            const pubKey = await this.algorand.discoverPublicKey(account.address);
            return pubKey !== null;
        } catch {
            return false;
        }
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

    /** Returns true if a message was encrypted with PSK v1.1 protocol. */
    isPSKMessageId(messageId: string): boolean {
        return this.pskMessageIds().has(messageId);
    }

    async fetchConversations(): Promise<Conversation[]> {
        const account = this.wallet.account();
        if (!account) return [];

        try {
            return await this.fetchDualProtocolConversations();
        } catch {
            return [];
        }
    }

    private async sendPSKMessage(
        recipientAddress: string,
        recipientPublicKey: Uint8Array,
        message: string,
        amount?: number
    ): Promise<string> {
        const account = this.wallet.account();
        if (!account) throw new Error('Not connected');

        const initialPSK = this.pskService.getPSK(recipientAddress);
        if (!initialPSK) throw new Error('No PSK for this contact');

        // Advance send counter
        const state = this.pskService.getState(recipientAddress);
        const { counter, state: newState } = advanceSendCounter(state);
        const currentPSK = derivePSKAtCounter(initialPSK, counter);

        // Encrypt with PSK protocol
        const envelope = encryptPSKMessage(
            message,
            account.encryptionKeys.publicKey,
            recipientPublicKey,
            currentPSK,
            counter
        );
        const note = encodePSKEnvelope(envelope);

        // Build raw algosdk transaction
        const params = await this.algodClient.getTransactionParams().do();
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: account.address,
            receiver: recipientAddress,
            amount: amount ?? 0,
            note,
            suggestedParams: params,
        });

        // Sign and submit
        const signedTxn = txn.signTxn(account.account.sk);
        const { txid } = await this.algodClient.sendRawTransaction(signedTxn).do();

        // Wait for confirmation
        await algosdk.waitForConfirmation(this.algodClient, txid, 10);

        // Persist updated counter state
        this.pskService.setState(recipientAddress, newState);

        // Track as PSK message
        this.pskMessageIds.update(set => {
            const next = new Set(set);
            next.add(txid);
            return next;
        });

        return txid;
    }

    private async fetchDualProtocolMessages(
        participantAddress: string,
        afterRound?: number,
        limit = 50,
        beforeRound?: number
    ): Promise<Message[]> {
        const account = this.wallet.account();
        if (!account) return [];

        let query = this.indexerClient
            .searchForTransactions()
            .address(account.address)
            .limit(limit);

        if (afterRound) {
            query = query.minRound(afterRound);
        }
        if (beforeRound) {
            query = query.maxRound(beforeRound - 1);
        }

        const response = await query.do();
        const messages: Message[] = [];

        for (const tx of response.transactions ?? []) {
            const txType = txField<string>(tx, 'txType');
            const note = txField<Uint8Array | undefined>(tx, 'note');
            if (txType !== 'pay' || !note) continue;

            const sender = txField<string>(tx, 'sender');
            const payment = txField<Record<string, unknown> | undefined>(tx, 'paymentTransaction');
            const receiver = payment?.['receiver'] as string | undefined;
            if (!receiver) continue;

            // Determine direction and filter by participant
            let direction: 'sent' | 'received';
            if (sender === account.address) {
                if (receiver !== participantAddress) continue;
                direction = 'sent';
            } else {
                if (sender !== participantAddress) continue;
                if (receiver !== account.address) continue;
                direction = 'received';
            }

            const parsed = this.tryParseMessage(note, account, sender, receiver, direction, tx);
            if (parsed) {
                messages.push(parsed);
            }
        }

        return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    private async fetchDualProtocolConversations(): Promise<Conversation[]> {
        const account = this.wallet.account();
        if (!account) return [];

        const response = await this.indexerClient
            .searchForTransactions()
            .address(account.address)
            .limit(100)
            .do();

        const conversationsMap = new Map<string, Conversation>();

        for (const tx of response.transactions ?? []) {
            const txType = txField<string>(tx, 'txType');
            const note = txField<Uint8Array | undefined>(tx, 'note');
            if (txType !== 'pay' || !note) continue;

            const sender = txField<string>(tx, 'sender');
            const payment = txField<Record<string, unknown> | undefined>(tx, 'paymentTransaction');
            const receiver = payment?.['receiver'] as string | undefined;
            if (!receiver) continue;

            // Filter: must involve our address
            if (sender !== account.address && receiver !== account.address) continue;

            const direction: 'sent' | 'received' = sender === account.address ? 'sent' : 'received';
            const otherParty = sender === account.address ? receiver : sender;

            const parsed = this.tryParseMessage(note, account, sender, receiver, direction, tx);
            if (!parsed) continue;

            // Skip key-publish transactions
            if (sender === receiver) {
                try {
                    const json = JSON.parse(parsed.content);
                    if (json.type === 'key-publish') continue;
                } catch {
                    if (parsed.content === 'key-publish') continue;
                }
            }

            if (!conversationsMap.has(otherParty)) {
                conversationsMap.set(otherParty, {
                    participant: otherParty,
                    messages: [],
                });
            }

            const conv = conversationsMap.get(otherParty)!;
            conv.messages.push(parsed);

            // Track the latest round
            const round = Number(txField<bigint>(tx, 'confirmedRound') ?? 0n);
            if (!conv.lastFetchedRound || round > conv.lastFetchedRound) {
                conv.lastFetchedRound = round;
            }
        }

        // Sort messages within each conversation
        const conversations = Array.from(conversationsMap.values());
        for (const conv of conversations) {
            conv.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }

        // Sort conversations by most recent message
        conversations.sort((a, b) => {
            const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
            const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
            return bLast - aLast;
        });

        return conversations;
    }

    /**
     * Attempts to parse a transaction note as either base protocol or PSK message.
     * Returns a Message if successful, null otherwise.
     */
    private tryParseMessage(
        noteBytes: Uint8Array,
        account: NonNullable<ReturnType<WalletService['account']>>,
        sender: string,
        receiver: string,
        direction: 'sent' | 'received',
        tx: unknown
    ): Message | null {
        const txId = txField<string>(tx, 'id') ?? '';
        const roundTime = txField<number>(tx, 'roundTime') ?? 0;
        const confirmedRound = Number(txField<bigint>(tx, 'confirmedRound') ?? 0n);
        const payment = txField<Record<string, unknown> | undefined>(tx, 'paymentTransaction');
        const amount = payment ? Number(payment['amount'] ?? 0) : undefined;

        // Try base protocol first
        if (isChatMessage(noteBytes)) {
            try {
                const envelope = decodeEnvelope(noteBytes);
                const decrypted = decryptMessage(
                    envelope,
                    account.encryptionKeys.privateKey,
                    account.encryptionKeys.publicKey
                );
                if (!decrypted) return null;

                return {
                    id: txId,
                    sender,
                    recipient: receiver,
                    content: decrypted.text,
                    timestamp: new Date(roundTime * 1000),
                    confirmedRound,
                    direction,
                    replyContext: decrypted.replyToId
                        ? { messageId: decrypted.replyToId, preview: decrypted.replyToPreview || '' }
                        : undefined,
                    amount,
                };
            } catch (err) {
                console.warn(`[AlgoChat] Failed to decrypt base message ${txId}:`, err);
            }
        }

        // Try PSK protocol
        if (isPSKMessage(noteBytes)) {
            const otherParty = direction === 'sent' ? receiver : sender;
            const initialPSK = this.pskService.getPSK(otherParty);
            if (!initialPSK) return null;

            try {
                const pskEnvelope = decodePSKEnvelope(noteBytes);
                const currentPSK = derivePSKAtCounter(initialPSK, pskEnvelope.ratchetCounter);
                const decrypted = decryptPSKMessage(
                    pskEnvelope,
                    account.encryptionKeys.privateKey,
                    account.encryptionKeys.publicKey,
                    currentPSK
                );
                if (!decrypted) return null;

                // Update counter state for received messages
                if (direction === 'received') {
                    const state = this.pskService.getState(otherParty);
                    if (validateCounter(state, pskEnvelope.ratchetCounter)) {
                        const newState = recordReceive(state, pskEnvelope.ratchetCounter);
                        this.pskService.setState(otherParty, newState);
                    }
                }

                // Track this as a PSK message
                this.pskMessageIds.update(set => {
                    const next = new Set(set);
                    next.add(txId);
                    return next;
                });

                return {
                    id: txId,
                    sender,
                    recipient: receiver,
                    content: decrypted.text,
                    timestamp: new Date(roundTime * 1000),
                    confirmedRound,
                    direction,
                    replyContext: decrypted.replyToId
                        ? { messageId: decrypted.replyToId, preview: decrypted.replyToPreview || '' }
                        : undefined,
                    amount,
                };
            } catch (err) {
                console.warn(`[AlgoChat] Failed to decrypt PSK message ${txId}:`, err);
            }
        }

        return null;
    }
}
