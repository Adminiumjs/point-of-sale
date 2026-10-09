/**
 * The move's own steps, over a door kept in memory: what it does when the
 * shop is not as a tidy run expects. (That Offers really makes each card under
 * its old code is the contract's to prove, on a real server.)
 */
import { describe, expect, it } from 'vitest';

import { MoveRefused, runCardMove, type MoveDoor, type MoveRow, type MoveTable } from './move';

type World = Record<MoveTable, MoveRow[]>;

/** A shop: two of the till's cards, and an Offers that mirrors a row the moment it is marked moved. */
function world(over: Partial<World> = {}): World {
  return {
    tickets: [],
    ticket_items: [],
    payments: [],
    gift_cards: [
      { id: 1, code: 'GC-11111111', status: 'active', balance: 30 },
      { id: 2, code: 'GC-22222222', status: 'active', balance: 5 },
    ],
    gift_card_ledger: [
      { id: 'a', card_id: 1, kind: 'issue', amount: 50, at: '2026-01-01T10:00:00Z', moved_at: null },
      { id: 'b', card_id: 1, kind: 'redeem', amount: -20, at: '2026-02-01T10:00:00Z', moved_at: null },
      { id: 'c', card_id: 2, kind: 'issue', amount: 5, at: '2026-03-01T10:00:00Z', moved_at: null },
    ],
    settings: [{ id: 1, cards_moved: false }],
    'offers:gift_cards': [],
    'offers:settings': [{ id: 1, cards_paused: false }],
    ...over,
  };
}

function doorOf(w: World, hooks: { afterRows?: () => void; admin?: boolean } = {}): MoveDoor & { log: string[] } {
  const log: string[] = [];
  let hooked = false;
  return {
    log,
    rows: async (table) => w[table].map((row) => ({ ...row })),
    patch: async (table, id, values) => {
      if (table === 'offers:settings' && hooks.admin === false) throw new MoveRefused(403, 'COLUMN_FORBIDDEN');
      log.push(`${table} ${String(id)} ${JSON.stringify(values)}`);
      Object.assign(w[table].find((row) => row['id'] === id)!, values);
    },
    oneByOne: async (table, ids, values) => {
      const results = ids.map((id) => {
        const row = w[table].find((one) => one['id'] === id)!;
        Object.assign(row, values);
        if (table === 'gift_card_ledger') {
          // Offers' side of the save: the card made on its first row, the amount added.
          let twin = w['offers:gift_cards'].find((card) => card['moved_from'] === String(row['card_id']));
          if (twin === undefined) {
            twin = { id: 100 + Number(row['card_id']), code: values['card_code'], moved_from: String(row['card_id']), moved_table: 'pos:gift_cards', status: 'active', balance: 0, moving: true };
            w['offers:gift_cards'].push(twin);
          }
          twin['balance'] = Number(twin['balance']) + Number(row['amount']);
        }
        return { id, ok: true };
      });
      log.push(`${table} ×${String(ids.length)}`);
      if (table === 'gift_card_ledger' && !hooked && hooks.afterRows !== undefined) {
        hooked = true;
        hooks.afterRows();
      }
      return { results, notRun: 0 };
    },
  };
}

const OPTIONS = { voidReason: 'Cancelled at the till before the move', now: () => new Date('2026-10-01T12:00:00Z') };

describe('bringing the till’s gift cards into Offers', () => {
  it('moves every row, compares, closes the old cards, remembers, and only then lets the latch go', async () => {
    const w = world();
    const door = doorOf(w);
    expect(await runCardMove(door, OPTIONS)).toEqual({ state: 'done', cards: 2, rows: 3, cents: 3500, alreadyDone: false });
    expect(w.gift_cards.map((card) => card['status'])).toEqual(['moved', 'moved']);
    expect(w['offers:gift_cards'].map((card) => [card['code'], card['balance'], card['moving']])).toEqual([['GC-11111111', 30, false], ['GC-22222222', 5, false]]);
    // The order of the last three writes: the old tables closed, the till's mark, the latch off.
    expect(door.log.slice(-3)).toEqual(['gift_cards ×2', 'settings 1 {"cards_moved":true}', 'offers:settings 1 {"cards_paused":false}']);
    expect(door.log[0]).toBe('offers:settings 1 {"cards_paused":true}');
  });

  it('a till that spends an old card while the rows go over: the run stops with the latch on, and the next press takes the late row too', async () => {
    const w = world();
    const door = doorOf(w, {
      afterRows: () => {
        w.gift_card_ledger.push({ id: 'late', card_id: 2, kind: 'redeem', amount: -5, at: '2026-10-01T12:00:01Z', moved_at: null });
        w.gift_cards[1]!['balance'] = 0;
      },
    });
    expect(await runCardMove(door, OPTIONS)).toEqual({ state: 'mismatch', cards: [{ code: 'GC-22222222', here: 0, inOffers: null }] });
    expect([w.settings[0]!['cards_moved'], w['offers:settings'][0]!['cards_paused'], w.gift_cards.map((card) => card['status'])]).toEqual([false, true, ['active', 'active']]);
    expect((await runCardMove(doorOf(w), OPTIONS)).state).toBe('done');
    expect(w['offers:gift_cards'].map((card) => card['balance'])).toEqual([30, 0]);
  });

  it('a card that holds money and has no row at all is not closed as if it were nothing: the run stops, naming it', async () => {
    const w = world();
    w.gift_cards.push({ id: 3, code: 'GC-33333333', status: 'active', balance: 12 });
    expect(await runCardMove(doorOf(w), OPTIONS)).toEqual({ state: 'mismatch', cards: [{ code: 'GC-33333333', here: 1200, inOffers: null }] });
    expect(w.gift_cards.map((card) => card['status'])).toEqual(['active', 'active', 'active']);
    expect(w.settings[0]!['cards_moved']).toBe(false);
  });

  it('a balance that differs stops it before anything is closed', async () => {
    const w = world();
    w.gift_cards[0]!['balance'] = 31;
    expect(await runCardMove(doorOf(w), OPTIONS)).toEqual({ state: 'mismatch', cards: [{ code: 'GC-11111111', here: 3100, inOffers: 3000 }] });
    expect([w.settings[0]!['cards_moved'], w['offers:settings'][0]!['cards_paused']]).toEqual([false, true]);
  });

  it('whoever cannot set the latch is told to ask the owner, and nothing is written', async () => {
    const w = world();
    const door = doorOf(w, { admin: false });
    expect(await runCardMove(door, OPTIONS)).toEqual({ state: 'ask-owner' });
    expect(door.log).toEqual([]);
  });

  it('an open ticket carrying a card stops it before the latch', async () => {
    const w = world({ tickets: [{ id: 9, number: '1009', status: 'open' }], ticket_items: [{ id: 1, ticket_id: 9, gift_card_id: 2, voided_at: null }] });
    const door = doorOf(w);
    expect(await runCardMove(door, OPTIONS)).toEqual({ state: 'blocked', tickets: [{ id: 9, number: '1009' }] });
    expect(door.log).toEqual([]);
  });
});
