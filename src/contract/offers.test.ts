/**
 * CODES, OFFERS AND STAFF DISCOUNTS AT THE TILL, ON EVERY ENGINE.
 *
 * Point of Sale beside Offers & gift cards (its sample in), driven through
 * the till's own doors as a cashier and a manager who hold only the till's
 * roles. Every figure is Adminium's: what a dry run answers is what the save
 * then stores.
 *
 * The ticket is the till's: Breakfast Bowl 3 × $12.00, Flat White 2 × $5.00,
 * Croissant 2 × $3.80 — $53.60 of goods at 8.25 %.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { featuresOf } from '../features';
import { ENGINES, missing, ok, type Caller, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 8;

type Doors = ReturnType<Stand['as']>;

describe.skipIf(why !== null)(`codes, offers and staff discounts on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashierCaller: Caller;
      let managerCaller: Caller;
      let cashier: Doors;
      let other: Doors;
      let manager: Doors;
      let person: Row;
      let menu: Record<string, Row> = {};
      let goodwill: Row;
      let croissantVoucher = '';

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_offers_${engine}`, { addOns: ['offers', 'invoices'], addOnSamples: ['offers'] });
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        person = await s.insert('staff', { name: 'Mira Costa' });
        const food = await s.insert('menu_categories', { name: 'Food' });
        for (const [name, price] of [['Breakfast Bowl', 12], ['Flat White', 5], ['Croissant', 3.8], ['Tote bag', 18]] as const) menu[name] = await s.insert('menu_items', { name, price, category_id: food['id'] });
        cashierCaller = await s.member('cashier', 'Sam Okafor');
        cashier = s.as(cashierCaller);
        other = s.as(await s.member('cashier', 'Lena Fischer'));
        managerCaller = await s.member('manager', 'Priya Nair');
        manager = s.as(managerCaller);
        goodwill = (await s.rows('offers_reasons')).find((r) => r['label'] === 'Goodwill')!;
        // The owner says how much each of the till's roles may give: ten percent at the counter, half for a manager, a comp for neither.
        await s.insert('offers_ceilings', { role: 'pos-cashier', max_percent: 10, may_comp: false });
        await s.insert('offers_ceilings', { role: 'pos-manager', max_percent: 50, may_comp: false });
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      const ticketOf = async (as: Doors, lines: [string, number][] = [['Breakfast Bowl', 3], ['Flat White', 2], ['Croissant', 2]], values: Row = {}): Promise<unknown> => {
        const ticket = await as.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'], ...values });
        for (const [name, qty] of lines) await as.insert('ticket_items', { ticket_id: ticket['id'], menu_item_id: menu[name]!['id'], name, qty, unit_price: menu[name]!['price'], seat: 1 });
        return ticket['id'];
      };
      const figures = (ticket: Row) => [cents(ticket['subtotal']), cents(ticket['discount']), cents(ticket['net']), cents(ticket['tax']), cents(ticket['total'])];
      const applied = (reply: { body: unknown }) => ((reply.body as { applied?: { name: string; kind: string; amount: string; typed: boolean }[] }).applied ?? []).map((one) => [one.kind, one.name, cents(one.amount)]);

      it('has the two features of Offers on, and ticks nothing of Inventory', async () => {
        expect(featuresOf((await s.config()).addOns as never)).toMatchObject({ offers: true, 'gift-cards': true, stock: false });
      }, 60_000);

      it('the owner issues a voucher for one croissant, named by the till’s own menu', async () => {
        const made = await s.post('offers_vouchers', { worth: 'thing', what: 'item', source_table: 'pos:menu_items', source_row: String(menu['Croissant']!['id']), units: 1, public_name: 'One croissant', uses_total: 1 });
        expect(made.status, JSON.stringify(made.body).slice(0, 800)).toBe(201);
        const once = (made.body as unknown as { once?: { column: string; value: string }[] }).once ?? [];
        croissantVoucher = once.find((entry) => entry.column === 'code')?.value ?? String(made.body.data['code']);
        expect(croissantVoucher).not.toBe('');
      }, 60_000);

      let worked: unknown;
      it("the till's ticket: $53.60, one croissant by voucher, Goodwill 10 %, $48.52 — the dry run and the save agree", async () => {
        worked = await ticketOf(cashier);
        expect(figures(await cashier.one('tickets', worked))).toEqual([5360, 0, 5360, 442, 5802]);
        // The voucher, typed into the code field.
        const voucher = await cashier.post('ticket_codes', { ticket_id: worked, typed: croissantVoucher });
        expect(voucher.status, JSON.stringify(voucher.body).slice(0, 600)).toBe(201);
        expect(voucher.body.data['voucher_id']).not.toBeNull();
        expect(applied(voucher)).toEqual([['voucher', 'Voucher · One croissant', 380]]);
        expect(figures(await cashier.one('tickets', worked))).toEqual([5360, 380, 4980, 411, 5391]);
        // The staff discount: tried first, then saved; ten percent of what is left after the voucher.
        const give = { discount_kind: 'percent', discount_value: 10, discount_reason_id: goodwill['id'] };
        const dry = await cashier.dryUpdate('tickets', worked, give);
        expect(dry.status, JSON.stringify(dry.body).slice(0, 600)).toBe(200);
        expect(figures((dry.body as { data: Row }).data)).toEqual([5360, 878, 4482, 370, 4852]);
        expect(applied(dry)).toEqual(expect.arrayContaining([['voucher', 'Voucher · One croissant', 380], ['staff', 'Staff · Goodwill', 498]]));
        // Nothing was written by the dry run.
        expect(figures(await cashier.one('tickets', worked))).toEqual([5360, 380, 4980, 411, 5391]);
        const saved = await cashier.patch('tickets', worked, give);
        expect(saved.status).toBe(200);
        expect(figures(saved.body.data)).toEqual([5360, 878, 4482, 370, 4852]);
        expect(String(saved.body.data['discount_by'] ?? '')).not.toBe('');
        expect(cents(saved.body.data['due'])).toBe(4852);
        // The reductions as Offers recorded them for this ticket, which is what the till's lines show.
        const rows = (await cashier.rows('offers_applied')).filter((row) => row['source_table'] === 'pos:tickets' && String(row['source_row']) === String(worked));
        expect(rows.reduce((sum, row) => sum + cents(row['amount']), 0)).toBe(878);
        // Paid: the uses are taken, the voucher is spent.
        await cashier.insert('payments', { id: randomUUID(), ticket_id: worked, method: 'cash', amount: 48.52, staff_id: person['id'] });
        const closed = await cashier.patch('tickets', worked, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        expect(closed.status, JSON.stringify(closed.body).slice(0, 600)).toBe(200);
        expect(figures(closed.body.data)).toEqual([5360, 878, 4482, 370, 4852]);
        // The receipt Invoices & Receipts draws: the lines, then what came off — one row each, taken off — and Adminium's total.
        const drawn = await s.staff.post<{ printUrl: string; document: { subject: { fields: Record<string, number>; collections: { items: { desc: string; qty?: number; rate: number }[] } } } }>('/api/v1/apps/pos/documents/render', { kind: 'receipt', ref: 'tickets', pk: { id: worked } });
        expect([200, 201], JSON.stringify(drawn.body).slice(0, 400)).toContain(drawn.status);
        const subject = drawn.body.document.subject;
        expect(subject.collections.items.map((line) => [line.desc, line.qty ?? null, line.rate])).toEqual([
          ['Breakfast Bowl', 3, 1200],
          ['Flat White', 2, 500],
          ['Croissant', 2, 380],
          ['Voucher · One croissant', null, -380],
          ['Staff · Goodwill', null, -498],
        ]);
        expect([subject.fields['subtotal'], subject.fields['tax'], subject.fields['total']]).toEqual([5360, 370, 4852]);
        const page = (await s.staff.get(drawn.body.printUrl)).bytes.toString('utf8');
        for (const words of ['Breakfast Bowl', 'One croissant', 'Goodwill', '48.52']) expect(page, words).toContain(words);
        const again = await cashier.post('ticket_codes', { ticket_id: await ticketOf(cashier), typed: croissantVoucher });
        expect([again.status, again.code, again.details['reason']]).toEqual([409, 'ADJUST_REFUSED', 'used-up']);
      }, 120_000);

      it("a cashier's 20 % with a 10 % ceiling is refused at the server; a manager's stays when a cashier adds a line", async () => {
        const id = await ticketOf(cashier);
        const twenty = { discount_kind: 'percent', discount_value: 20, discount_reason_id: goodwill['id'] };
        for (const refused of [await cashier.dryUpdate('tickets', id, twenty), await cashier.patch('tickets', id, twenty)]) {
          expect([refused.status, refused.code, refused.details['reason'], Number(refused.details['max'])]).toEqual([409, 'ADJUST_REFUSED', 'over-ceiling', 10]);
        }
        expect(figures(await cashier.one('tickets', id))).toEqual([5360, 0, 5360, 442, 5802]);
        // The manager gives it; then the cashier rings up one more coffee, and the 20 % follows the ticket.
        expect(figures(await manager.update('tickets', id, twenty))).toEqual([5360, 1072, 4288, 354, 4642]);
        await cashier.insert('ticket_items', { ticket_id: id, menu_item_id: menu['Flat White']!['id'], name: 'Flat White', qty: 1, unit_price: 5, seat: 1 });
        expect(figures(await cashier.one('tickets', id))).toEqual([5860, 1172, 4688, 387, 5075]);
      }, 120_000);

      it('comp is refused without its own leave, for a cashier and a manager alike', async () => {
        const id = await ticketOf(cashier);
        const comp = { discount_kind: 'comp', discount_value: null, discount_reason_id: goodwill['id'] };
        for (const as of [cashier, manager]) {
          const refused = await as.patch('tickets', id, comp);
          expect([refused.status, refused.code, refused.details['reason']]).toEqual([409, 'ADJUST_REFUSED', 'over-ceiling']);
        }
        // One hundred percent is not a way round it.
        const hundred = await manager.patch('tickets', id, { discount_kind: 'percent', discount_value: 100, discount_reason_id: goodwill['id'] });
        expect([hundred.status, hundred.details['reason']]).toEqual([409, 'over-ceiling']);
        expect(figures(await cashier.one('tickets', id))).toEqual([5360, 0, 5360, 442, 5802]);
      }, 120_000);

      it('who removes what: the giver or someone whose ceiling covers it removes a staff discount; anyone at the till removes a code', async () => {
        const id = await ticketOf(cashier);
        const clear = { discount_kind: null, discount_value: null, discount_reason_id: null };
        await manager.update('tickets', id, { discount_kind: 'percent', discount_value: 30, discount_reason_id: goodwill['id'] });
        const refused = await cashier.patch('tickets', id, clear);
        expect([refused.status, refused.code, refused.details['reason']]).toEqual([409, 'ADJUST_REFUSED', 'not-allowed']);
        expect(cents((await cashier.one('tickets', id))['discount'])).toBe(1608);
        expect(cents((await manager.update('tickets', id, clear))['discount'])).toBe(0);
        // A cashier's own ten percent: another cashier, whose ceiling covers it, may take it off.
        await cashier.update('tickets', id, { discount_kind: 'percent', discount_value: 10, discount_reason_id: goodwill['id'] });
        expect(cents((await other.update('tickets', id, clear))['discount'])).toBe(0);
        // A code one cashier typed, removed by another: the row stays, with its time.
        const code = await cashier.insert('ticket_codes', { ticket_id: id, typed: 'AUTUMN5' });
        expect(cents((await cashier.one('tickets', id))['discount'])).toBe(500);
        const removed = await other.patch('ticket_codes', code['id'], { removed_at: new Date().toISOString() });
        expect(removed.status).toBe(200);
        expect(applied(removed)).toEqual([]);
        expect(cents((await cashier.one('tickets', id))['discount'])).toBe(0);
        const kept = (await cashier.rows('ticket_codes')).find((row) => row['id'] === code['id'])!;
        expect([kept['typed'], kept['removed_at'] !== null, kept['added_by']]).toEqual(['AUTUMN5', true, 'Sam Okafor']);
        // Nothing else of a code's row is a cashier's to write.
        expect((await cashier.patch('ticket_codes', code['id'], { typed: 'LAUNCH20' })).status).toBeGreaterThanOrEqual(400);
      }, 120_000);

      it('WELCOME10 needs a named customer; with a member on the ticket it applies once; a member with no email is still asked for', async () => {
        const id = await ticketOf(cashier);
        const guest = await cashier.post('ticket_codes', { ticket_id: id, typed: 'WELCOME10' });
        expect([guest.status, guest.code, guest.details['reason']]).toEqual([409, 'ADJUST_REFUSED', 'needs-customer']);
        // A member with no email: nothing to count their uses by.
        const anon = await cashier.insert('customers', { name: 'Noor', mobile: '+12075550111' });
        const named = await cashier.update('tickets', id, { customer_id: anon['id'] });
        const still = await cashier.post('ticket_codes', { ticket_id: id, typed: 'WELCOME10' });
        expect([still.status, still.details['reason']]).toEqual([409, 'needs-customer']);
        expect(named['customer_id']).toBe(anon['id']);
        // A member with one: the staff save that names them proves who is buying.
        const ama = await cashier.insert('customers', { name: 'Ama Boateng', mobile: '+12075550112', email: `ama.${engine}@till-members.dev` });
        const proved = await cashier.update('tickets', id, { customer_id: ama['id'] });
        expect([true, 1]).toContain(proved['customer_proved']);
        const taken = await cashier.post('ticket_codes', { ticket_id: id, typed: 'welcome10' });
        expect(taken.status, JSON.stringify(taken.body).slice(0, 500)).toBe(201);
        expect(figures(await cashier.one('tickets', id))).toEqual([5360, 536, 4824, 398, 5222]);
        await cashier.insert('payments', { id: randomUUID(), ticket_id: id, method: 'cash', amount: 52.22 });
        await cashier.update('tickets', id, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        // Once: on her next ticket it is no longer hers to use.
        const next = await ticketOf(cashier, undefined, { customer_id: ama['id'] });
        const second = await cashier.post('ticket_codes', { ticket_id: next, typed: 'WELCOME10' });
        expect(second.status).toBe(409);
        // Whether a customer is proved is never the till's to say.
        const forged = await cashier.post('tickets', { guests: 1, status: 'open', customer_proved: true });
        expect(forged.status === 201 ? forged.body.data['customer_proved'] ?? null : null).toBeNull();
      }, 120_000);

      it('two codes typed: the better one applies, the other is told, neither is refused; an unknown code is refused in plain words', async () => {
        const id = await ticketOf(cashier);
        const five = await cashier.post('ticket_codes', { ticket_id: id, typed: 'AUTUMN5' });
        expect([five.status, applied(five)]).toEqual([201, [['code', '$5.00 off', 500]]]);
        // The owner's second code, worth more on this ticket: twenty percent.
        const offer = await s.insert('offers_offers', { name: 'Regulars 20', public_name: { 'en-US': '20 % for regulars' }, gives: 'percent', value: '20', trigger: 'code', applies_to: 'order', starts_on: '2026-01-01' });
        await s.insert('offers_codes', { offer_id: offer['id'], code: 'REGULAR20', active: true });
        await s.update('offers_offers', offer['id'], { status: 'active' });
        const twenty = await cashier.post('ticket_codes', { ticket_id: id, typed: 'REGULAR20' });
        expect(twenty.status, JSON.stringify(twenty.body).slice(0, 500)).toBe(201);
        expect(applied(twenty).map((one) => one[2])).toEqual([1072]);
        const told = (twenty.body as unknown as { told?: { note: string; name: string }[] }).told ?? [];
        expect(told.map((one) => one.note)).toEqual(['better-offer-applied']);
        expect(figures(await cashier.one('tickets', id))).toEqual([5360, 1072, 4288, 354, 4642]);
        const unknown = await cashier.post('ticket_codes', { ticket_id: id, typed: 'NOSUCHCODE' });
        expect([unknown.status, unknown.code, unknown.details['reason']]).toEqual([409, 'ADJUST_REFUSED', 'unknown']);
        expect((await cashier.rows('ticket_codes')).filter((row) => row['ticket_id'] === id)).toHaveLength(2);
      }, 120_000);

      it('a cashier reads the reasons and what was applied, and nothing else of Offers: no card’s code, no holder, no ledger', async () => {
        expect((await cashier.rows('offers_reasons')).map((r) => r['label'])).toContain('Goodwill');
        const cards = await cashier.rows('offers_gift_cards');
        expect(cards.length).toBeGreaterThan(0);
        // What a card is, what it holds and until when; never its code, its holder or its address.
        for (const card of cards) for (const hidden of ['code', 'link_token', 'owner_email', 'recipient_email', 'recipient_name', 'message']) expect(Object.keys(card), hidden).not.toContain(hidden);
        for (const table of ['offers_card_ledger', 'offers_redemptions', 'offers_ceilings']) expect((await cashierCaller.get(`${s.data(table)}?limit=1`)).status, table).toBe(403);
        // Nor does a cashier make a card or a ceiling of their own.
        expect((await cashier.post('offers_gift_cards', { kind: 'card' })).status).toBe(403);
        expect((await cashier.post('offers_ceilings', { role: 'pos-cashier', max_percent: 100 })).status).toBe(403);
        // The look-up, as the cashier: a card's state and balance by its code, never the code back.
        const found = ok(await cashierCaller.post<Row>('/api/v1/add-ons/offers/look-up', { value: 'GC-7K2MW3HNQ4XP' }));
        expect(ok(await managerCaller.post<Row>('/api/v1/add-ons/offers/look-up', { value: 'AUTUMN5' }))['found']).toBe(true);
        expect([found['found'], found['kind'], found['last4']]).toEqual([true, 'gift-card', 'Q4XP']);
        expect(JSON.stringify(found)).not.toContain('7K2MW3HNQ4XP');
      }, 120_000);
    });
  });
});
