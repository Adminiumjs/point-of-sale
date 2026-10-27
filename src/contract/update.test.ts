/**
 * THE UPDATE A SHOP ON 0.3.0 MAKES, ON EVERY ENGINE.
 *
 * The released Point of Sale — its published tarball where that is here, its
 * tag otherwise (said in the name) — installed with Invoices & Receipts ticked
 * on the Adminium it was released for (`CONTRACT_FROM_ADMINIUM`), with its own
 * sample and a morning's real work through that version's own doors. Then
 * that Adminium is stopped, the one this build needs is started on the same
 * data, and:
 *
 *   1. ENGINE FIRST: a guest's address put on the do-not-email list, and the
 *      receipt a cashier asks 0.3.0 to email them still goes (an app that
 *      says no class sends service mail);
 *   2. this build uploaded: the plan is no change at all — no table, no
 *      column, no value of a list; it says only who the shop's people are,
 *      which mail is which, and which tables the law keeps;
 *   3. every row that was there is the same, byte for byte, read straight
 *      from the database; so is every column's declaration, every index, key
 *      and check;
 *   4. each ticket charged what it charged, to the cent, after every one is
 *      read again;
 *   5. THE APP NEXT: the receipt still reaches the guest on the list, now that
 *      the manifest says it is service mail, and the update put nobody else
 *      on the list;
 *   6. writes on what was there: the ticket left open under 0.3.0 is paid at
 *      the figures it carried; a line of the paid one is refunded at the
 *      figure Adminium quotes, and its other lines stay closed; a close's own
 *      tax and total are ignored; a gift card that was there is floored;
 *   7. the sample stays as 0.3.0 added it, and comes out again leaving the
 *      shop's own rows.
 *
 * Twice per engine: plainly, and with Offers & gift cards and Inventory
 * connected as the shop updates — the old rows must be equal then too.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { addOnBundle, appBundle, boot, Caller, ENGINES, FROM_ADMINIUM, FROM_VERSION, mailbox, missing, ok, rawTables, releasedBundle, releasedMissing, until, type Engine, type RawTable, type Server } from './harness';
import { ADMIN, cents, doors, readIds, type Row } from './stand';

const why = missing() ?? releasedMissing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the update contract must run here, and cannot: ${why}`);
const PORT_BASE = Number(process.env['CONTRACT_UPDATE_PORT_BASE'] ?? 4975);
const PREFIX = 'pos_';
const TO = (manifest as { version: string }).version;
const TABLES = (manifest as unknown as { requiredSchema: { tables: { ref: string; columns: { ref: string }[] }[] } }).requiredSchema.tables;

/** What 0.3.1 adds to 0.3.0's tables: nothing. Its words are read by Adminium, not stored in the shop's database. */
const NEW_TABLES: string[] = [];
const NEW_COLUMNS: Record<string, string[]> = {};
const NEW_ENUM_VALUES: Record<string, Record<string, string[]>> = {};

const RUNS = [
  { id: 'plain', title: '', addOns: false },
  { id: 'addons', title: ', with Offers & gift cards and Inventory connected at the update', addOns: true },
];

describe.skipIf(why !== null)(`the update of a live ${FROM_VERSION} shop to ${TO}${why === null ? (releasedBundle().published ? '' : ` (${FROM_VERSION} read from its tag: the published tarball is not here)`) : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    RUNS.forEach((run, r) => {
      describe.skipIf(!available)(`on ${engine}${run.title}`, () => {
        const port = PORT_BASE + r * 4;
        const database = `pos_update_${run.id}_${engine}`;
        let server: Server;
        let staff: Caller;
        let cashier: Caller;
        let connectionId = '';
        let ids: Record<string, string> = {};
        let d: ReturnType<typeof doors>;
        let before: Record<string, RawTable> = {};
        let beforeHttp: Record<string, Row[]> = {};
        let sampleBefore = { loaded: false, total: 0 };
        const shop = mkdtempSync(join(tmpdir(), `pos-update-${run.id}-${engine}-`));
        const ran = { from: '', to: '' };
        /** What the shop did under 0.3.0: the rows the later steps come back to. */
        const made = { open: 0 as unknown, paid: 0 as unknown, staff: 0 as unknown };
        /** A guest who asked for no marketing mail, and still wants their receipt. Not a reserved domain: the sink catches it. */
        const stopped = `stop.${run.id}.${engine}@tillmail.net`;

        const signIn = async () => {
          staff = new Caller(server.base, { origin: server.base });
          await staff.signIn(ADMIN.email, ADMIN.password);
          connectionId = ok(await staff.get<{ connections: { id: string; name: string }[] }>('/api/v1/connections')).connections.find((c) => c.name === 'northwind')!.id;
          return ok(await staff.get<{ version: string }>('/api/v1/healthz')).version;
        };
        const learn = async () => {
          ids = await readIds(staff, connectionId);
          d = doors(staff, connectionId, ids);
        };
        const appRefs = () => TABLES.map((t) => t.ref).filter((ref) => ref in ids);
        const all = async () => Object.fromEntries(await Promise.all(appRefs().map(async (ref) => [ref, (await d.rows(ref)).sort((a, b) => String(a['id']).localeCompare(String(b['id']), 'en', { numeric: true }))] as const)));
        const raw = () => rawTables(engine as Engine, port, database, PREFIX);
        const sample = async () => ok(await staff.get<{ loaded: boolean; total: number }>('/api/v1/apps/pos/sample-data'));
        const upload = async (kind: 'add-ons' | 'apps', bundle: { buffer: Buffer; integrity: string }) => {
          const reply = await staff.post(`/api/v1/${kind}/upload?expectedSha512=${encodeURIComponent(bundle.integrity)}`, bundle.buffer);
          expect([200, 201], JSON.stringify(reply.body).slice(0, 800)).toContain(reply.status);
        };
        const figures = (ticket: Row) => [cents(ticket['subtotal']), cents(ticket['tax']), cents(ticket['tip']), cents(ticket['total']), cents(ticket['charged'])];
        /** The receipt the till's Email button queues (`emailReceipt` in state/store.ts), in the cashier's session; what became of it. */
        const emailReceipt = async (to: string) => {
          const id = randomUUID();
          ok(await cashier.post(d.data('messages'), { values: { id, kind: 'receipt', status: 'queued', to_address: to, language: 'en-US', ticket_id: made.paid } }), 201);
          const row = await until(async () => {
            const found = await d.one('messages', id);
            return found['status'] === 'queued' ? undefined : found;
          }, `the receipt to ${to} to leave the queue`, 150_000);
          const mail = row['status'] === 'sent' ? await until(async () => (await mailbox(server)).find((m) => m.to.includes(to)), `the mail to ${to}`, 60_000) : undefined;
          return { status: String(row['status']), error: row['error'] ?? null, subject: mail?.subject ?? null };
        };

        beforeAll(async () => {
          server = await boot(engine as Engine, port, database, { adminium: FROM_ADMINIUM, keep: shop });
          ran.from = await signIn();
          ok(await staff.patch(`/api/v1/connections/${connectionId}`, { currency: 'USD' }));
        }, 240_000);

        afterAll(async () => {
          await server?.stop();
        });

        // ── the shop as it was ────────────────────────────────────────────────

        it(`installs the released ${FROM_VERSION} on the Adminium it was released for, with Invoices & Receipts ticked`, async () => {
          const released = releasedBundle();
          expect(released.version).toBe(FROM_VERSION);
          const invoices = addOnBundle('invoices');
          await upload('add-ons', invoices);
          await upload('apps', released);
          const body = { key: released.key, version: released.version, connectionId };
          const plan = ok(await staff.post<{ plan: { installable: boolean; checksum: string } }>('/api/v1/apps/plan', body)).plan;
          expect(plan.installable).toBe(true);
          ok(await staff.post('/api/v1/apps/install', { ...body, planChecksum: plan.checksum, addOns: [{ key: 'invoices', version: invoices.version }] }));
          await learn();
          expect(appRefs().sort()).toEqual(TABLES.map((t) => t.ref).filter((ref) => !NEW_TABLES.includes(ref)).sort());
        }, 240_000);

        it(`adds ${FROM_VERSION}'s own sample`, async () => {
          ok(await staff.post('/api/v1/apps/pos/sample-data'));
          await until(async () => ((await sample()).loaded ? true : undefined), 'the sample to be added');
          const tickets = await d.rows('tickets');
          expect(tickets).toHaveLength(36);
          expect(tickets.filter((t) => t['status'] === 'paid')).toHaveLength(29);
          const card = (await d.rows('gift_cards'))[0]!;
          expect([card['code'], cents(card['balance'])]).toEqual(['GC-48219930', 3850]);
        }, 240_000);

        it(`does a morning's work as the ${FROM_VERSION} till does it: a sale with a discount and a tip, and a ticket left open`, async () => {
          const person = (await d.rows('staff'))[0]!;
          made.staff = person['id'];
          const menu = await d.rows('menu_items');
          const dish = (name: string) => menu.find((m) => m['name'] === name)!;
          const line = (ticket: unknown, name: string, qty: number) => d.insert('ticket_items', { ticket_id: ticket, menu_item_id: dish(name)['id'], name, qty, unit_price: dish(name)['price'], seat: 1 });
          const names = menu.slice(0, 3).map((m) => String(m['name']));
          // Paid: three lines, $2.00 off; Adminium works the tax and the total out, the card pays them, a tip on top.
          const sold = await d.insert('tickets', { guests: 2, status: 'open', staff_id: person['id'] });
          made.paid = sold['id'];
          expect(Number(sold['tax_rate_bp'])).toBe(825);
          await line(sold['id'], names[0]!, 2);
          await line(sold['id'], names[1]!, 1);
          await line(sold['id'], names[2]!, 3);
          const priced = await d.update('tickets', sold['id'], { discount_kind: 'amount', discount_value: 2, discount_reason: 'Regular' });
          const goods = cents(priced['subtotal']);
          const tax = Math.floor((2 * (goods - 200) * 825 + 10_000) / 20_000);
          expect([cents(priced['tax']), cents(priced['total']), cents(priced['due'])]).toEqual([tax, goods - 200 + tax, goods - 200 + tax]);
          await d.insert('payments', { id: randomUUID(), ticket_id: sold['id'], method: 'card', amount: Number(priced['total']), tip: 1.5, staff_id: person['id'] });
          const paid = await d.update('tickets', sold['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 1.5 });
          expect([paid['status'], cents(paid['total']), cents(paid['charged'])]).toEqual(['paid', goods - 200 + tax, goods - 200 + tax + 150]);
          // Open: two lines, nothing paid.
          const open = await d.insert('tickets', { guests: 1, status: 'open', staff_id: person['id'] });
          made.open = open['id'];
          await line(open['id'], names[0]!, 1);
          await line(open['id'], names[1]!, 2);
        }, 120_000);

        // ── Adminium upgraded ─────────────────────────────────────────────────

        it('upgrades Adminium in place to the one this build needs, on the same data, the app still at its release', async () => {
          const rawUnder = await raw();
          await server.stop();
          server = await boot(engine as Engine, port, database, { keep: shop });
          ran.to = await signIn();
          await learn();
          console.info(`[upgrade, ${engine}${run.title}] Adminium ${ran.from} → ${ran.to}`);
          expect(ran.to).not.toBe(ran.from);
          const apps = ok(await staff.get<{ apps: { key: string; version: string; connectionId: string }[] }>('/api/v1/apps'));
          expect(apps.apps.filter((a) => a.key === 'pos').map((a) => [a.version, a.connectionId])).toEqual([[FROM_VERSION, connectionId]]);
          // The upgrade itself writes nothing into the app's tables.
          expect(await raw()).toEqual(rawUnder);
        }, 300_000);

        it(`signs a cashier in with ${FROM_VERSION}'s till role alone`, async () => {
          const email = `cashier.${run.id}.${engine}@tillmail.net`;
          const password = `contract-cashier-${run.id}-${engine}-pass!`;
          const role = ok(await staff.get<{ roles: { id: string; name: string }[] }>('/api/v1/roles')).roles.find((x) => x.name === 'POS cashier')!;
          const invited = ok(await staff.post<{ invite: { token: string } }>('/api/v1/users', { email, name: 'Sam Okafor', roleIds: [role.id] }), 201);
          ok(await new Caller(server.base, { origin: server.base }).post('/api/v1/auth/password/reset', { token: invited.invite.token, newPassword: password }));
          cashier = new Caller(server.base, { origin: server.base });
          await cashier.signIn(email, password);
        }, 60_000);

        it(`still emails ${FROM_VERSION}'s receipt to a guest on the do-not-email list: an app that says no class sends service mail`, async () => {
          const added = ok(await staff.post<{ data: { added: number } }>('/api/v1/consent/stop-list', { addresses: [stopped] })).data;
          expect(added.added).toBe(1);
          expect(await emailReceipt(stopped)).toEqual({ status: 'sent', error: null, subject: expect.stringMatching(/^Your receipt from /) });
        }, 240_000);

        it("reads every table of the app, straight from the database and over HTTP, once nothing is moving", async () => {
          await until(
            async () => {
              const a = await raw();
              await new Promise((resolve) => setTimeout(resolve, 3_000));
              const b = await raw();
              return JSON.stringify(a) === JSON.stringify(b) ? (before = b) : undefined;
            },
            'the database to be still',
            120_000,
          );
          beforeHttp = await all();
          expect(Object.keys(beforeHttp).sort()).toEqual(TABLES.map((t) => t.ref).filter((ref) => !NEW_TABLES.includes(ref)).sort());
          sampleBefore = await sample();
          expect(sampleBefore.loaded).toBe(true);
        }, 180_000);

        let plan: {
          installable: boolean;
          checksum: string;
          problems: unknown[];
          tables: { ref: string; table: string; class: string; action: string; edits: { kind: string; column: string; values?: string[] }[]; blocked: unknown[]; renameExistingTo?: string }[];
        };

        it(`plans the update to ${TO}: no table, no column and no value of a list, nothing dropped, renamed or rewritten`, async () => {
          if (run.addOns) for (const key of ['inventory', 'offers']) await upload('add-ons', addOnBundle(key));
          const app = appBundle();
          await upload('apps', app);
          plan = ok(await staff.post<{ plan: typeof plan }>('/api/v1/apps/plan', { key: app.key, version: app.version, connectionId })).plan;
          console.info(
            `[update plan, ${engine}${run.title}] ` +
              JSON.stringify({ installable: plan.installable, problems: plan.problems, changed: plan.tables.filter((t) => t.action !== 'reuse' || t.edits.length > 0 || t.blocked.length > 0).map((t) => ({ ref: t.ref, action: t.action, edits: t.edits.map((e) => `${e.kind}:${e.column}`), blocked: t.blocked })) }),
          );
          expect([plan.installable, plan.problems]).toEqual([true, []]);
          const byRef = Object.fromEntries(plan.tables.map((t) => [t.ref, t]));
          expect(Object.keys(byRef).sort()).toEqual(TABLES.map((t) => t.ref).sort());
          for (const ref of Object.keys(beforeHttp)) {
            const planned = byRef[ref]!;
            expect([ref, planned.action, planned.class, planned.table, planned.renameExistingTo, planned.blocked]).toEqual([ref, 'reuse', 'own-leftover', `${PREFIX}${ref}`, undefined, []]);
            expect([ref, planned.edits.filter((e) => e.kind === 'add-column').map((e) => e.column).sort()]).toEqual([ref, NEW_COLUMNS[ref] ?? []]);
            expect([ref, Object.fromEntries(planned.edits.filter((e) => e.kind === 'enum-values').map((e) => [e.column, e.values]))]).toEqual([ref, NEW_ENUM_VALUES[ref] ?? {}]);
            expect([ref, planned.edits.filter((e) => !['add-column', 'enum-values'].includes(e.kind))]).toEqual([ref, []]);
          }
        }, 120_000);

        it(`updates in place to ${TO}, as planned`, async () => {
          const reply = await staff.post<{ from: string; to: string; app: { version: string; schema?: { created: string[] }; rules?: { skipped: unknown[] } } }>('/api/v1/apps/pos/update', {
            planChecksum: plan.checksum,
            publicAccess: true,
            ...(run.addOns ? { addOns: ['inventory', 'offers'].map((key) => ({ key, version: addOnBundle(key).version })) } : {}),
          });
          expect(reply.status, JSON.stringify(reply.body).slice(0, 1500)).toBe(200);
          const updated = reply.body;
          expect([updated.from, updated.to, updated.app.version]).toEqual([FROM_VERSION, TO, TO]);
          expect([...(updated.app.schema?.created ?? [])]).toEqual([]);
          expect(JSON.stringify(updated.app.rules?.skipped ?? [])).toBe('[]');
          await learn();
          const staffConfig = ok(await staff.get<{ addOns?: Record<string, unknown> }>('/apps/pos/staff/surface-config.json'));
          expect(Object.keys(staffConfig.addOns ?? {}).sort()).toEqual(run.addOns ? ['inventory', 'invoices', 'offers'] : ['invoices']);
        }, 300_000);

        it('keeps every row that was there, byte for byte, and every column, index, key and check as it was', async () => {
          const after = await raw();
          expect(Object.keys(after).filter((name) => name !== `${PREFIX}sample_data`).sort()).toEqual(Object.keys(before).filter((name) => name !== `${PREFIX}sample_data`).sort());
          for (const [name, was] of Object.entries(before)) {
            const now = after[name]!;
            expect([name, now.key]).toEqual([name, was.key]);
            expect([name, now.columns]).toEqual([name, was.columns]);
            expect([name, now.constraints]).toEqual([name, was.constraints]);
            expect(now.rows, `the rows of ${name}`).toEqual(was.rows);
          }
        }, 120_000);

        it('keeps what each ticket charged, to the cent, after every one is read again', async () => {
          const was = beforeHttp['tickets']!;
          expect(was.filter((t) => String(t['number']).startsWith('S-'))).toHaveLength(36);
          for (const old of was) {
            // Read one by one, as a till reprinting a receipt reads it.
            const now = await d.one('tickets', old['id']);
            expect([old['number'], ...figures(now)]).toEqual([old['number'], ...figures(old)]);
          }
          // And reading wrote nothing.
          const after = await raw();
          expect(after[`${PREFIX}tickets`]!.rows).toEqual(before[`${PREFIX}tickets`]!.rows);
        }, 180_000);

        // ── the app next ──────────────────────────────────────────────────────

        it(`still emails the receipt to the guest on the do-not-email list, now that ${TO} says a receipt is service mail`, async () => {
          expect(await emailReceipt(stopped)).toEqual({ status: 'sent', error: null, subject: expect.stringMatching(/^Your receipt from /) });
          // The update put nobody on the list: it holds the one address the shop added.
          const listed = ok(await staff.get<{ data: { entries: { address: string | null; reason: string }[]; total: number } }>('/api/v1/consent/stop-list')).data;
          expect([listed.total, listed.entries.map((entry) => entry.address)]).toEqual([1, [stopped]]);
        }, 240_000);

        // ── writes on what was there ──────────────────────────────────────────

        it(`pays the ticket left open under ${FROM_VERSION} at the figures it carried`, async () => {
          const old = await d.one('tickets', made.open);
          expect(Number(old['tax_rate_bp'])).toBe(825);
          const lines = (await d.rows('ticket_items')).filter((l) => l['ticket_id'] === made.open);
          expect(lines).toHaveLength(2);
          const goods = lines.reduce((sum, l) => sum + cents(l['unit_price']) * Number(l['qty']), 0);
          const tax = Math.floor((2 * goods * 825 + 10_000) / 20_000);
          expect([cents(old['subtotal']), cents(old['tax']), cents(old['total']), cents(old['due'])]).toEqual([goods, tax, goods + tax, goods + tax]);
          await d.insert('payments', { id: randomUUID(), ticket_id: made.open, method: 'cash', amount: (goods + tax) / 100 });
          const paid = await d.update('tickets', made.open, { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
          expect([paid['status'], cents(paid['total']), cents(paid['due'])]).toEqual(['paid', goods + tax, 0]);
        }, 120_000);

        it('refunds a line of the ticket paid before the update at the figure Adminium quotes, and leaves its other lines closed', async () => {
          const ticket = await d.one('tickets', made.paid);
          const lines = (await d.rows('ticket_items')).filter((l) => l['ticket_id'] === made.paid);
          const payment = (await d.rows('payments')).find((p) => p['ticket_id'] === made.paid)!;
          const body = { id: randomUUID(), ticket_id: made.paid, method: 'card', payment_id: payment['id'], staff_id: made.staff };
          const children = { refund_items: [{ id: randomUUID(), ticket_item_id: lines[2]!['id'], qty: 2 }] };
          const quote = ok(await d.dryCreate('refunds', body, children)) as { data: Row };
          const refund = await d.insert('refunds', body, children);
          expect([cents(refund['amount']), cents(refund['tax'])]).toEqual([cents(quote.data['amount']), cents(quote.data['tax'])]);
          expect(cents(refund['amount'])).toBeGreaterThan(0);
          expect(cents(refund['amount'])).toBeLessThanOrEqual(cents(ticket['total']));
          // A line of a paid ticket takes no change, and the ticket keeps its cents.
          for (const refused of [await d.patch('ticket_items', lines[0]!['id'], { qty: 9 }), await d.post('ticket_items', { ticket_id: made.paid, name: 'Late', qty: 1, unit_price: 1 })]) {
            expect([refused.status, refused.code]).toEqual([409, 'RECORD_LOCKED']);
          }
          expect(figures(await d.one('tickets', made.paid))).toEqual(figures(ticket));
        }, 120_000);

        it("ignores the tax and total a close sends: the server's stand", async () => {
          const ticket = await d.insert('tickets', { guests: 1, status: 'open', staff_id: made.staff });
          await d.insert('ticket_items', { ticket_id: ticket['id'], name: 'Flat White', qty: 2, unit_price: 5 });
          await d.insert('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', amount: 10.83 });
          const closed = await d.update('tickets', ticket['id'], { status: 'paid', closed_at: new Date().toISOString(), tax: 9.99, tip: 1, total: 99.99 });
          expect([closed['status'], cents(closed['tax']), cents(closed['total']), cents(closed['charged'])]).toEqual(['paid', 83, 1083, 1183]);
        }, 60_000);

        it('floors a card that was there: a spend over its balance is refused, the three old rows count', async () => {
          const card = (await d.rows('gift_cards')).find((c) => c['code'] === 'GC-48219930')!;
          expect(cents(card['balance'])).toBe(3850);
          const over = await d.post('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind: 'redeem', amount: -38.51 });
          expect([over.status, over.code, cents(over.details['balance'])]).toEqual([409, 'BALANCE_EXCEEDED', 3850]);
          await d.insert('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind: 'redeem', amount: -38.5 });
          const now = (await d.rows('gift_cards')).find((c) => c['id'] === card['id'])!;
          expect([cents(now['balance']), cents(now['remaining'])]).toEqual([0, 0]);
        }, 60_000);

        // ── the sample on update ──────────────────────────────────────────────

        it(`leaves the sample as ${FROM_VERSION} added it: the update adds no sample rows`, async () => {
          const now = await sample();
          expect([now.loaded, now.total]).toEqual([sampleBefore.loaded, sampleBefore.total]);
        }, 60_000);

        it('removes the sample afterwards, keeping what the shop itself wrote', async () => {
          const removed = await staff.post<{ removed: number; kept: number }>('/api/v1/apps/pos/sample-data/remove', { keepChanged: true });
          expect(removed.status, JSON.stringify(removed.body).slice(0, 800)).toBe(200);
          expect(removed.body.removed).toBeGreaterThan(0);
          expect((await sample()).loaded).toBe(false);
          const tickets = (await d.rows('tickets')).map((t) => t['id']);
          expect(tickets).toContain(made.paid);
          expect(tickets).toContain(made.open);
        }, 240_000);
      });
    });
  });
});
