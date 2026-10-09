/**
 * THE TILL'S GIFT CARDS BROUGHT INTO OFFERS & GIFT CARDS, ON EVERY ENGINE.
 *
 * A shop that began on the released 0.2.3 — its sample card (GC-48219930,
 * $38.50 in three rows) and three more made through 0.2.3's own doors: one
 * spent down, one cancelled with money on it, one never sold — updated to this
 * build with Offers & gift cards connected. Then the till's own steps
 * (`runCardMove` in state/move.ts, spoken through the same doors the till
 * speaks through) bring the cards in:
 *
 *   - before: the old screens' rules hold (state 2) and Offers knows no card
 *     of the till's;
 *   - the move stops while an open ticket carries a card, naming it;
 *   - a manager who is no Super Admin cannot run it, and nothing is written;
 *   - a run that stops half-way loses nothing, and pressing again goes on;
 *   - after: every card is in Offers under the code it always had, with every
 *     row of its history and the balance it had, to the cent;
 *   - pressed again, it writes nothing more;
 *   - the old tables are closed: a late write from a till not yet reloaded is
 *     refused; a moved card pays a ticket through Offers.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { featuresOf } from '../features';
import { MoveRefused, cardsToMove, runCardMove, type MoveDoor, type MoveOutcome, type MoveRow, type MoveTable } from '../state/move';
import { Caller, ENGINES, missing, ok, releasedMissing, type Engine } from './harness';
import { cents, doors, standUpFromRelease, type Row, type UpdatedShop } from './stand';

const why = missing() ?? releasedMissing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 12;
const STORED: Record<MoveTable, string> = {
  tickets: 'tickets',
  ticket_items: 'ticket_items',
  payments: 'payments',
  gift_cards: 'gift_cards',
  gift_card_ledger: 'gift_card_ledger',
  settings: 'settings',
  'offers:gift_cards': 'offers_gift_cards',
  'offers:settings': 'offers_settings',
};

/** The till's door for the move, over a contract caller: the same three calls the till's session makes. */
function moveDoor(caller: Caller, shop: UpdatedShop, spoil?: { failAfter: number }): MoveDoor & { writes: number } {
  const d = doors(caller, shop.connectionId, shop.ids);
  const door = {
    writes: 0,
    rows: async (table: MoveTable) => {
      const out: MoveRow[] = [];
      for (let offset = 0; ; offset += 200) {
        const reply = await caller.get<{ data: MoveRow[] }>(`${d.data(STORED[table])}?limit=200&offset=${String(offset)}`);
        if (reply.status !== 200) throw new MoveRefused(reply.status, reply.code ?? 'REFUSED');
        out.push(...reply.body.data);
        if (reply.body.data.length < 200) return out;
      }
    },
    patch: async (table: MoveTable, id: unknown, values: MoveRow) => {
      door.writes += 1;
      const reply = await d.patch(STORED[table], id, values);
      if (reply.status !== 200) throw new MoveRefused(reply.status, reply.code ?? 'REFUSED', (reply.details['reason'] as string | undefined) ?? null);
    },
    oneByOne: async (table: MoveTable, ids: unknown[], values: MoveRow) => {
      // A connection lost half-way through: the rows after it never reach the server.
      if (spoil !== undefined && door.writes >= spoil.failAfter) throw new Error('offline');
      const send = spoil === undefined ? ids : ids.slice(0, 1);
      door.writes += 1;
      const reply = await caller.post<{ results: { id?: unknown; ok: boolean; error?: { code: string; reason?: string } }[]; notRun: number }>(`${d.data(STORED[table])}/one-by-one`, { ids: send, values });
      if (reply.status !== 200) throw new MoveRefused(reply.status, reply.code ?? 'REFUSED', (reply.details['reason'] as string | undefined) ?? null);
      if (spoil !== undefined && send.length < ids.length) throw new Error('offline');
      return reply.body;
    },
  };
  return door;
}

describe.skipIf(why !== null)(`the till's gift cards brought into Offers & gift cards${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let shop: UpdatedShop;
      /** The cards as 0.2.3 left them: code → [status, cents, rows]. */
      const were: Record<string, [string, number, number]> = {};
      let carrying: unknown;
      const OPTIONS = { voidReason: 'Cancelled at the till before the move' };

      beforeAll(async () => {
        shop = await standUpFromRelease(engine as Engine, PORT, `pos_move_${engine}`, {
          addOns: ['offers'],
          under: async (d) => {
            const person = (await d.rows('staff'))[0]!;
            const row = (card: Row, kind: string, amount: number, daysAgo: number) =>
              d.insert('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind, amount, staff_id: person['id'], at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() });
            // Sold for $20.00, $5.00 spent.
            const spent = await d.insert('gift_cards', { status: 'active', issued_at: new Date(Date.now() - 20 * 86_400_000).toISOString() });
            await row(spent, 'issue', 20, 20);
            await row(spent, 'redeem', -5, 3);
            // Sold for $10.00, then cancelled with the money still on it.
            const cancelled = await d.insert('gift_cards', { status: 'active' });
            await row(cancelled, 'issue', 10, 12);
            await d.update('gift_cards', cancelled['id'], { status: 'void' });
            // Printed, never sold.
            await d.insert('gift_cards', { status: 'inactive' });
            // A ticket left open with a card load on it.
            const ticket = await d.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
            await d.insert('ticket_items', { ticket_id: ticket['id'], name: 'Gift card', qty: 1, unit_price: 25, gift_card_id: spent['id'] });
          },
        });
        const ledger = await shop.d.rows('gift_card_ledger');
        for (const card of await shop.d.rows('gift_cards')) were[String(card['code'])] = [String(card['status']), cents(card['balance']), ledger.filter((row) => row['card_id'] === card['id']).length];
        carrying = (await shop.d.rows('tickets')).find((ticket) => String(ticket['number']) !== '' && !String(ticket['number']).startsWith('S-'))!['id'];
      }, 600_000);
      afterAll(async () => {
        await shop?.server.stop();
      });

      const offersCards = async () => (await shop.d.rows('offers_gift_cards')).filter((card) => card['moved_table'] === 'pos:gift_cards');
      const latch = async () => (await shop.d.rows('offers_settings'))[0]!['cards_paused'];
      const settings = async () => (await shop.d.rows('settings'))[0]!;

      it('before the move: four cards as 0.2.3 left them, the feature on, nothing of them in Offers', async () => {
        expect(Object.values(were).sort((a, b) => b[1] - a[1])).toEqual([['active', 3850, 3], ['active', 1500, 2], ['void', 1000, 1], ['inactive', 0, 0]]);
        expect(were['GC-48219930']).toEqual(['active', 3850, 3]);
        expect(featuresOf(ok(await shop.staff.get<{ addOns?: Record<string, never> }>('/apps/pos/staff/surface-config.json')).addOns)).toMatchObject({ 'gift-cards': true });
        expect([true, 1]).not.toContain((await settings())['cards_moved']);
        expect(await offersCards()).toEqual([]);
        // What the banner says: the cards that hold money, and how much in all.
        expect(cardsToMove(await shop.d.rows('gift_cards'))).toEqual({ count: 3, cents: 6350 });
      }, 60_000);

      it('stops while an open ticket carries a gift card, naming it, and writes nothing', async () => {
        const door = moveDoor(shop.staff, shop);
        const outcome = await runCardMove(door, OPTIONS);
        expect(outcome.state).toBe('blocked');
        expect((outcome as Extract<MoveOutcome, { state: 'blocked' }>).tickets.map((t) => t.id)).toEqual([carrying]);
        expect(door.writes).toBe(0);
        expect([true, 1]).not.toContain(await latch());
        // The ticket is voided (a ticket from before the update cannot be paid): nothing carries a card now.
        await shop.d.update('tickets', carrying, { status: 'void' });
      }, 60_000);

      it('a manager who is not a Super Admin cannot run it: told to ask the owner, nothing written', async () => {
        const roles = ok(await shop.staff.get<{ roles: { id: string; name: string }[] }>('/api/v1/roles')).roles;
        const email = `manager-move-${engine}@till.example`;
        const invited = ok(await shop.staff.post<{ invite: { token: string } }>('/api/v1/users', { email, name: 'Priya Nair', roleIds: [roles.find((r) => r.name === 'POS manager')!.id] }), 201);
        const password = `contract-move-${engine}-pass!`;
        ok(await new Caller(shop.server.base, { origin: shop.server.base }).post('/api/v1/auth/password/reset', { token: invited.invite.token, newPassword: password }));
        const manager = new Caller(shop.server.base, { origin: shop.server.base });
        await manager.signIn(email, password);
        expect((await runCardMove(moveDoor(manager, shop), OPTIONS)).state).toBe('ask-owner');
        expect([true, 1]).not.toContain(await latch());
        expect(await offersCards()).toEqual([]);
        // Nor can a manager mark a row moved by hand, name its code, or say the move is done.
        const md = doors(manager, shop.connectionId, shop.ids);
        const row = (await shop.d.rows('gift_card_ledger'))[0]!;
        expect((await md.patch('gift_card_ledger', row['id'], { moved_at: new Date().toISOString(), card_code: 'GC-99999999' })).status).toBeGreaterThanOrEqual(400);
        expect((await md.patch('settings', (await settings())['id'], { cards_moved: true })).status).toBeGreaterThanOrEqual(400);
        expect((await shop.d.rows('gift_card_ledger')).filter((r) => r['moved_at'] !== null && r['moved_at'] !== undefined)).toEqual([]);
      }, 120_000);

      it('with the latch off, a row marked moved makes no card: refused, nothing written', async () => {
        const row = (await shop.d.rows('gift_card_ledger'))[0]!;
        const refused = await shop.d.patch('gift_card_ledger', row['id'], { card_code: 'GC-48219930', moved_at: new Date().toISOString() });
        expect([refused.status, refused.code]).toEqual([409, 'POSTING_REFUSED']);
        expect(await offersCards()).toEqual([]);
        expect((await shop.d.rows('gift_card_ledger')).find((r) => r['id'] === row['id'])!['moved_at'] ?? null).toBeNull();
      }, 60_000);

      it('a run that loses its connection half-way loses nothing: the latch stays on, the old cards stay as they were', async () => {
        const door = moveDoor(shop.staff, shop, { failAfter: 3 });
        await expect(runCardMove(door, OPTIONS)).rejects.toThrow('offline');
        expect([true, 1]).toContain(await latch());
        const ledger = await shop.d.rows('gift_card_ledger');
        const moved = ledger.filter((row) => row['moved_at'] !== null && row['moved_at'] !== undefined);
        expect(moved.length).toBeGreaterThan(0);
        expect(moved.length).toBeLessThan(ledger.length);
        // Every old card is as it was — its status, its balance, its rows — and not yet closed.
        for (const card of await shop.d.rows('gift_cards')) expect([card['code'], card['status'], cents(card['balance'])]).toEqual([card['code'], were[String(card['code'])]![0], were[String(card['code'])]![1]]);
        expect([true, 1]).not.toContain((await settings())['cards_moved']);
        // While it is half done Offers issues nothing: a card made now cannot be loaded.
        const fresh = await shop.d.insert('offers_gift_cards', { kind: 'card' });
        const relation = `${shop.d.data('offers_card_actions')}`;
        const load = await shop.staff.post(relation, { values: { card_id: fresh['id'], action: 'issue', amount: 25, reason: 'Sold at the desk', paid_by: 'cash' } });
        expect(load.status, JSON.stringify(load.body).slice(0, 300)).toBe(409);
      }, 120_000);

      let done: Extract<MoveOutcome, { state: 'done' }>;
      it('pressed again it goes on and finishes: every card in Offers under its own code, its history and its balance to the cent', async () => {
        const outcome = await runCardMove(moveDoor(shop.staff, shop), OPTIONS);
        expect(outcome.state, JSON.stringify(outcome)).toBe('done');
        done = outcome as typeof done;
        // Three cards and their six rows; the cancelled one holds nothing a customer can spend, so $53.50 is live.
        expect([done.cards, done.rows, done.cents, done.alreadyDone]).toEqual([3, 6, 5350, false]);
        const cards = await offersCards();
        const ledger = await shop.d.rows('offers_card_ledger');
        const old = await shop.d.rows('gift_cards');
        for (const [code, [status, balance, rows]] of Object.entries(were)) {
          const twin = cards.find((card) => card['code'] === code);
          if (rows === 0) {
            // A card with no history is not brought in: there was nothing on it to keep.
            expect(twin, code).toBeUndefined();
            continue;
          }
          expect(twin, code).toBeDefined();
          const history = ledger.filter((row) => row['card_id'] === twin!['id']);
          if (status === 'void') {
            // Cancelled at the till, cancelled here: its old row is kept, and what was on it is written off with the reason.
            expect([code, twin!['status'], cents(twin!['balance']), twin!['void_reason']]).toEqual([code, 'void', 0, OPTIONS.voidReason]);
            expect(history.filter((row) => row['kind'] === 'issue').map((row) => cents(row['amount']))).toEqual([balance]);
          } else expect([code, twin!['status'], cents(twin!['balance']), history.length]).toEqual([code, status, balance, rows]);
          expect([true, 1]).not.toContain(twin!['moving']);
          expect(String(twin!['moved_from'])).toBe(String(old.find((card) => card['code'] === code)!['id']));
        }
        // The sample card: three old rows, three new ones — $25.00 in, $25.00 in, $11.50 out.
        const sample = cards.find((card) => card['code'] === 'GC-48219930')!;
        expect(ledger.filter((row) => row['card_id'] === sample['id']).sort((a, b) => Date.parse(String(a['at'])) - Date.parse(String(b['at']))).map((row) => [row['kind'], cents(row['amount']), cents(row['balance_after'])])).toEqual([['issue', 2500, 2500], ['top_up', 2500, 5000], ['spend', -1150, 3850]]);
        // No email went to anybody for a card they have held for months.
        expect(await shop.d.rows('offers_messages')).toEqual([]);
        // The till remembers; the latch is off; every old card is closed with what it held.
        expect([true, 1]).toContain((await settings())['cards_moved']);
        expect([true, 1]).not.toContain(await latch());
        for (const card of old) expect([card['code'], card['status'], cents(card['balance'])]).toEqual([card['code'], 'moved', were[String(card['code'])]![1]]);
      }, 180_000);

      it('pressed a third time it writes nothing more', async () => {
        const before = [(await shop.d.rows('offers_card_ledger')).length, (await shop.d.rows('offers_gift_cards')).length];
        const door = moveDoor(shop.staff, shop);
        const again = await runCardMove(door, OPTIONS);
        expect(again).toEqual({ ...done, alreadyDone: true });
        expect(door.writes).toBe(0);
        expect([(await shop.d.rows('offers_card_ledger')).length, (await shop.d.rows('offers_gift_cards')).length]).toEqual(before);
      }, 60_000);

      it('after it: a late write to the old tables is refused, and no card is made there again', async () => {
        const old = (await shop.d.rows('gift_cards')).find((card) => card['code'] === 'GC-48219930')!;
        const late = await shop.d.post('gift_card_ledger', { id: randomUUID(), card_id: old['id'], kind: 'redeem', amount: -5 });
        expect([late.status, late.code]).toEqual([409, 'RECORD_LOCKED']);
        expect((await shop.d.patch('gift_cards', old['id'], { status: 'active' })).status).toBe(409);
        const made = await shop.d.post('gift_cards', { status: 'inactive' });
        expect(made.status).toBe(409);
        expect(cents((await shop.d.rows('gift_cards')).find((card) => card['id'] === old['id'])!['balance'])).toBe(3850);
      }, 60_000);

      it('the moved card pays a ticket through Offers under its old code: $38.50, then $27.67 left', async () => {
        const ticket = await shop.d.insert('tickets', { guests: 1, status: 'open' });
        await shop.d.insert('ticket_items', { ticket_id: ticket['id'], name: 'Flat White', qty: 2, unit_price: 5 });
        const pay = await shop.d.post('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', card_code: 'gc-48219930' });
        expect(pay.status, JSON.stringify(pay.body).slice(0, 500)).toBe(201);
        expect([cents(pay.body.data['card_amount']), pay.body.data['card_last4'], cents(pay.body.data['card_balance_after'])]).toEqual([1083, '9930', 2767]);
        const closed = await shop.d.update('tickets', ticket['id'], { status: 'paid', closed_at: new Date().toISOString() });
        expect(closed['status']).toBe('paid');
        expect(cents((await offersCards()).find((card) => card['code'] === 'GC-48219930')!['balance'])).toBe(2767);
        // The cancelled card is cancelled there too, with its money shown and unspendable.
        const refused = await shop.d.post('payments', { id: randomUUID(), ticket_id: (await shop.d.insert('tickets', { guests: 1, status: 'open' }))['id'], method: 'gift_card', card_code: Object.keys(were).find((code) => were[code]![0] === 'void')! });
        expect(refused.status).toBeGreaterThanOrEqual(400);
      }, 120_000);
    });
  });
});
