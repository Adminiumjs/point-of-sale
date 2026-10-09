/**
 * GIFT CARDS SOLD, LOADED, SPENT AND REFUNDED THROUGH OFFERS & GIFT CARDS,
 * ON EVERY ENGINE.
 *
 * Point of Sale beside Offers & gift cards (its sample in), a shop with no
 * card of its own to move — so the till's cards are Offers' from the start.
 * A cashier who holds only the till's role does the selling and the paying;
 * the card's money is never a figure the till sends.
 *
 * The server's clock is the contract's, so "twelve hours on" is a moment the
 * file can reach.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ENGINES, missing, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 16;
const START = Date.now();

type Doors = ReturnType<Stand['as']>;

describe.skipIf(why !== null)(`gift cards through Offers & gift cards on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashier: Doors;
      let person: Row;
      let goodwill: Row;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_cards_${engine}`, { addOns: ['offers'], addOnSamples: ['offers'], now: START });
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        person = await s.insert('staff', { name: 'Mira Costa' });
        cashier = s.as(await s.member('cashier', 'Sam Okafor'));
        goodwill = (await s.rows('offers_reasons')).find((r) => r['label'] === 'Goodwill')!;
        await s.insert('offers_ceilings', { role: 'pos-cashier', max_percent: 10, may_comp: false });
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      /** A card as the desk makes one: not sold yet, holding nothing; its whole code this once. */
      const newCard = async (): Promise<{ id: unknown; code: string }> => {
        const made = await s.post('offers_gift_cards', { kind: 'card' });
        expect(made.status, JSON.stringify(made.body).slice(0, 400)).toBe(201);
        const once = (made.body as unknown as { once: { column: string; value: string }[] }).once;
        return { id: made.body.data['id'], code: once.find((entry) => entry.column === 'code')!.value };
      };
      const card = async (id: unknown) => (await s.rows('offers_gift_cards')).find((one) => one['id'] === id)!;
      const ticketOf = async (lines: Row[]): Promise<unknown> => {
        const ticket = await cashier.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
        for (const line of lines) await cashier.insert('ticket_items', { ticket_id: ticket['id'], seat: 1, qty: 1, ...line });
        return ticket['id'];
      };
      const due = async (ticket: unknown) => Number((await cashier.one('tickets', ticket))['due']);
      const payCash = async (ticket: unknown) => cashier.insert('payments', { id: randomUUID(), ticket_id: ticket, method: 'cash', amount: await due(ticket), staff_id: person['id'] });
      const payCard = (ticket: unknown, code: string) => cashier.post('payments', { id: randomUUID(), ticket_id: ticket, method: 'gift_card', card_code: code, staff_id: person['id'] });
      const close = (ticket: unknown) => cashier.patch('tickets', ticket, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
      /** A card holding money: sold on a ticket of its own, paid in cash. */
      const soldCard = async (amount: number): Promise<{ id: unknown; code: string }> => {
        const made = await newCard();
        const ticket = await ticketOf([{ name: 'Gift card', unit_price: amount, card_id: made.id }]);
        await payCash(ticket);
        expect((await close(ticket)).status).toBe(200);
        return made;
      };

      let fifty: { id: unknown; code: string };
      it('a $50.00 card sold, $18.60 spent: $31.40 in Offers and on the payment', async () => {
        fifty = await newCard();
        expect([(await card(fifty.id))['status'], cents((await card(fifty.id))['balance'])]).toEqual(['inactive', 0]);
        // Sold: a line that names the card; nothing is on it until the ticket is paid.
        const sale = await ticketOf([{ name: 'Gift card', unit_price: 50, card_id: fifty.id }]);
        const sold = await cashier.one('tickets', sale);
        expect([cents(sold['subtotal']), cents(sold['goods']), cents(sold['tax']), cents(sold['total'])]).toEqual([5000, 0, 0, 5000]);
        expect(cents((await card(fifty.id))['balance'])).toBe(0);
        await payCash(sale);
        expect((await close(sale)).status).toBe(200);
        expect([(await card(fifty.id))['status'], cents((await card(fifty.id))['balance'])]).toEqual(['active', 5000]);
        // Spent: the dry run says what the card covers, the save takes exactly that.
        const ticket = await ticketOf([{ name: 'Lunch', unit_price: 17.18 }]);
        expect(cents(await due(ticket))).toBe(1860);
        const body = { id: randomUUID(), ticket_id: ticket, method: 'gift_card', card_code: fifty.code, staff_id: person['id'] };
        const dry = await cashier.dryCreate('payments', body);
        expect(dry.status, JSON.stringify(dry.body).slice(0, 500)).toBe(200);
        const quoted = (dry.body as { payment: { amount: string; due: string } }).payment;
        expect([cents(quoted.amount), cents(quoted.due)]).toEqual([1860, 0]);
        expect(cents((await card(fifty.id))['balance'])).toBe(5000);
        const paid = await cashier.post('payments', body);
        expect(paid.status).toBe(201);
        expect([cents(paid.body.data['card_amount']), cents(paid.body.data['card_balance_after']), String(paid.body.data['card_last4'])]).toEqual([1860, 3140, fifty.code.slice(-4)]);
        // The whole code is not read back, by the cashier or in the reply.
        expect(JSON.stringify(paid.body)).not.toContain(fifty.code);
        expect((await close(ticket)).status).toBe(200);
        expect(cents((await card(fifty.id))['balance'])).toBe(3140);
      }, 120_000);

      it('a card cannot pay a ticket that sells a card; a load is never reduced or taxed; a cash payment and an ordinary line fire no card posting', async () => {
        const made = await newCard();
        const ticket = await ticketOf([
          { name: 'Gift card', unit_price: 50, card_id: made.id },
          { name: 'Lunch', unit_price: 20 },
        ]);
        // Ten percent comes off the lunch alone, and tax is on what is left of it.
        const reduced = await cashier.update('tickets', ticket, { discount_kind: 'percent', discount_value: 10, discount_reason_id: goodwill['id'] });
        expect([cents(reduced['subtotal']), cents(reduced['discount']), cents(reduced['net']), cents(reduced['tax']), cents(reduced['total'])]).toEqual([7000, 200, 1800, 149, 6949]);
        const refused = await payCard(ticket, fifty.code);
        expect([refused.status, refused.code, refused.details['reason']]).toEqual([409, 'POSTING_REFUSED', 'card-pays-card']);
        expect(cents((await card(fifty.id))['balance'])).toBe(3140);
        // Cash is taken as ever.
        await payCash(ticket);
        const closed = await close(ticket);
        expect(closed.status, JSON.stringify(closed.body).slice(0, 400)).toBe(200);
        expect(cents((await card(made.id))['balance'])).toBe(5000);
      }, 120_000);

      it('twenty tills spend one card at once: the balance is never passed', async () => {
        const shared = await soldCard(50);
        const tickets: unknown[] = [];
        for (let i = 0; i < 20; i += 1) tickets.push(await ticketOf([{ name: 'Coffee', unit_price: 5 }]));
        const replies = await Promise.all(tickets.map((ticket) => payCard(ticket, shared.code)));
        const took = replies.filter((reply) => reply.status === 201).reduce((sum, reply) => sum + cents(reply.body.data['card_amount']), 0);
        // Nine whole coffees at $5.41 and $1.31 towards a tenth is all $50.00 buys, whoever got there first.
        expect(took).toBeLessThanOrEqual(5000);
        expect(took).toBeGreaterThan(0);
        expect(cents((await card(shared.id))['balance'])).toBe(5000 - took);
        for (const reply of replies) if (reply.status !== 201) expect([409, 429, 503], JSON.stringify(reply.body).slice(0, 300)).toContain(reply.status);
        // Asked again one after another, the rest of the money is spent to the cent and then the card is empty.
        for (const [index, ticket] of tickets.entries()) if (replies[index]!.status !== 201 && cents((await card(shared.id))['balance']) > 0) await payCard(ticket, shared.code);
        expect(cents((await card(shared.id))['balance'])).toBe(0);
        const empty = await payCard(await ticketOf([{ name: 'Coffee', unit_price: 5 }]), shared.code);
        expect([empty.status, empty.code]).toEqual([409, 'POSTING_REFUSED']);
      }, 240_000);

      it('a card cancelled at the office does not pay from a till that read it before: refused, the ticket still open', async () => {
        const gone = await soldCard(25);
        await s.update('offers_gift_cards', gone.id, { status: 'void', void_reason: 'Reported lost' });
        const ticket = await ticketOf([{ name: 'Coffee', unit_price: 5 }]);
        const refused = await payCard(ticket, gone.code);
        expect(refused.status).toBeGreaterThanOrEqual(400);
        const now = await cashier.one('tickets', ticket);
        expect([now['status'], cents(now['due'])]).toEqual(['open', 541]);
        expect((await cashier.rows('payments')).filter((p) => p['ticket_id'] === ticket)).toEqual([]);
      }, 120_000);

      it('back to the card it came from, never more than it took; a cash refund fires no card posting; the browser sends no money', async () => {
        const ten = await soldCard(10);
        const ticket = await cashier.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
        const mugs = await cashier.insert('ticket_items', { ticket_id: ticket['id'], name: 'Mug', qty: 2, unit_price: 14, seat: 1 });
        // $30.31 in all: the card pays its $10.00, cash the rest.
        const byCard = await payCard(ticket['id'], ten.code);
        expect([cents(byCard.body.data['card_amount']), cents(byCard.body.data['card_balance_after'])]).toEqual([1000, 0]);
        const byCash = await payCash(ticket['id']);
        expect(cents(byCash['amount'])).toBe(2031);
        expect((await close(ticket['id'])).status).toBe(200);
        // One mug of the two, back to the card: $15.16 is owed back, the card took $10.00.
        const items = { refund_items: [{ id: randomUUID(), ticket_item_id: mugs['id'], qty: 1 }] };
        const quote = await cashier.dryCreate('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', payment_id: byCard.body.data['id'] }, items);
        expect(quote.status, JSON.stringify(quote.body).slice(0, 600)).toBe(200);
        const listed = (quote.body as { refund: { payments: { key: string; took: string; max: string }[] } }).refund.payments;
        expect(listed.map((one) => [one.key, cents(one.took), cents(one.max)]).sort()).toEqual([[String(byCard.body.data['id']), 1000, 1000], [String(byCash['id']), 2031, 2031]].sort());
        // A figure is not the cashier's to name on a refund at all.
        const named = await cashier.post('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', payment_id: byCard.body.data['id'], amount: 500, tax: 0 }, items);
        expect([named.status, named.code]).toEqual([403, 'COLUMN_FORBIDDEN']);
        const toCard = await cashier.post('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', payment_id: byCard.body.data['id'] }, items);
        expect(toCard.status, JSON.stringify(toCard.body).slice(0, 600)).toBe(201);
        expect(cents(toCard.body.data['amount'])).toBe(1000);
        expect(cents((await card(ten.id))['balance'])).toBe(1000);
        // The rest of that mug, in cash, against the cash payment: no card moves.
        const rest = await cashier.post('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', payment_id: byCash['id'] }, { refund_items: [{ id: randomUUID(), ticket_item_id: mugs['id'], qty: 1 }] });
        expect(rest.status, JSON.stringify(rest.body).slice(0, 600)).toBe(201);
        expect(cents((await card(ten.id))['balance'])).toBe(1000);
        // Nothing more goes back to a card than it took.
        const again = await cashier.post('refunds', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', payment_id: byCard.body.data['id'] }, items);
        expect(again.status).toBe(409);
        expect(cents((await card(ten.id))['balance'])).toBe(1000);
      }, 120_000);

      it('a card payment is held for twelve hours on a ticket left open; a paid ticket lets go of the hold', async () => {
        const left = await soldCard(20);
        const kept = await soldCard(20);
        const abandoned = await ticketOf([{ name: 'Coffee', unit_price: 5 }]);
        const first = await payCard(abandoned, left.code);
        expect(first.status).toBe(201);
        const finished = await ticketOf([{ name: 'Coffee', unit_price: 5 }]);
        const second = await payCard(finished, kept.code);
        expect(second.status).toBe(201);
        expect((await close(finished)).status).toBe(200);
        expect([cents((await card(left.id))['balance']), cents((await card(kept.id))['balance'])]).toEqual([1459, 1459]);
        // The payment says until when its money is held: twelve hours after it was made.
        expect(Date.parse(String(first.body.data['held_until'])) - Date.parse(String(first.body.data['paid_at']))).toBe(12 * 3_600_000);
        // Offers' own record of each payment: the open ticket's is kept until then (the clock gives it back to the
        // card after that); the paid ticket's is kept no longer — its money is the shop's.
        const receipts = (await s.rows('offers_postings')).filter((row) => row['posting'] === 'card');
        const of = (payment: Row) => receipts.find((row) => row['source_line'] === payment['id'])!;
        expect(Date.parse(String(of(first.body.data)['held_until']))).toBe(Date.parse(String(first.body.data['held_until'])));
        expect(of(second.body.data)['held_until'] ?? null).toBeNull();
        // Voiding the open ticket gives the money back at once.
        const voided = await cashier.patch('tickets', abandoned, { status: 'void' });
        expect(voided.status, JSON.stringify(voided.body).slice(0, 700)).toBe(200);
        expect(cents((await card(left.id))['balance'])).toBe(2000);
        expect(cents((await card(kept.id))['balance'])).toBe(1459);
      }, 120_000);
    });
  });
});
