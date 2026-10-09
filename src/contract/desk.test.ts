/**
 * THE TILL'S OWN DOORS, AGAINST A BUILT ADMINIUM.
 *
 * The other contract files speak plain HTTP. This one speaks through the code
 * the till ships — its session transport and `sessionDesk` (data/desk.ts),
 * built from the staff config exactly as `main.tsx` builds them — as a cashier
 * who holds only the till's role, beside Offers & gift cards and Inventory:
 * the reads a ticket's figures come from, the dry runs behind each preview,
 * the saves, the look-up and the stock words. What the screens then do with
 * the answers is the unit tests'.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addOnTables, sessionDesk, type Desk } from '../data/desk';
import { createSessionTransport } from '../data/sessionSource';
import { SinkError } from '../data/sink';
import { realTables } from '../data/tableOfRef';
import { WRITE_TABLES } from '../state/writes';
import { ENGINES, missing, ok, type Caller, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 28;

async function refusal(run: Promise<unknown>): Promise<SinkError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof SinkError) return error;
    throw error;
  }
  throw new Error('expected a refusal, and it went through');
}

describe.skipIf(why !== null)(`the till's own doors on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashier: Caller;
      let desk: Desk;
      let mug: Row;
      let goodwill: Row;
      let ticket: Row;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_desk_${engine}`, { addOns: ['offers', 'inventory'], addOnSamples: ['offers', 'inventory'] });
        await s.insert('settings', { venue_name: 'Daybreak Goods', tax_rate_bp: 825 });
        const shelf = await s.insert('menu_categories', { name: 'Homeware' });
        mug = await s.insert('menu_items', { name: 'Stoneware mug', price: 14, category_id: shelf['id'] });
        goodwill = (await s.rows('offers_reasons')).find((r) => r['label'] === 'Goodwill')!;
        await s.insert('offers_ceilings', { role: 'pos-cashier', max_percent: 10, may_comp: false });
        const point = (await s.rows('inventory_stock_points')).filter((one) => Number(one['available']) >= 8).sort((a, b) => Number(a['available']) - Number(b['available']))[0]!;
        ok(await s.staff.post(s.data('inventory_links'), { values: { source_table: 'pos:menu_items', source_row: String(mug['id']), kind: 'item', item_id: point['item_id'], qty: '1', place_id: point['place_id'] } }), 201);
        cashier = await s.member('cashier', 'Sam Okafor');
        // As main.tsx boots a hosted till: the staff config, the transport over it, the desk over both.
        const config = ok(await cashier.get<{ tables?: Record<string, string>; connectionId?: string; csrfToken?: string; timezone?: string; currency?: string | null; addOns?: Record<string, { tables?: Record<string, string> }> }>('/apps/pos/staff/surface-config.json'));
        const tables = realTables(config.tables ?? {});
        const transport = createSessionTransport({
          tableOfRef: tables,
          connectionId: config.connectionId,
          staff: { csrfToken: config.csrfToken!, timezone: config.timezone, currency: config.currency },
          fetchImpl: cashier.fetchAs(),
        } as never);
        desk = sessionDesk(transport, { ...WRITE_TABLES, ...(config.tables ?? {}), ...addOnTables(config.addOns) });
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it('a ticket and its lines are saved, and its figures are read back as Adminium worked them out', async () => {
        ticket = (await desk.create('tickets', { guests: 1, status: 'open' })).data;
        expect(Number(ticket['tax_rate_bp'])).toBe(825);
        const line = await desk.create('ticket_items', { ticket_id: ticket['id'], menu_item_id: mug['id'], name: 'Stoneware mug', qty: 2, unit_price: 14, seat: 1 });
        expect(line.applied ?? []).toEqual([]);
        const read = await desk.one('tickets', ticket['id'] as never);
        expect([cents(read['subtotal']), cents(read['net']), cents(read['tax']), cents(read['total']), cents(read['due'])]).toEqual([2800, 2800, 231, 3031, 3031]);
      }, 60_000);

      it('the reasons are read, a staff discount is tried and then saved, and over the ceiling is refused with its words', async () => {
        const reasons = await desk.rows('offers:reasons');
        expect(reasons.map((r) => r['label'])).toContain('Goodwill');
        const give = { discount_kind: 'percent', discount_value: 10, discount_reason_id: goodwill['id'] };
        const tried = await desk.dryUpdate('tickets', ticket['id'] as never, give as never);
        expect([cents(tried.data['discount']), cents(tried.data['total'])]).toEqual([280, 2728]);
        expect((tried.applied ?? []).map((one) => [one.kind, cents(one.amount)])).toEqual([['staff', 280]]);
        expect(cents((await desk.one('tickets', ticket['id'] as never))['total'])).toBe(3031);
        const over = await refusal(desk.patch('tickets', ticket['id'] as never, { ...give, discount_value: 20 } as never));
        expect([over.status, over.code]).toEqual([409, 'ADJUST_REFUSED']);
        expect(JSON.stringify(over)).toContain('over-ceiling');
        const saved = await desk.patch('tickets', ticket['id'] as never, give as never);
        expect(cents(saved.data['total'])).toBe(2728);
        // The reductions as the ticket's lines show them: Offers' rows for this ticket.
        const applied = await desk.rows('offers:applied', { and: [{ column: 'source_table', op: 'eq', value: 'pos:tickets' }, { column: 'source_row', op: 'eq', value: String(ticket['id']) }] });
        expect(applied.reduce((sum, row) => sum + cents(row['amount']), 0)).toBe(280);
      }, 60_000);

      it('a code is added and removed, and an unknown one is refused by its reason', async () => {
        // A ticket of its own, large enough for the code's minimum.
        const other = (await desk.create('tickets', { guests: 1, status: 'open' })).data;
        await desk.create('ticket_items', { ticket_id: other['id'], menu_item_id: mug['id'], name: 'Stoneware mug', qty: 4, unit_price: 14, seat: 1 });
        const added = await desk.create('ticket_codes', { ticket_id: other['id'], typed: 'AUTUMN5' });
        expect((added.applied ?? []).map((one) => [one.kind, cents(one.amount)])).toEqual([['code', 500]]);
        expect(cents((await desk.one('tickets', other['id'] as never))['total'])).toBe(5521);
        const codes = await desk.rows('ticket_codes', { column: 'ticket_id', op: 'eq', value: other['id'] });
        expect(codes.map((row) => row['typed'])).toEqual(['AUTUMN5']);
        const unknown = await refusal(desk.create('ticket_codes', { ticket_id: other['id'], typed: 'NOSUCHCODE' }));
        expect([unknown.status, unknown.code]).toEqual([409, 'ADJUST_REFUSED']);
        // Under a code's minimum is said as such.
        const small = await refusal(desk.create('ticket_codes', { ticket_id: ticket['id'], typed: 'AUTUMN5' }));
        expect(JSON.stringify(small)).toContain('needs-minimum');
        const removed = await desk.patch('ticket_codes', added.data['id'] as never, { removed_at: new Date().toISOString() });
        expect(removed.applied ?? []).toEqual([]);
        expect(cents((await desk.one('tickets', other['id'] as never))['total'])).toBe(6062);
      }, 60_000);

      it('a code is looked up, a card pays after its dry run, and the ticket closes on the server’s word', async () => {
        const found = await desk.lookUp('GC-7K2MW3HNQ4XP');
        expect([found.found, found.kind, found.last4]).toEqual([true, 'gift-card', 'Q4XP']);
        const body = { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', card_code: 'GC-7K2MW3HNQ4XP' };
        const tried = await desk.dryCreate('payments', body);
        expect([cents(tried.payment?.amount), cents(tried.payment?.due)]).toEqual([1900, 828]);
        const paid = await desk.create('payments', body);
        expect([cents(paid.data['card_amount']), paid.data['card_last4'], cents(paid.data['card_balance_after']), cents(paid.payment?.due)]).toEqual([1900, 'Q4XP', 0, 828]);
        // Too early: something is owing.
        const early = await refusal(desk.patch('tickets', ticket['id'] as never, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 }));
        expect([early.status, early.code]).toEqual([409, 'STATE_MOVE_REFUSED']);
        await desk.create('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', amount: 8.28 });
        const closed = await desk.patch('tickets', ticket['id'] as never, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        expect([closed.data['status'], cents(closed.data['total'])]).toEqual(['paid', 2728]);
      }, 60_000);

      it('a refund is quoted and saved with no money in it, and the tile reads its stock words', async () => {
        const lines = await desk.rows('ticket_items', { column: 'ticket_id', op: 'eq', value: ticket['id'] });
        const payments = await desk.rows('payments', { column: 'ticket_id', op: 'eq', value: ticket['id'] });
        const cash = payments.find((p) => p['method'] === 'cash')!;
        const tree = [{ ref: 'refund_items', via: 'refund_id', rows: [{ id: randomUUID(), ticket_item_id: lines[0]!['id'], qty: 1, back_to: 'shelf' }] }];
        const quote = await desk.dryCreate('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', payment_id: cash['id'] }, tree as never);
        expect(cents(quote.data['amount'])).toBeGreaterThan(0);
        expect((quote.refund?.payments ?? []).map((one) => one.key).sort()).toEqual(payments.map((p) => String(p['id'])).sort());
        const before = Number((await desk.stockWords([String(mug['id'])]))[0]!.exact);
        const given = await desk.create('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', payment_id: cash['id'] }, tree as never);
        expect(cents(given.data['amount'])).toBe(cents(quote.data['amount']));
        const words = await desk.stockWords([String(mug['id'])]);
        expect([words[0]!.id, Number(words[0]!.exact)]).toEqual([String(mug['id']), before + 1]);
      }, 60_000);
    });
  });
});
