/**
 * TAKING A CARD THROUGH ADMINIUM, ON A BUILT ADMINIUM, ON EVERY ENGINE.
 *
 * This repo's manifest installed, and the till's own doors (`payDesk.ts`,
 * `desk.ts`) built from a cashier's staff config as `main.tsx` builds them,
 * against the engine's demo card reader — no hardware, no service account: a
 * customer at the counter is the reader's counter (`reader.mjs`), tapping a
 * card that is approved, with a tip, or declined.
 *
 *   1. the till arrives switched off: its payable is there, off, and the
 *      staff config says so; the manager may give money back, a cashier not;
 *   2. a payment manager pairs the demo reader in Studio, and a cashier's
 *      till (a role that opens the till's own screens only) lists it;
 *   3. while the payment manager rehearses, a ticket's balance goes on the
 *      reader: the reader takes it with a tip, Adminium writes the payment
 *      once into the till's table — the amount asked, the tip beside it, the
 *      card's last four and approval code — and the ticket closes on it;
 *   4. declined, cancelled on the till, a cancel that lost the race to the
 *      card (recorded), and a reader busy with another ticket;
 *   5. a card refund of a reader's payment goes back through the reader for
 *      the manager, and is refused to a cashier before anything is written;
 *      a cash refund keeps its one step;
 *   6. a standalone terminal's slip is the cashier's to record; nobody but
 *      Adminium writes a payment's reference, or changes a payment it took;
 *   7. the ticket's pay link is made, read back and closed by a cashier;
 *   8. an update of a shop on 0.3.2 keeps every row, adds the new columns
 *      empty, and arrives switched off.
 *
 * Postgres and MySQL with `TEST_POSTGRES_URL` / `TEST_MYSQL_URL`; five ports
 * from `CONTRACT_PAY_PORT` (default `CONTRACT_PORT` + 32): the server's four
 * and the reader's counter.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sessionDesk, type Desk } from '../data/desk';
import { sessionPayDesk, type PayDesk } from '../data/payDesk';
import type { ChargeView, TillReader } from '../data/payments';
import { createSessionTransport } from '../data/sessionSource';
import { SinkError, type RowId } from '../data/sink';
import { realTables } from '../data/tableOfRef';
import { WRITE_TABLES } from '../state/writes';
import { appBundle, boot, Caller, ENGINES, missing, ok, taggedBundle, until, type Engine } from './harness';
import { ADMIN, cents, doors, readIds, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PAY_PORT'] ?? Number(process.env['CONTRACT_PORT'] ?? 4931) + 32);
/** The release a shop updates from. */
const FROM = '0.3.2';

async function refusal(run: Promise<unknown>): Promise<SinkError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof SinkError) return error;
    throw error;
  }
  throw new Error('expected a refusal, and it went through');
}

/** The till's doors as one person's till builds them from the staff config. */
async function till(caller: Caller): Promise<{ desk: Desk; pay: PayDesk; config: Row & { payments?: Row } }> {
  const config = ok(await caller.get<Row & { tables?: Record<string, string>; connectionId?: string; installId?: string; csrfToken?: string; timezone?: string; currency?: string | null; payments?: Row }>('/apps/pos/staff/surface-config.json'));
  const tables = { ...WRITE_TABLES, ...(config.tables ?? {}) };
  const transport = createSessionTransport({
    tableOfRef: realTables(config.tables ?? {}),
    connectionId: config.connectionId,
    installId: config.installId,
    staff: { csrfToken: config.csrfToken!, timezone: config.timezone, currency: config.currency },
    fetchImpl: caller.fetchAs(),
  } as never);
  return { desk: sessionDesk(transport, tables), pay: sessionPayDesk(transport, tables['tickets'] ?? 'pos_tickets'), config };
}

/** The customer at the counter: a card on the demo reader. */
async function tap(counter: string, card: 'succeeds' | 'declined', tip = '0'): Promise<void> {
  const res = await fetch(`${counter}/tap`, { method: 'POST', body: JSON.stringify({ card, tip }) });
  if (!res.ok) throw new Error(`the reader's counter: ${String(res.status)} ${await res.text()}`);
}

describe.skipIf(why !== null)(`taking a card through Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashier: Caller;
      let manager: Caller;
      let cash: Awaited<ReturnType<typeof till>>;
      let mgr: Awaited<ReturnType<typeof till>>;
      let reader: TillReader;
      /** A ticket of two flat whites and a croissant: 12.80 + 8.25 % = 13.86 owing. */
      const ticket = async (): Promise<Row> => {
        const made = await s.insert('tickets', { guests: 1, status: 'open' });
        await s.insert('ticket_items', { ticket_id: made['id'], name: 'Flat White', qty: 2, unit_price: 4.5, seat: 1 });
        await s.insert('ticket_items', { ticket_id: made['id'], name: 'Croissant', qty: 1, unit_price: 3.8, seat: 1 });
        return s.one('tickets', made['id']);
      };
      /** Follow a charge, as the till does, until it ends. */
      const ended = (pay: PayDesk, attemptId: string) =>
        until(async () => {
          const view = await pay.charged(attemptId);
          return view.state === 'on_reader' || view.state === 'sending' ? undefined : view;
        }, 'the charge to end', 60_000);
      const recorded = (attemptId: string) => until(async () => (await s.rows('payments', `where=${encodeURIComponent(JSON.stringify({ column: 'payment_ref', op: 'eq', value: attemptId }))}`))[0], 'the payment in the till’s table', 60_000);

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_pay_${engine}`, { reader: true });
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        cashier = await s.member('cashier', 'Sam Okafor');
        manager = await s.member('manager', 'Priya Nair');
        cash = await till(cashier);
        mgr = await till(manager);
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it('arrives switched off: the payable is there, off, and the staff config says so', async () => {
        const apps = ok(await s.staff.get<{ data: { apps: { appKey: string; enabled: boolean; tables: { valid: boolean }[] }[] } }>('/api/v1/payments/apps')).data.apps;
        expect(apps.filter((a) => a.appKey === 'pos').map((a) => [a.enabled, a.tables.map((t) => t.valid)])).toEqual([[false, [true]]]);
        expect(cash.config.payments).toEqual({ on: false, online: false, test: false, refund: false });
        // The manager's role carries "may refund online payments" for the till's own payments.
        expect(mgr.config.payments).toEqual({ on: false, online: false, test: false, refund: true });
      }, 60_000);

      it('a payment manager pairs the demo reader, and a cashier’s till lists it', async () => {
        const started = ok(await s.staff.post<{ data: { pairing: string; way: string } }>('/api/v1/payments/readers/pairing', { provider: 'demo-reader', mode: 'test', label: 'Front counter', locationId: 'loc_demo' })).data;
        expect(started.way).toBe('enter');
        const code = ((await (await fetch(`${s.server.reader}/code?pairing=${encodeURIComponent(started.pairing)}`)).json()) as { code: string }).code;
        const finished = ok(await s.staff.post<{ data: { state: string; reader: { id: string } } }>('/api/v1/payments/readers/pairing/finish', { provider: 'demo-reader', mode: 'test', label: 'Front counter', locationId: 'loc_demo', pairing: started.pairing, code })).data;
        expect(finished.state).toBe('paired');
        // The pairing is the payment managers' alone; the list is any till's.
        expect((await cashier.post('/api/v1/payments/readers/pairing', { provider: 'demo-reader', mode: 'test', label: 'Back bar' })).status).toBe(403);
        // A cashier's role opens the till's own screens only: its till still lists the readers.
        const listed = await cash.pay.readers();
        expect(listed.map((r) => [r.label, r.mode, r.online])).toEqual([['Front counter', 'test', true]]);
        reader = listed[0]!;
      }, 60_000);

      let paidTicket: Row;
      let readerPayment: Row;
      it('while rehearsing, the reader takes a ticket’s balance with a tip; the payment lands once; the ticket closes on it', async () => {
        ok(await s.staff.put('/api/v1/payments/rehearsal', { on: true }));
        // Made by the rehearsing payment manager: a sample row, where a test payment may land.
        const t = await ticket();
        expect(cents(t['due'])).toBe(1386);
        const view = await cash.pay.charge(t['id'] as RowId, reader.id, null);
        expect([view.state, view.amount]).toEqual(['on_reader', 13.86]);
        await tap(s.server.reader, 'succeeds', '2.08');
        const done: ChargeView = await ended(cash.pay, view.attemptId);
        expect([done.state, done.tip, done.brand, done.last4]).toEqual(['paid', 2.08, 'Visa', '4242']);
        const row = await recorded(view.attemptId);
        expect([row['method'], cents(row['amount']), cents(row['tip']), row['payment_last4'], row['approval_code'], row['paid_with']]).toEqual(['online', 1386, 208, '4242', 'DEMO01', 'Visa ••4242']);
        expect(row['provider']).toEqual(expect.any(String));
        // As the till reads it back after the charge: through its own door, by the reference.
        expect((await cash.desk.rows('payments', { column: 'payment_ref', op: 'eq', value: view.attemptId })).map((r) => r['id'])).toEqual([row['id']]);
        const owing = await s.one('tickets', t['id']);
        expect(cents(owing['due'])).toBe(0);
        // The till closes the ticket as it does after any payment: the reader's tip on it.
        const closed = await s.as(cashier).update('tickets', t['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 2.08 });
        expect([closed['status'], cents(closed['charged'])]).toEqual(['paid', 1594]);
        // Once: asked again, the reader's charge is the same one.
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        expect((await s.rows('payments')).filter((p) => p['ticket_id'] === t['id'])).toHaveLength(1);
        paidTicket = closed;
        readerPayment = row;
      }, 180_000);

      it('says a declined card, a cancel on the till, a cancel that lost the race (recorded), and a busy reader', async () => {
        const t = await ticket();
        const first = await cash.pay.charge(t['id'] as RowId, reader.id, null);
        await tap(s.server.reader, 'declined');
        expect((await ended(cash.pay, first.attemptId)).state).toBe('declined');

        const second = await cash.pay.charge(t['id'] as RowId, reader.id, null);
        expect(second.attemptId).not.toBe(first.attemptId);
        expect((await cash.pay.cancel(second.attemptId)).state).toBe('cancelled');
        expect((await s.rows('payments')).filter((p) => p['ticket_id'] === t['id'])).toHaveLength(0);

        // Another ticket's charge holds the reader: this one is refused, by name.
        const other = await ticket();
        const holding = await cash.pay.charge(other['id'] as RowId, reader.id, null);
        const busy = await refusal(cash.pay.charge(t['id'] as RowId, reader.id, null));
        expect([busy.status, busy.details['reason']]).toEqual([409, 'reader-busy']);
        expect((await cash.pay.cancel(holding.attemptId)).state).toBe('cancelled');

        // Part of the balance, then the card is tapped a moment before the cancel: that is a payment.
        const third = await cash.pay.charge(t['id'] as RowId, reader.id, '5.00');
        expect(third.amount).toBe(5);
        await tap(s.server.reader, 'succeeds');
        expect((await cash.pay.cancel(third.attemptId)).state).toBe('paid');
        const row = await recorded(third.attemptId);
        expect(cents(row['amount'])).toBe(500);
        expect(cents((await s.one('tickets', t['id']))['due'])).toBe(886);
        // More than is owing is never asked.
        const over = await refusal(cash.pay.charge(t['id'] as RowId, reader.id, '9.00'));
        expect([over.status, over.details['reason']]).toEqual([422, 'amount']);
      }, 180_000);

      it('a card refund of a reader’s payment goes back through the reader for the manager; a cashier is refused before anything is written', async () => {
        const items = await s.rows('ticket_items', `where=${encodeURIComponent(JSON.stringify({ column: 'ticket_id', op: 'eq', value: paidTicket['id'] }))}`);
        const croissant = items.find((i) => i['name'] === 'Croissant')!;
        const back = (who: Caller) =>
          doors(who, s.connectionId, s.ids).post('refunds', { id: randomUUID(), ticket_id: paidTicket['id'], method: 'online', payment_id: readerPayment['id'], reason: 'wrong-item' }, { refund_items: [{ id: randomUUID(), ticket_item_id: croissant['id'], qty: 1 }] });
        // What the refund screen asks first: the quote, a dry run of the very row.
        const quoted = await doors(manager, s.connectionId, s.ids).dryCreate('refunds', { id: randomUUID(), ticket_id: paidTicket['id'], method: 'online', payment_id: readerPayment['id'], reason: 'wrong-item' }, { refund_items: [{ id: randomUUID(), ticket_item_id: croissant['id'], qty: 1 }] });
        expect(quoted.status, JSON.stringify(quoted.body).slice(0, 800)).toBe(200);
        expect(cents((quoted.body as { data: Row }).data['amount'])).toBe(411);
        const before = (await s.rows('refunds')).length;
        const no = await back(cashier);
        expect([no.status, no.code]).toEqual([403, 'PAYMENT_REFUND_NOT_ALLOWED']);
        expect((await s.rows('refunds')).length).toBe(before);
        const made = await back(manager);
        expect(made.status, JSON.stringify(made.body).slice(0, 600)).toBe(201);
        const refundId = (made.body as { data: Row }).data['id'];
        // 3.80 + 8.25 % tax = 4.11, sent back through the reader and stamped on the row.
        const stamped = await until(async () => (await s.rows('refunds')).find((r) => r['id'] === refundId && r['refund_state'] !== null && r['refund_state'] !== 'asked'), 'the refund to be stamped', 120_000);
        expect([stamped['refund_state'], cents(stamped['amount']), stamped['refund_ref']]).toEqual(['done', 411, expect.any(String)]);
        expect(cents((await s.one('payments', readerPayment['id']))['refunded'])).toBe(411);
      }, 240_000);

      it('a standalone terminal’s slip is the cashier’s to record; a payment’s reference is Adminium’s alone', async () => {
        const t = await ticket();
        const mine = s.as(cashier);
        const slip = await mine.insert('payments', { id: randomUUID(), ticket_id: t['id'], method: 'card', amount: 13.86, tip: 0, approval_code: 'A1B2C3', payment_last4: '1881' });
        expect([slip['approval_code'], slip['payment_last4'], slip['payment_ref'] ?? null]).toEqual(['A1B2C3', '1881', null]);
        expect(cents((await s.one('tickets', t['id']))['due'])).toBe(0);
        // The cashier's role never lists the reference; past the role, Adminium refuses it to anyone but a payment.
        const forged = await mine.post('payments', { id: randomUUID(), ticket_id: (await ticket())['id'], method: 'online', amount: 1, payment_ref: 'pat_forged' });
        expect([forged.status, forged.code]).toEqual([403, 'COLUMN_FORBIDDEN']);
        const owner = await s.post('payments', { id: randomUUID(), ticket_id: (await ticket())['id'], method: 'online', amount: 1, payment_ref: 'pat_forged' });
        expect([owner.status, owner.code, owner.details['reason']]).toEqual([403, 'TABLE_FORBIDDEN', 'payment-column']);
        // The reader's payment cannot be edited, by the manager either.
        const edited = await s.patch('payments', readerPayment['id'], { amount: 1 });
        expect([edited.status, edited.code, edited.details['reason']]).toEqual([403, 'TABLE_FORBIDDEN', 'online-payment']);
        // Cash given back keeps its one step: no reason asked, nothing sent anywhere.
        const cashPaid = await ticket();
        const cashPayment = await mine.insert('payments', { id: randomUUID(), ticket_id: cashPaid['id'], method: 'cash', amount: 13.86, tip: 0, tendered: 20, change: 6.14 });
        await mine.update('tickets', cashPaid['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
        const line = (await s.rows('ticket_items', `where=${encodeURIComponent(JSON.stringify({ column: 'ticket_id', op: 'eq', value: cashPaid['id'] }))}`))[0]!;
        const given = await mine.post('refunds', { id: randomUUID(), ticket_id: cashPaid['id'], method: 'cash', payment_id: cashPayment['id'] }, { refund_items: [{ id: randomUUID(), ticket_item_id: line['id'], qty: 1 }] });
        expect(given.status).toBe(201);
        expect((given.body as { data: Row }).data['refund_state'] ?? null).toBeNull();
      }, 120_000);

      it('the ticket’s pay link is made, read back as the current one, and closed by a cashier', async () => {
        const t = await ticket();
        const link = await cash.pay.payLink(t['id'] as RowId);
        expect(link.url).toMatch(/^https?:\/\/[^/]+\/pay\//);
        // Asked again, the link already open; closed, the ticket's next link is a new one.
        expect((await cash.pay.payLink(t['id'] as RowId)).id).toBe(link.id);
        await cash.pay.closeLink(link.id);
        const again = await cash.pay.payLink(t['id'] as RowId);
        expect(again.id).not.toBe(link.id);
      }, 60_000);
    });

    describe.skipIf(!available || taggedBundle(FROM) === null)(`the update of a shop on ${FROM}, on ${engine}`, () => {
      it(`keeps every row, adds the new columns empty, and arrives switched off`, async () => {
        const server = await boot(engine as Engine, PORT, `pos_pay_update_${engine}`);
        try {
          const staff = new Caller(server.base, { origin: server.base });
          await staff.signIn(ADMIN.email, ADMIN.password);
          const connectionId = ok(await staff.get<{ connections: { id: string; name: string }[] }>('/api/v1/connections')).connections.find((c) => c.name === 'northwind')!.id;
          ok(await staff.patch(`/api/v1/connections/${connectionId}`, { currency: 'USD' }));
          const put = async (bundle: { buffer: Buffer; integrity: string }) => {
            const reply = await staff.post(`/api/v1/apps/upload?expectedSha512=${encodeURIComponent(bundle.integrity)}`, bundle.buffer);
            expect([200, 201], JSON.stringify(reply.body).slice(0, 600)).toContain(reply.status);
          };
          const released = taggedBundle(FROM)!;
          await put(released);
          const body = { key: released.key, version: released.version, connectionId };
          ok(await staff.post('/api/v1/apps/install', { ...body, planChecksum: ok(await staff.post<{ plan: { checksum: string } }>('/api/v1/apps/plan', body)).plan.checksum }));
          ok(await staff.post('/api/v1/apps/pos/sample-data'));
          await until(async () => (ok(await staff.get<{ loaded: boolean }>('/api/v1/apps/pos/sample-data')).loaded ? true : undefined), 'the sample to be added');
          const ids = await readIds(staff, connectionId);
          const d = doors(staff, connectionId, ids);
          // A morning's work under 0.3.2: a card sale, a cash sale and a refund of it.
          await d.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
          const sale = await d.insert('tickets', { guests: 1, status: 'open' });
          await d.insert('ticket_items', { ticket_id: sale['id'], name: 'Flat White', qty: 2, unit_price: 4.5, seat: 1 });
          await d.insert('payments', { id: randomUUID(), ticket_id: sale['id'], method: 'card', amount: 9.74, tip: 1 });
          await d.update('tickets', sale['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 1 });
          const before = { payments: await d.rows('payments'), refunds: await d.rows('refunds'), tickets: await d.rows('tickets') };
          expect(before.payments.length).toBeGreaterThan(1);

          const app = appBundle();
          await put(app);
          const plan = ok(
            await staff.post<{ plan: { checksum: string; installable: boolean; tables: { ref: string; edits: { kind: string; column: string; values?: string[] }[] }[] } }>('/api/v1/apps/plan', { key: app.key, version: app.version, connectionId }),
          ).plan;
          expect(plan.installable).toBe(true);
          const edits = Object.fromEntries(plan.tables.filter((t) => t.edits.length > 0).map((t) => [t.ref, t.edits.filter((e) => e.kind === 'add-column').map((e) => e.column).sort()]));
          expect(edits).toEqual({
            payments: ['approval_code', 'paid_with', 'payment_last4', 'payment_ref', 'provider', 'refunded_elsewhere'],
            refunds: ['refund_ref', 'refund_state'],
          });
          // The manager gains the refund right: the operator allows it, as the install review asks.
          const refused = await staff.post('/api/v1/apps/pos/update', { planChecksum: plan.checksum, publicAccess: true });
          expect([refused.status, refused.details['reason']]).toEqual([422, 'ROLE_GRANTS_ADDED']);
          const updated = await staff.post<{ to: string }>('/api/v1/apps/pos/update', { planChecksum: plan.checksum, publicAccess: true, roleGrants: true });
          expect(updated.status, JSON.stringify(updated.body).slice(0, 1500)).toBe(200);
          expect(updated.body.to).toBe(app.version);

          const fresh = ['approval_code', 'paid_with', 'payment_last4', 'payment_ref', 'provider', 'refunded_elsewhere', 'refund_ref', 'refund_state'];
          const old = (row: Row) => Object.fromEntries(Object.entries(row).filter(([column]) => !fresh.includes(column)));
          for (const ref of ['payments', 'refunds', 'tickets'] as const) {
            const now = await d.rows(ref);
            const byId = (rows: Row[]) => [...rows].sort((a, b) => String(a['id']).localeCompare(String(b['id'])));
            expect(byId(now).map(old), `the rows of ${ref}`).toEqual(byId(before[ref]).map(old));
            for (const row of now) for (const column of fresh) if (column in row) expect([ref, column, row[column]]).toEqual([ref, column, null]);
          }
          const apps = ok(await staff.get<{ data: { apps: { appKey: string; enabled: boolean }[] } }>('/api/v1/payments/apps')).data.apps;
          expect(apps.filter((a) => a.appKey === 'pos').map((a) => a.enabled)).toEqual([false]);
        } finally {
          await server.stop();
        }
      }, 600_000);
    });
  });
});
