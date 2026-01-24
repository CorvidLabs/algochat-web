import { Injectable, inject, signal } from '@angular/core';
import { WalletService } from './wallet.service';
import { AlgorandService, type Message, type ConversationData as Conversation } from 'ts-algochat';

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
            const result = await this.algorand.sendMessage(
                account,
                recipientAddress,
                recipientPublicKey,
                message,
                { amount: amount ?? 0, waitForConfirmation: true }
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

    async fetchMessagesBefore(
        participantAddress: string,
        beforeRound: number,
        limit = 50
    ): Promise<Message[]> {
        const account = this.wallet.account();
        if (!account) return [];

        try {
            return await this.algorand.fetchMessages(
                account,
                participantAddress,
                undefined,
                limit,
                beforeRound
            );
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

        // Don't use discoverPublicKey here - it short-circuits for own address.
        // We need to actually check on-chain.
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

    async fetchConversations(): Promise<Conversation[]> {
        const account = this.wallet.account();
        if (!account) return [];

        try {
            return await this.algorand.fetchConversations(account);
        } catch {
            return [];
        }
    }
}
