import { describe, it, expect } from 'vitest';
import type { ContactEntry } from './contacts-list.component';

// Test the sorting and filtering logic independently
function sortContacts(contacts: ContactEntry[]): ContactEntry[] {
    return [...contacts].sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        if (a.isBlocked !== b.isBlocked) return a.isBlocked ? 1 : -1;
        const aName = a.nickname?.toLowerCase() ?? a.address;
        const bName = b.nickname?.toLowerCase() ?? b.address;
        return aName.localeCompare(bName);
    });
}

function filterContacts(contacts: ContactEntry[], query: string): ContactEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(c =>
        c.address.toLowerCase().includes(q) ||
        (c.nickname?.toLowerCase().includes(q) ?? false)
    );
}

function makeContact(overrides: Partial<ContactEntry> & { address: string }): ContactEntry {
    return {
        nickname: undefined,
        hasPSK: false,
        isFavorite: false,
        isBlocked: false,
        isMuted: false,
        ...overrides,
    };
}

describe('Contacts list logic', () => {
    describe('sorting', () => {
        it('should sort favorites first', () => {
            const contacts = [
                makeContact({ address: 'ADDR_B' }),
                makeContact({ address: 'ADDR_A', isFavorite: true }),
            ];
            const sorted = sortContacts(contacts);
            expect(sorted[0].address).toBe('ADDR_A');
        });

        it('should sort blocked last', () => {
            const contacts = [
                makeContact({ address: 'ADDR_A', isBlocked: true }),
                makeContact({ address: 'ADDR_B' }),
            ];
            const sorted = sortContacts(contacts);
            expect(sorted[0].address).toBe('ADDR_B');
            expect(sorted[1].address).toBe('ADDR_A');
        });

        it('should sort alphabetically by nickname', () => {
            const contacts = [
                makeContact({ address: 'ADDR_Z', nickname: 'Charlie' }),
                makeContact({ address: 'ADDR_A', nickname: 'Alice' }),
                makeContact({ address: 'ADDR_M', nickname: 'Bob' }),
            ];
            const sorted = sortContacts(contacts);
            expect(sorted.map(c => c.nickname)).toEqual(['Alice', 'Bob', 'Charlie']);
        });

        it('should sort by address when no nickname', () => {
            const contacts = [
                makeContact({ address: 'ZZZZZ' }),
                makeContact({ address: 'AAAAA' }),
            ];
            const sorted = sortContacts(contacts);
            expect(sorted[0].address).toBe('AAAAA');
        });

        it('should combine favorite + alphabetical sorting', () => {
            const contacts = [
                makeContact({ address: 'ADDR_C', nickname: 'Zoe' }),
                makeContact({ address: 'ADDR_A', nickname: 'Alice', isFavorite: true }),
                makeContact({ address: 'ADDR_B', nickname: 'Bob', isFavorite: true }),
                makeContact({ address: 'ADDR_D', nickname: 'Dan' }),
            ];
            const sorted = sortContacts(contacts);
            expect(sorted.map(c => c.nickname)).toEqual(['Alice', 'Bob', 'Dan', 'Zoe']);
        });
    });

    describe('filtering', () => {
        const contacts = [
            makeContact({ address: 'ALGO_ABC123', nickname: 'Alice' }),
            makeContact({ address: 'ALGO_DEF456', nickname: 'Bob' }),
            makeContact({ address: 'ALGO_GHI789' }),
        ];

        it('should return all contacts when query is empty', () => {
            expect(filterContacts(contacts, '')).toHaveLength(3);
            expect(filterContacts(contacts, '  ')).toHaveLength(3);
        });

        it('should filter by nickname', () => {
            const result = filterContacts(contacts, 'alice');
            expect(result).toHaveLength(1);
            expect(result[0].nickname).toBe('Alice');
        });

        it('should filter by address', () => {
            const result = filterContacts(contacts, 'DEF456');
            expect(result).toHaveLength(1);
            expect(result[0].address).toBe('ALGO_DEF456');
        });

        it('should be case-insensitive', () => {
            expect(filterContacts(contacts, 'BOB')).toHaveLength(1);
            expect(filterContacts(contacts, 'algo_ghi')).toHaveLength(1);
        });

        it('should return empty for no matches', () => {
            expect(filterContacts(contacts, 'xyz')).toHaveLength(0);
        });

        it('should match partial address for contacts without nickname', () => {
            const result = filterContacts(contacts, 'GHI');
            expect(result).toHaveLength(1);
            expect(result[0].address).toBe('ALGO_GHI789');
        });
    });

    describe('contact entry structure', () => {
        it('should have all required fields', () => {
            const contact = makeContact({
                address: 'ALGO_TEST',
                nickname: 'Test',
                hasPSK: true,
                isFavorite: true,
                isMuted: false,
                isBlocked: false,
            });

            expect(contact.address).toBe('ALGO_TEST');
            expect(contact.nickname).toBe('Test');
            expect(contact.hasPSK).toBe(true);
            expect(contact.isFavorite).toBe(true);
            expect(contact.isMuted).toBe(false);
            expect(contact.isBlocked).toBe(false);
        });

        it('should default to no PSK and no flags', () => {
            const contact = makeContact({ address: 'ALGO_BARE' });
            expect(contact.hasPSK).toBe(false);
            expect(contact.isFavorite).toBe(false);
            expect(contact.isBlocked).toBe(false);
            expect(contact.isMuted).toBe(false);
            expect(contact.nickname).toBeUndefined();
        });
    });
});
