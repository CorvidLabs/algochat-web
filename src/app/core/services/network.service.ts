import { Injectable, signal, computed } from '@angular/core';

export type AlgoChatNetwork = 'testnet' | 'mainnet';

export interface NetworkConfig {
    algodToken: string;
    algodServer: string;
    indexerToken: string;
    indexerServer: string;
}

const NETWORK_CONFIGS: Record<AlgoChatNetwork, NetworkConfig> = {
    mainnet: {
        algodToken: '',
        algodServer: 'https://mainnet-api.algonode.cloud',
        indexerToken: '',
        indexerServer: 'https://mainnet-idx.algonode.cloud',
    },
    testnet: {
        algodToken: '',
        algodServer: 'https://testnet-api.algonode.cloud',
        indexerToken: '',
        indexerServer: 'https://testnet-idx.algonode.cloud',
    },
};

const STORAGE_KEY = 'algochat_network';

@Injectable({ providedIn: 'root' })
export class NetworkService {
    private readonly _network = signal<AlgoChatNetwork>(this.loadNetwork());

    readonly network = this._network.asReadonly();
    readonly config = computed(() => NETWORK_CONFIGS[this._network()]);
    readonly isTestnet = computed(() => this._network() === 'testnet');
    readonly isMainnet = computed(() => this._network() === 'mainnet');

    switchNetwork(network: AlgoChatNetwork): void {
        if (network === this._network()) return;
        this._network.set(network);
        localStorage.setItem(STORAGE_KEY, network);
    }

    toggle(): void {
        this.switchNetwork(this._network() === 'mainnet' ? 'testnet' : 'mainnet');
    }

    private loadNetwork(): AlgoChatNetwork {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'testnet' || stored === 'mainnet') return stored;
        return 'mainnet'; // default
    }
}
