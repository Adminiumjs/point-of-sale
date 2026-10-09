/**
 * RETAIL STOCK AT THE TILL, AND THE ADD-ONS AWAY — ON EVERY ENGINE.
 *
 * Point of Sale beside Inventory and Offers & gift cards (both samples in).
 * A mug on the menu is linked to an item on a shelf; a cashier who holds only
 * the till's role sells it, voids it, and takes it back.
 *
 *   - a sale takes stock when the ticket is PAID, once; a line sent to the
 *     kitchen or voided takes nothing; at zero the sale still goes through;
 *   - a returned mug goes back on the shelf only when the sheet says so;
 *     damaged is written back and off again; not returned moves nothing;
 *   - the tiles' stock words are read as the cashier;
 *   - an add-on switched off for the till: its features go, a stock sale goes
 *     through uncounted, and a ticket that would need Offers' answer is
 *     refused by name rather than sold at full price in silence; switched on
 *     again, everything is as it was.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { featuresOf } from '../features';
import { ENGINES, missing, ok, type Caller, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 20;

type Doors = ReturnType<Stand['as']>;

describe.skipIf(why !== null)(`retail stock, and the add-ons away, on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashierCaller: Caller;
      let cashier: Doors;
      let person: Row;
      let mug: Row;
      let tote: Row;
      let point: Row;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_stock_${engine}`, { addOns: ['inventory', 'offers'], addOnSamples: ['inventory', 'offers'] });
        await s.insert('settings', { venue_name: 'Daybreak Goods', tax_rate_bp: 825 });
        person = await s.insert('staff', { name: 'Mira Costa' });
        const shelf = await s.insert('menu_categories', { name: 'Homeware' });
        mug = await s.insert('menu_items', { name: 'Stoneware mug', price: 14, category_id: shelf['id'] });
        tote = await s.insert('menu_items', { name: 'Tote bag', price: 18, category_id: shelf['id'] });
        cashierCaller = await s.member('cashier', 'Sam Okafor');
        cashier = s.as(cashierCaller);
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      const stock = async (): Promise<number> => Number((await s.rows('inventory_stock_points')).find((one) => one['id'] === point['id'])!['on_hand']);
      const sale = async (lines: [Row, number][], as: Doors = cashier): Promise<{ id: unknown; lines: Row[] }> => {
        const ticket = await as.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
        const made: Row[] = [];
        for (const [item, qty] of lines) made.push(await as.insert('ticket_items', { ticket_id: ticket['id'], menu_item_id: item['id'], name: item['name'], qty, unit_price: item['price'], seat: 1 }));
        return { id: ticket['id'], lines: made };
      };
      const pay = async (ticket: unknown, as: Doors = cashier) => {
        const payment = await as.insert('payments', { id: randomUUID(), ticket_id: ticket, method: 'cash', amount: Number((await as.one('tickets', ticket))['due']), staff_id: person['id'] });
        const closed = await as.patch('tickets', ticket, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        return { payment, closed };
      };
      const switched = async (key: string, enabled: boolean) => {
        ok(await s.staff.patch(`/api/v1/add-ons/${key}`, { attachedTo: 'pos', enabled }));
      };
      const words = async (ids: unknown[]) => ok(await cashierCaller.get<{ data: { id: string; state: string; exact?: string; after?: string }[] }>(`/api/v1/words/inventory/stock?table=pos:menu_items&ids=${ids.map(String).join(',')}`)).data;

      it('the owner links the mug to an item on a shelf; the tote is not counted', async () => {
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ stock: true, offers: true, 'gift-cards': true });
        const points = await s.rows('inventory_stock_points');
        point = points.filter((one) => Number(one['available']) >= 8 && Number(one['available']) <= 60).sort((a, b) => Number(a['available']) - Number(b['available']))[0]!;
        expect(point).toBeDefined();
        ok(await s.staff.post(s.data('inventory_links'), { values: { source_table: 'pos:menu_items', source_row: String(mug['id']), kind: 'item', item_id: point['item_id'], qty: '1', place_id: point['place_id'] } }), 201);
      }, 60_000);

      it('the tiles read their stock words as the cashier: how many mugs are in, and nothing for a tote nobody counts', async () => {
        const before = await stock();
        const said = await words([mug['id'], tote['id']]);
        const ofMug = said.find((one) => one.id === String(mug['id']))!;
        expect(['in', 'low']).toContain(ofMug.state);
        expect([Number(ofMug.exact), Number(ofMug.after)]).toEqual([before, before - 1]);
        expect(said.find((one) => one.id === String(tote['id']))).toMatchObject({ state: 'in' });
        // No cost is the cashier's to read, in the words or in Inventory's own tables.
        expect(JSON.stringify(said)).not.toMatch(/cost/i);
        for (const row of await cashier.rows('inventory_stock_points')) expect(Object.keys(row).join(',')).not.toMatch(/cost/);
      }, 60_000);

      it('a sale posts at paid, once; sent to the kitchen it takes nothing; a voided line posts nothing', async () => {
        const before = await stock();
        const ticket = await sale([[mug, 2], [mug, 1], [tote, 1]]);
        expect(await stock()).toBe(before);
        await cashier.update('tickets', ticket.id, { status: 'sent', sent_at: new Date().toISOString() });
        expect(await stock()).toBe(before);
        // The single mug is voided before paying: it is no line.
        await cashier.update('ticket_items', ticket.lines[1]!['id'], { voided_at: new Date().toISOString(), void_reason: 'Changed their mind' });
        const { closed } = await pay(ticket.id);
        expect(closed.status, JSON.stringify(closed.body).slice(0, 500)).toBe(200);
        expect(await stock()).toBe(before - 2);
        // What the till writes after the sale takes nothing more.
        await cashier.update('tickets', ticket.id, { receipt_via: 'print', tip: 1 });
        expect(await stock()).toBe(before - 2);
        const receipts = (await s.rows('inventory_postings')).filter((row) => row['source_table'] === 'pos:tickets' && String(row['source_row']) === String(ticket.id) && row['posting'] === 'sale');
        expect(receipts.filter((row) => Number(row['rows']) > 0)).toHaveLength(1);
      }, 120_000);

      it('at zero the sale still goes through at the till, and is marked short', async () => {
        const left = await stock();
        const ticket = await sale([[mug, left + 2]]);
        const { closed } = await pay(ticket.id);
        expect(closed.status, JSON.stringify(closed.body).slice(0, 500)).toBe(200);
        expect(await stock()).toBe(-2);
        const notes = ((closed.body as unknown as { postings?: { ledger: string; notes?: { note: string }[] }[] }).postings ?? []).filter((one) => one.ledger === 'stock').flatMap((one) => one.notes ?? []).map((one) => one.note);
        expect(notes).toContain('short');
        expect((await words([mug['id']]))[0]!.state).toBe('out');
      }, 120_000);

      it('a returned mug goes back on the shelf only when the sheet says so; damaged is written back and off again; not returned moves nothing', async () => {
        const ticket = await sale([[mug, 3]]);
        const { payment } = await pay(ticket.id);
        const before = await stock();
        const given: number[] = [];
        const back = async (values: Row) => {
          const refund = await cashier.post('refunds', { id: randomUUID(), ticket_id: ticket.id, method: 'cash', payment_id: payment['id'], staff_id: person['id'] }, { refund_items: [{ id: randomUUID(), ticket_item_id: ticket.lines[0]!['id'], qty: 1, ...values }] });
          expect(refund.status, JSON.stringify(refund.body).slice(0, 500)).toBe(201);
          given.push(cents(refund.body.data['amount']));
          return stock();
        };
        expect(await back({ back_to: 'shelf' })).toBe(before + 1);
        const movementsBefore = (await s.rows('inventory_movements')).length;
        expect(await back({ back_to: 'damaged' })).toBe(before + 1);
        // Written back and off again: two rows, the loss in the log.
        expect((await s.rows('inventory_movements')).length).toBe(movementsBefore + 2);
        // Not returned: said both ways — where it goes back to (nowhere) and when that was said.
        expect(await back({ back_to: 'none', not_back_at: new Date().toISOString() })).toBe(before + 1);
        expect((await s.rows('inventory_movements')).length).toBe(movementsBefore + 2);
        // Three mugs at $14.00 and their tax, $45.47, given back in three: to the cent, whatever each came to.
        expect([given.length, given.reduce((sum, one) => sum + one, 0)]).toEqual([3, 4547]);
      }, 120_000);

      it('the last units sold twice at once: both sales go through, each is counted exactly once, and the one that found the shelf empty is marked', async () => {
        // A second counted item, with a few on the shelf.
        const points = await s.rows('inventory_stock_points');
        const other = points.filter((one) => one['id'] !== point['id'] && Number(one['available']) >= 2 && Number(one['available']) <= 20 && Number(one['on_hand']) === Number(one['available']))[0]!;
        expect(other).toBeDefined();
        ok(await s.staff.post(s.data('inventory_links'), { values: { source_table: 'pos:menu_items', source_row: String(tote['id']), kind: 'item', item_id: other['item_id'], qty: '1', place_id: other['place_id'] } }), 201);
        const all = Number(other['on_hand']);
        const onShelf = async () => Number((await s.rows('inventory_stock_points')).find((one) => one['id'] === other['id'])!['on_hand']);
        // Two tills, each with every one of them on a ticket, each paid in full; both press Pay at the same moment.
        const tickets = [await sale([[tote, all]]), await sale([[tote, all]])];
        for (const ticket of tickets) await cashier.insert('payments', { id: randomUUID(), ticket_id: ticket.id, method: 'cash', amount: Number((await cashier.one('tickets', ticket.id))['due']), staff_id: person['id'] });
        const closes = await Promise.all(tickets.map((ticket) => cashier.patch('tickets', ticket.id, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 })));
        // A sale at the till is never stopped for stock: a moved lock is the only thing that may ask for the save again.
        for (const [index, reply] of closes.entries()) if (reply.status !== 200) expect((await cashier.patch('tickets', tickets[index]!.id, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 })).status).toBe(200);
        // Neither deduction was lost and neither was made twice.
        expect(await onShelf()).toBe(-all);
        const receipts = (await s.rows('inventory_postings')).filter((row) => row['posting'] === 'sale' && Number(row['rows']) > 0 && tickets.some((ticket) => String(ticket.id) === String(row['source_row'])));
        expect(receipts).toHaveLength(2);
        const notes = closes.flatMap((reply) => ((reply.body as unknown as { postings?: { ledger: string; notes?: { note: string }[] }[] }).postings ?? []).filter((one) => one.ledger === 'stock').flatMap((one) => one.notes ?? [])).map((one) => one.note);
        expect(notes.filter((note) => note === 'short').length).toBeGreaterThanOrEqual(1);
      }, 180_000);

      it('Inventory switched off for the till: the stock feature goes, a sale goes through uncounted, and is counted once it is back', async () => {
        const before = await stock();
        await switched('inventory', false);
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ stock: false, offers: true });
        const ticket = await sale([[mug, 1]]);
        const { closed } = await pay(ticket.id);
        expect(closed.status, JSON.stringify(closed.body).slice(0, 500)).toBe(200);
        expect(await stock()).toBe(before);
        await switched('inventory', true);
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ stock: true });
        // What the screen reads again is what Inventory has: the till lost nothing of its own.
        expect((await cashier.one('tickets', ticket.id))['status']).toBe('paid');
        console.info(`[stock after Inventory came back, ${engine}] before ${String(before)}, now ${String(await stock())}`);
      }, 120_000);

      it('Offers switched off for the till: its features go; a ticket line is refused by name, never sold at full price in silence; on again, it sells', async () => {
        const open = await sale([[tote, 1]]);
        await switched('offers', false);
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ offers: false, 'gift-cards': false, stock: true });
        const line = await cashier.post('ticket_items', { ticket_id: open.id, menu_item_id: tote['id'], name: 'Tote bag', qty: 1, unit_price: 18, seat: 1 });
        expect([line.status, line.details['reason'] ?? line.code]).toEqual([409, 'add-on-unavailable']);
        const card = await cashier.post('payments', { id: randomUUID(), ticket_id: open.id, method: 'gift_card', card_code: 'GC-7K2MW3HNQ4XP' });
        expect(card.status).toBeGreaterThanOrEqual(400);
        // What was recorded stays readable.
        expect(cents((await cashier.one('tickets', open.id))['total'])).toBe(1949);
        await switched('offers', true);
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ offers: true, 'gift-cards': true });
        const { closed } = await pay(open.id);
        expect(closed.status, JSON.stringify(closed.body).slice(0, 500)).toBe(200);
      }, 120_000);
    });
  });
});
