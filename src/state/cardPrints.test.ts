/**
 * A NEW GIFT CARD'S CODE IS NEVER THE TILL'S TO KEEP — AND ITS PRINT SURVIVES A RELOAD.
 *
 * Offers & gift cards answers the save that makes a card with the card's whole
 * code, once, and a print ticket beside it. This drives the code the till
 * ships — its desk over a transport that answers as a built Adminium does —
 * through a sale, a reload (a new store over the same session storage) and
 * the print, and looks for the code everywhere the till could have put it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionTransport } from '../data/sessionSource';

const CODE = 'GC-4T9WK2ZP8B1B7';
const TICKET = 'pt_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';

/** A browser tab's session storage. */
function tabStorage(): Storage & { dump(): string } {
  const kept = new Map<string, string>();
  return {
    get length() {
      return kept.size;
    },
    clear: () => kept.clear(),
    getItem: (key) => kept.get(key) ?? null,
    key: (index) => [...kept.keys()][index] ?? null,
    removeItem: (key) => void kept.delete(key),
    setItem: (key, value) => void kept.set(key, String(value)),
    dump: () => JSON.stringify([...kept.entries()]),
  };
}

interface Sent {
  path: string;
  method: string;
  body: unknown;
}

/** A transport that answers as Adminium does for the calls a card's sale and print make. */
function adminium(sent: Sent[], print: () => unknown = () => ({ printUrl: '/api/v1/documents/print-once/once-only', ephemeral: true })): SessionTransport {
  return {
    port: {} as SessionTransport['port'],
    connection: async () => 'conn-1',
    tableId: async (name: string) => `main.${name}`,
    relation: async (child: string, column: string) => `rel:${child}.${column}`,
    refresh: async () => undefined,
    get: async <T,>(): Promise<T> => ({ data: { id: 7, status: 'open', tax_rate_bp: 825, subtotal: '50.00', goods: '0.00', discount: '0.00', own_discount: '0.00', net: '0.00', tax: '0.00', total: '50.00', due: '50.00', paid: '0.00' } }) as T,
    mutate: async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> => {
      sent.push({ path, method, body });
      if (path.endsWith('/offers_gift_cards')) {
        // The whole reply of the save that makes a card, as a built Adminium sends it.
        return { data: { id: 13, kind: 'card', label: 'B1B7', status: 'inactive', balance: 0 }, undoToken: 'u1', once: [{ table: 'main.offers_gift_cards', key: '13', column: 'code', value: CODE, print: TICKET }] } as T;
      }
      if (path.endsWith('/documents/render')) return print() as T;
      return { data: { id: 7 } } as T;
    },
  };
}

/** A till as a page load makes it: fresh modules, the storage the tab already has. */
async function till(sent: Sent[], print?: () => unknown) {
  vi.resetModules();
  const [{ usePos }, { setDesk, sessionDesk }, { setSink, outbox }, { memorySink }, { NO_FEATURES }] = await Promise.all([
    import('./store'),
    import('../data/desk'),
    import('./writes'),
    import('../data/sink'),
    import('../features'),
  ]);
  const sink = memorySink({ firstNumber: 3001 });
  setSink(sink);
  setDesk(sessionDesk(adminium(sent, print), { tickets: 'pos_tickets', ticket_items: 'pos_ticket_items', payments: 'pos_payments', 'offers:gift_cards': 'offers_gift_cards' }));
  usePos.setState({ connected: true, cardsMoved: true, features: { ...NO_FEATURES, offers: true, 'gift-cards': true }, ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], view: 'register' });
  const settled = async () => {
    for (let i = 0; i < 30; i += 1) {
      await outbox().idle();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { usePos, sink, settled };
}

let storage: ReturnType<typeof tabStorage>;

beforeEach(() => {
  storage = tabStorage();
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('a new gift card', () => {
  it('is sold, paid, and printed after a reload — and its code is in no state, no storage and no row', async () => {
    const sent: Sent[] = [];
    const first = await till(sent);
    expect(await first.usePos.getState().sellCard(50)).toBe(true);
    await first.settled();
    first.usePos.getState().openPay();
    first.usePos.setState({ payMethod: 'cash', cash: '50', tip: 0 });
    first.usePos.getState().onCharge();
    await first.settled();
    expect(first.usePos.getState().lastSale?.newCards).toEqual([{ cardId: '13', last4: 'B1B7', amount: 50 }]);

    // Everywhere the till could have put the code.
    const everything = () => JSON.stringify([first.usePos.getState(), first.sink.calls, sent.filter((one) => !one.path.endsWith('/offers_gift_cards'))]) + storage.dump();
    expect(everything()).not.toContain(CODE);
    expect(everything()).not.toContain(CODE.slice(3));
    // What the tab keeps: which card, its last four, what it sold for, and the ticket that prints it.
    expect(JSON.parse(storage.getItem('pos.cardPrints')!)).toEqual([{ cardId: '13', print: TICKET, last4: 'B1B7', amount: 50, at: expect.any(Number), paid: true }]);

    // The page is reloaded: a new store, the same tab.
    const again = await till(sent);
    expect(again.usePos.getState().lastSale).toBeNull();
    expect(again.usePos.getState().cardPrints.map((one) => [one.cardId, one.last4, one.paid])).toEqual([['13', 'B1B7', true]]);
    const url = await again.usePos.getState().cardPrintUrl('13');
    expect(url).toBe('/api/v1/documents/print-once/once-only');
    expect(sent.at(-1)).toEqual({
      path: '/api/v1/add-ons/offers/documents/render',
      method: 'POST',
      body: { kind: 'gift-card', table: 'gift_cards', key: 13, once: TICKET, values: { first: '1' } },
    });
    // Printed: the entry is gone, from the store and from the tab.
    expect(again.usePos.getState().cardPrints).toEqual([]);
    expect(storage.getItem('pos.cardPrints')).toBeNull();
    expect(JSON.stringify(again.usePos.getState()) + storage.dump()).not.toContain(CODE);
    // It prints once: asked again, there is nothing to ask with.
    const before = sent.length;
    expect(await again.usePos.getState().cardPrintUrl('13')).toBeNull();
    expect(sent.length).toBe(before);
    expect(again.usePos.getState().toast?.msg).toBe('This card can no longer be printed here · A manager prints it from Offers');
  });

  it('a print the server will not make is said plainly, and is not offered again', async () => {
    const sent: Sent[] = [];
    const gone = Object.assign(new Error('No such document for this app.'), { status: 404, code: 'NOT_FOUND' });
    const t = await till(sent, () => {
      throw gone;
    });
    expect(await t.usePos.getState().sellCard(25)).toBe(true);
    await t.settled();
    expect(await t.usePos.getState().cardPrintUrl('13')).toBeNull();
    expect(t.usePos.getState().toast?.msg).toBe('This card can no longer be printed here · A manager prints it from Offers');
    expect(t.usePos.getState().cardPrints).toEqual([]);
  });

  it('with no answer at all the ticket is kept: it can be tried again', async () => {
    const sent: Sent[] = [];
    const t = await till(sent, () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await t.usePos.getState().sellCard(25)).toBe(true);
    await t.settled();
    expect(await t.usePos.getState().cardPrintUrl('13')).toBeNull();
    expect(t.usePos.getState().toast?.msg).toBe('Printing a card needs a connection');
    expect(t.usePos.getState().cardPrints).toHaveLength(1);
  });

  it('a print ticket the server no longer honours (ten minutes on) is dropped unasked', async () => {
    const { cardPrints, keepCardPrint, PRINT_LIFE_MS } = await import('./cardPrints');
    keepCardPrint({ cardId: '21', print: TICKET, last4: 'ZZZZ', amount: 10 }, 1_000);
    expect(cardPrints(1_000 + PRINT_LIFE_MS - 1)).toHaveLength(1);
    expect(cardPrints(1_000 + PRINT_LIFE_MS)).toEqual([]);
    expect(storage.getItem('pos.cardPrints')).toBeNull();
  });
});
