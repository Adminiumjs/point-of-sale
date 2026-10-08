/**
 * A TICKET'S CENTS, CASE BY CASE, ON EVERY ENGINE.
 *
 * Adminium works out a ticket's reduction, tax and total; the till shows an
 * estimate until the answer is in. Each case below is written through the
 * till's own doors with no add-on installed — the till as 0.2.x had it, but
 * for who does the arithmetic — and the server's figures are held against the
 * till's estimate (`estimate` in state/calc.ts), cent for cent.
 *
 * The ticket is the till's: Breakfast Bowl 3 × $12.00, Flat White 2 × $5.00,
 * Croissant 2 × $3.80 — goods $53.60 — at 8.25 %.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { estimate, type EstimateLine } from '../state/calc';
import type { Discount } from '../data/types';
import { ENGINES, missing, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 4;
const RATE = 0.0825;

const GOODS: (EstimateLine & { name: string })[] = [
  { name: 'Breakfast Bowl', unit: 12, qty: 3 },
  { name: 'Flat White', unit: 5, qty: 2 },
  { name: 'Croissant', unit: 3.8, qty: 2 },
];
const KIND = { percent: 'pct', amount: 'amt', comp: 'comp' } as const;

describe.skipIf(why !== null)(`a ticket's cents on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let person: Row;
      let oldCard: Row;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_totals_${engine}`);
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        person = await s.insert('staff', { name: 'Mira Costa' });
        oldCard = await s.insert('gift_cards', { status: 'inactive' });
      }, 300_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      /** A ticket written as the till writes it: each line a save of its own. */
      const ticketOf = async (lines: readonly (EstimateLine & { name: string })[]): Promise<{ id: unknown; lines: Row[] }> => {
        const ticket = await s.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
        const made: Row[] = [];
        for (const line of lines) made.push(await s.insert('ticket_items', { ticket_id: ticket['id'], name: line.name, qty: line.qty, unit_price: line.unit, seat: 1, ...(line.load === true ? { gift_card_id: oldCard['id'] } : {}) }));
        return { id: ticket['id'], lines: made };
      };
      const figures = (ticket: Row) => ({ subtotal: cents(ticket['subtotal']), discount: cents(ticket['own_discount']), net: cents(ticket['net']), tax: cents(ticket['tax']), total: cents(ticket['total']) });
      const estimated = (lines: readonly EstimateLine[], discount: Pick<Discount, 'kind' | 'value'> | null) => {
        const e = estimate(lines, discount, RATE);
        return { subtotal: cents(e.subtotal), discount: cents(e.discount), net: cents(e.net), tax: cents(e.tax), total: cents(e.total) };
      };
      /** One case: the ticket, an optional ticket discount, and what both the server and the estimate must say. */
      const check = async (lines: readonly (EstimateLine & { name: string })[], discount: { kind: 'percent' | 'amount' | 'comp'; value: number | null } | null, want: { subtotal: number; discount: number; net: number; tax: number; total: number }) => {
        const ticket = await ticketOf(lines);
        const row = discount === null ? await s.one('tickets', ticket.id) : await s.update('tickets', ticket.id, { discount_kind: discount.kind, discount_value: discount.value });
        expect(figures(row), 'the server').toEqual(want);
        expect(estimated(lines, discount === null ? null : { kind: KIND[discount.kind], value: discount.value ?? 0 }), 'the till’s estimate').toEqual(want);
        expect(cents(row['due'])).toBe(want.total);
        return { ...ticket, row };
      };

      it('no reduction: tax $4.42, total $58.02', async () => {
        await check(GOODS, null, { subtotal: 5360, discount: 0, net: 5360, tax: 442, total: 5802 });
      }, 60_000);

      it('12.5 % of $49.80 lands on a half-cent: −$6.23, rounded once, half up; tax $3.59; total $47.16', async () => {
        // The ticket after one croissant came off by voucher: $49.80 of goods.
        const lines = [GOODS[0]!, GOODS[1]!, { name: 'Croissant', unit: 3.8, qty: 1 }];
        await check(lines, { kind: 'percent', value: 12.5 }, { subtotal: 4980, discount: 623, net: 4357, tax: 359, total: 4716 });
      }, 60_000);

      it('an amount larger than the goods stops at the goods: net, tax and total $0.00', async () => {
        await check(GOODS, { kind: 'amount', value: 60 }, { subtotal: 5360, discount: 5360, net: 0, tax: 0, total: 0 });
      }, 60_000);

      it('a comp takes the goods off: total $0.00, and the ticket closes with nothing paid', async () => {
        const { id } = await check(GOODS, { kind: 'comp', value: null }, { subtotal: 5360, discount: 5360, net: 0, tax: 0, total: 0 });
        const closed = await s.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        expect([closed['status'], cents(closed['total'])]).toEqual(['paid', 0]);
      }, 60_000);

      it('the Croissant line voided: subtotal $46.00, tax $3.80 ($3.795, half up), total $49.80', async () => {
        const ticket = await ticketOf(GOODS);
        await s.update('ticket_items', ticket.lines[2]!['id'], { voided_at: new Date().toISOString(), void_reason: 'Dropped' });
        expect(figures(await s.one('tickets', ticket.id))).toEqual({ subtotal: 4600, discount: 0, net: 4600, tax: 380, total: 4980 });
        expect(estimated(GOODS.slice(0, 2), null)).toEqual({ subtotal: 4600, discount: 0, net: 4600, tax: 380, total: 4980 });
      }, 60_000);

      it('a $50.00 card load is taxed and reduced on nothing: $108.02; with 10 % off, $102.22; with a comp, the load only', async () => {
        const lines = [...GOODS, { name: 'Gift card', unit: 50, qty: 1, load: true }];
        await check(lines, null, { subtotal: 10360, discount: 0, net: 5360, tax: 442, total: 10802 });
        await check(lines, { kind: 'percent', value: 10 }, { subtotal: 10360, discount: 536, net: 4824, tax: 398, total: 10222 });
        await check(lines, { kind: 'comp', value: null }, { subtotal: 10360, discount: 5360, net: 0, tax: 0, total: 5000 });
      }, 90_000);

      it('split evenly in two, a tip on the last payment: what is owing falls with each, and the tip is none of it', async () => {
        const { id } = await check(GOODS, null, { subtotal: 5360, discount: 0, net: 5360, tax: 442, total: 5802 });
        await s.insert('payments', { id: randomUUID(), ticket_id: id, method: 'card', amount: 29.01, tip: 0, staff_id: person['id'] });
        expect(cents((await s.one('tickets', id))['due'])).toBe(2901);
        // More than is owing is refused, and says what is.
        const over = await s.post('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 29.02 });
        expect([over.status, over.code, cents(over.details['balance'])]).toEqual([409, 'BALANCE_EXCEEDED', 2901]);
        await s.insert('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 29.01, tip: 8.04, staff_id: person['id'] });
        const closed = await s.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString(), tip: 8.04 });
        expect([cents(closed['total']), cents(closed['due']), cents(closed['charged'])]).toEqual([5802, 0, 6606]);
      }, 60_000);

      it('cannot be marked paid with something owing, or twice', async () => {
        const { id } = await ticketOf(GOODS);
        const early = await s.patch('tickets', id, { status: 'paid', closed_at: new Date().toISOString() });
        expect([early.status, early.code, early.details['requires']]).toEqual([409, 'STATE_MOVE_REFUSED', 'due']);
        await s.insert('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 58.02 });
        await s.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString() });
        const again = await s.patch('tickets', id, { status: 'paid' });
        expect(again.status === 200 ? (again.body.data['status'] as string) : again.code).not.toBe('open');
        // Nor opened again, nor voided: a sale is undone by a refund.
        for (const to of ['open', 'void']) expect([(await s.patch('tickets', id, { status: to })).status, to]).toEqual([409, to]);
      }, 60_000);

      it("a paid ticket's figures never move: its lines and payments are closed, the tip and the receipt columns still write", async () => {
        const { id, lines } = await ticketOf(GOODS);
        await s.insert('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 58.02 });
        const paid = await s.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString(), tip: 1 });
        const refusals = [
          await s.post('ticket_items', { ticket_id: id, name: 'Late', qty: 1, unit_price: 1 }),
          await s.patch('ticket_items', lines[0]!['id'], { qty: 1 }),
          await s.post('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 0 }),
          await s.patch('tickets', id, { discount_kind: 'comp' }),
          await s.patch('tickets', id, { closed_at: new Date().toISOString() }),
        ];
        expect(refusals.map((r) => r.status)).toEqual([409, 409, 409, 409, 409]);
        // What the till writes after the sale.
        const after = await s.update('tickets', id, { tip: 2, kitchen_status: 'served', held: false, pickup_code: 'A12', pickup_stage: 'collected', ready_at: new Date().toISOString(), notified_at: new Date().toISOString(), signed_at: new Date().toISOString(), receipt_via: 'email', receipt_to: 'guest@tillmail.net' });
        expect(figures(after)).toEqual(figures(paid));
        expect(cents(after['charged'])).toBe(6002);
        // Money a writer names is never what is kept.
        const named = await s.update('tickets', id, { tax: 0, total: 1, due: 5, paid: 0, tip: 2 });
        expect(figures(named)).toEqual(figures(paid));
      }, 60_000);

      it('a refund is worked out by Adminium, and never gives back more than the payment took', async () => {
        const { id, lines } = await ticketOf(GOODS);
        const payment = await s.insert('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 58.02 });
        await s.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString() });
        const refund = await s.insert('refunds', { id: randomUUID(), ticket_id: id, method: 'cash', payment_id: payment['id'], amount: 99, tax: 99 }, { refund_items: [{ id: randomUUID(), ticket_item_id: lines[2]!['id'], qty: 1 }] });
        // One croissant: $3.80 and its tax, $0.31.
        expect([cents(refund['amount']), cents(refund['tax'])]).toEqual([411, 31]);
        const over = await s.post('refunds', { id: randomUUID(), ticket_id: id, method: 'cash', payment_id: payment['id'] }, { refund_items: [{ id: randomUUID(), ticket_item_id: lines[0]!['id'], qty: 30 }] });
        expect([over.status, over.code]).toEqual([409, 'BALANCE_EXCEEDED']);
        // No refund on a ticket that is not paid.
        const open = await ticketOf(GOODS);
        const early = await s.post('refunds', { id: randomUUID(), ticket_id: open.id, method: 'cash' }, { refund_items: [{ id: randomUUID(), ticket_item_id: open.lines[0]!['id'], qty: 1 }] });
        expect(early.status).toBe(409);
      }, 60_000);

      it('a cashier cannot set a ticket’s tax rate, and a ticket takes the rate of the day it was opened', async () => {
        const cashier = s.as(await s.member('cashier', 'Sam Okafor'));
        const refused = await cashier.post('tickets', { guests: 1, status: 'open', tax_rate_bp: 0 });
        expect(refused.status).toBeGreaterThanOrEqual(400);
        const ticket = await cashier.insert('tickets', { guests: 1, status: 'open' });
        expect(Number(ticket['tax_rate_bp'])).toBe(825);
        expect((await cashier.patch('tickets', ticket['id'], { tax_rate_bp: 0 })).status).toBeGreaterThanOrEqual(400);
        // The rate changes; the open ticket keeps the one it has.
        const settings = (await s.rows('settings'))[0]!;
        await s.update('settings', settings['id'], { tax_rate_bp: 1000 });
        await cashier.insert('ticket_items', { ticket_id: ticket['id'], name: 'Flat White', qty: 2, unit_price: 5 });
        expect(cents((await s.one('tickets', ticket['id']))['tax'])).toBe(83);
        await s.update('settings', settings['id'], { tax_rate_bp: 825 });
      }, 90_000);
    });
  });
});
