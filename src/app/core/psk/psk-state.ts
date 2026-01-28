/**
 * PSK Protocol v1.1 - Counter State Management
 *
 * Manages send/receive counters with a sliding window for replay protection.
 * The window allows receiving messages within +/- COUNTER_WINDOW of the
 * highest seen counter, while preventing replays of already-seen counters.
 */

import { PSK_PROTOCOL, type PSKState } from './psk-types';

export class PSKCounterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKCounterError';
    }
}

/**
 * Creates a new PSK state from an initial pre-shared key.
 */
export function createPSKState(initialPSK: Uint8Array): PSKState {
    if (initialPSK.length !== 32) {
        throw new PSKCounterError(`PSK must be 32 bytes, got ${initialPSK.length}`);
    }
    return {
        initialPSK: new Uint8Array(initialPSK),
        sendCounter: 0,
        receiveCounter: 0,
        receivedCounters: new Set<number>(),
    };
}

/**
 * Gets the next send counter and advances the state.
 * Returns the counter value to use for the next outgoing message.
 */
export function advanceSendCounter(state: PSKState): number {
    const counter = state.sendCounter;
    if (counter > 0xFFFFFFFF) {
        throw new PSKCounterError('Send counter overflow');
    }
    state.sendCounter = counter + 1;
    return counter;
}

/**
 * Validates a received counter against the window.
 *
 * A counter is valid if:
 * 1. It has not been seen before (replay protection)
 * 2. It is within the window: [receiveCounter - COUNTER_WINDOW, receiveCounter + COUNTER_WINDOW]
 *
 * Returns true if the counter is valid and should be accepted.
 */
export function validateReceiveCounter(state: PSKState, counter: number): boolean {
    // Reject already-seen counters
    if (state.receivedCounters.has(counter)) {
        return false;
    }

    // First message ever received - accept anything
    if (state.receivedCounters.size === 0) {
        return true;
    }

    // Check window bounds
    const lowerBound = Math.max(0, state.receiveCounter - PSK_PROTOCOL.COUNTER_WINDOW);
    const upperBound = state.receiveCounter + PSK_PROTOCOL.COUNTER_WINDOW;

    return counter >= lowerBound && counter <= upperBound;
}

/**
 * Records a successfully received counter and updates the window.
 * Call this after successfully decrypting and validating a message.
 */
export function recordReceivedCounter(state: PSKState, counter: number): void {
    state.receivedCounters.add(counter);

    // Update high-water mark
    if (counter > state.receiveCounter) {
        state.receiveCounter = counter;
    }

    // Prune counters outside the window
    pruneCounters(state);
}

/**
 * Removes counters that have fallen outside the sliding window.
 */
function pruneCounters(state: PSKState): void {
    const lowerBound = Math.max(0, state.receiveCounter - PSK_PROTOCOL.COUNTER_WINDOW);
    for (const counter of state.receivedCounters) {
        if (counter < lowerBound) {
            state.receivedCounters.delete(counter);
        }
    }
}

/**
 * Serializes PSK state for storage.
 */
export function serializePSKState(state: PSKState): string {
    return JSON.stringify({
        initialPSK: Array.from(state.initialPSK),
        sendCounter: state.sendCounter,
        receiveCounter: state.receiveCounter,
        receivedCounters: Array.from(state.receivedCounters),
    });
}

/**
 * Deserializes PSK state from storage.
 */
export function deserializePSKState(json: string): PSKState {
    const data = JSON.parse(json);
    return {
        initialPSK: new Uint8Array(data.initialPSK),
        sendCounter: data.sendCounter,
        receiveCounter: data.receiveCounter,
        receivedCounters: new Set<number>(data.receivedCounters),
    };
}
