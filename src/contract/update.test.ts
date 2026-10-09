/**
 * THE UPDATE A SHOP ON 0.2.3 MAKES, ON EVERY ENGINE.
 *
 * The released Point of Sale — its published tarball where that is here, its
 * tag otherwise (said in the name) — installed on the Adminium it was released
 * for (`CONTRACT_FROM_ADMINIUM`), with its own sample and a morning's real
 * work through that version's own doors. Then that Adminium is stopped, the
 * one this build needs is started on the same data, and this build is
 * uploaded over it:
 *
 *   1. the plan is exactly the new table, the new columns and one more value
 *      of a list — nothing dropped, renamed or rewritten;
 *   2. every row that was there is the same, byte for byte, read straight
 *      from the database; so is every column's declaration;
 *   3. each ticket charged what it charged, to the cent, after every one is
 *      read again;
 *   4. a line of a ticket paid before the update is refunded at the figure
 *      0.2.3 gives, with no money in the request;
 *   5. a line written on a ticket paid before the update is refused, and its
 *      total stays;
 *   6. a ticket opened before the update has no tax rate and cannot be paid:
 *      its lines are carried onto a new ticket, which charges them right;
 *   7. a till still running 0.2.3 code closes a ticket: the tax and total it
 *      sends are ignored, the server's stand;
 *   8. a gift card that was there is floored: a spend over what it holds is
 *      refused, and its three old rows count;
 *   9. the sample stays as 0.2.3 added it, and comes out again leaving the
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
import { addOnBundle, appBundle, boot, Caller, ENGINES, FROM_ADMINIUM, FROM_VERSION, missing, ok, rawTables, releasedBundle, releasedMissing, until, type Engine, type RawTable, type Server } from './harness';
import { ADMIN, cents, doors, readIds, type Row } from './stand';

const why = missing() ?? releasedMissing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the update contract must run here, and cannot: ${why}`);
const PORT_BASE = Number(process.env['CONTRACT_UPDATE_PORT_BASE'] ?? 4975);
const PREFIX = 'pos_';
const TO = (manifest as { version: string }).version;
const TABLES = (manifest as unknown as { requiredSchema: { tables: { ref: string; columns: { ref: string }[] }[] } }).requiredSchema.tables;

const NEW_TABLES = ['ticket_codes'];
const NEW_COLUMNS: Record<string, string[]> = {
  tickets: ['customer_proved', 'discount', 'discount_by', 'discount_reason_id', 'due', 'goods', 'net', 'own_discount', 'paid', 'tax_rate_bp'],
  ticket_items: ['card_id', 'category_id', 'discount', 'goods_amount', 'load_ref'],
  payments: ['card_amount', 'card_balance_after', 'card_code', 'card_id', 'card_last4', 'held_until', 'refundable', 'refunded', 'took'],
  refunds: ['cash_part', 'gross', 'own_sub', 'own_tax', 'payment_id', 'repriced', 'repriced_tax', 't_discount', 't_goods', 't_net', 't_own', 't_subtotal', 't_tax', 't_total'],
  refund_items: ['back_to', 'line_unit', 'menu_item_id', 'not_back_at'],
  gift_card_ledger: ['card_code', 'moved_at', 'sign'],
  gift_cards: ['opening', 'remaining', 'taken'],
  settings: ['cards_moved'],
};
const NEW_ENUM_VALUES: Record<string, Record<string, string[]>> = { gift_cards: { status: ['moved'] } };
/** The four added columns that carry a database default: a row that was there gets it, and nothing else. */
const DEFAULTED: Record<string, Record<string, (value: string | null) => boolean>> = {
  gift_card_ledger: { sign: (v) => Number(v) === -1 },
  gift_cards: { opening: (v) => Number(v) === 0 },
  settings: { cards_moved: (v) => v === '0' || v === 'false' || v === 'f' },
  refund_items: { back_to: (v) => v === 'shelf' || v === "'shelf'" },
};

const RUNS = [
  { id: 'plain', title: '', addOns: false },
  { id: 'addons', title: ', with Offers & gift cards and Inventory connected at the update', addOns: true },
];

/** What 0.2.3 gives back for these lines (its `refundMoney`): the goods less their share of any discount, plus the tax on that. */
function refund023(ticket: Row, goods: number, rate: number): { amount: number; tax: number } {
  const subtotal = Number(ticket['subtotal']);
  const discount = Math.max(0, subtotal - (Number(ticket['total']) - Number(ticket['tax'])));
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const share = subtotal > 0 ? Math.max(0, 1 - discount / subtotal) : 1;
  const sub = round2(goods * share);
  const tax = round2(sub * rate);
  return { amount: round2(sub + tax), tax };
}

describe.skipIf(why !== null)(`the update of a live ${FROM_VERSION} shop to ${TO}${why === null ? (releasedBundle().published ? '' : ` (${FROM_VERSION} read from its tag: the published tarball is not here)`) : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    RUNS.forEach((run, r) => {
      describe.skipIf(!available)(`on ${engine}${run.title}`, () => {
        const port = PORT_BASE + r * 4;
        const database = `pos_update_${run.id}_${engine}`;
        let server: Server;
        let staff: Caller;
        let connectionId = '';
        let ids: Record<string, string> = {};
        let d: ReturnType<typeof doors>;
        let before: Record<string, RawTable> = {};
        let beforeHttp: Record<string, Row[]> = {};
        let sampleBefore = { loaded: false, total: 0 };
        const shop = mkdtempSync(join(tmpdir(), `pos-update-${run.id}-${engine}-`));
        const ran = { from: '', to: '' };
        /** What the shop did under 0.2.3: the rows the later steps come back to. */
        const made = { open: 0 as unknown, paid: 0 as unknown, staff: 0 as unknown };

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

        beforeAll(async () => {
          server = await boot(engine as Engine, port, database, { adminium: FROM_ADMINIUM, keep: shop });
          ran.from = await signIn();
          ok(await staff.patch(`/api/v1/connections/${connectionId}`, { currency: 'USD' }));
        }, 240_000);

        afterAll(async () => {
          await server?.stop();
        });

        // ── the shop as it was ────────────────────────────────────────────────

        it(`installs the released ${FROM_VERSION} on the Adminium it was released for`, async () => {
          const released = releasedBundle();
          expect(released.version).toBe(FROM_VERSION);
          await upload('apps', released);
          const body = { key: released.key, version: released.version, connectionId };
          const plan = ok(await staff.post<{ plan: { installable: boolean; checksum: string } }>('/api/v1/apps/plan', body)).plan;
          expect(plan.installable).toBe(true);
          ok(await staff.post('/api/v1/apps/install', { ...body, planChecksum: plan.checksum }));
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
          // Paid: three lines, $2.00 off, the till's own tax and total, a tip.
          const sold = await d.insert('tickets', { guests: 2, status: 'open', staff_id: person['id'] });
          made.paid = sold['id'];
          await line(sold['id'], names[0]!, 2);
          await line(sold['id'], names[1]!, 1);
          await line(sold['id'], names[2]!, 3);
          const subtotal = Number((await d.one('tickets', sold['id']))['subtotal']);
          const net = subtotal - 2;
          const tax = Math.round((net * 0.0825 + Number.EPSILON) * 100) / 100;
          const total = Math.round((net + tax) * 100) / 100;
          await d.insert('payments', { id: randomUUID(), ticket_id: sold['id'], method: 'card', amount: total, tip: 1.5, staff_id: person['id'] });
          const paid = await d.update('tickets', sold['id'], { status: 'paid', closed_at: new Date().toISOString(), discount_kind: 'amount', discount_value: 2, discount_reason: 'Regular', tax, tip: 1.5, total });
          expect([cents(paid['tax']), cents(paid['total']), cents(paid['charged'])]).toEqual([Math.round(tax * 100), Math.round(total * 100), Math.round(total * 100) + 150]);
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
          before = rawUnder;
          beforeHttp = await all();
          sampleBefore = await sample();
          expect(sampleBefore.loaded).toBe(true);
        }, 300_000);

        let plan: {
          installable: boolean;
          checksum: string;
          problems: unknown[];
          tables: { ref: string; table: string; class: string; action: string; edits: { kind: string; column: string; values?: string[] }[]; blocked: unknown[]; renameExistingTo?: string }[];
        };

        it(`plans the update to ${TO}: exactly the new table, the new columns and one more value of a list`, async () => {
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
          for (const ref of NEW_TABLES) expect([ref, byRef[ref]!.action, byRef[ref]!.table, byRef[ref]!.class]).toEqual([ref, 'create', `${PREFIX}${ref}`, 'new']);
          for (const ref of Object.keys(beforeHttp)) {
            const planned = byRef[ref]!;
            expect([ref, planned.action, planned.class, planned.table, planned.renameExistingTo, planned.blocked]).toEqual([ref, 'reuse', 'own-leftover', `${PREFIX}${ref}`, undefined, []]);
            // Only additions: a column, a value of a list. Never a column changed in type or width.
            expect([ref, planned.edits.filter((e) => e.kind === 'add-column').map((e) => e.column).sort()]).toEqual([ref, NEW_COLUMNS[ref] ?? []]);
            expect([ref, Object.fromEntries(planned.edits.filter((e) => e.kind === 'enum-values').map((e) => [e.column, e.values]))]).toEqual([ref, NEW_ENUM_VALUES[ref] ?? {}]);
            expect([ref, planned.edits.filter((e) => !['add-column', 'enum-values'].includes(e.kind))]).toEqual([ref, []]);
          }
          // Forty-nine columns on eight tables (one update adds fifty at most).
          expect(Object.values(NEW_COLUMNS).flat()).toHaveLength(49);
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
          expect([...(updated.app.schema?.created ?? [])].sort()).toEqual(NEW_TABLES.map((t) => `${PREFIX}${t}`).sort());
          expect(JSON.stringify(updated.app.rules?.skipped ?? [])).toBe('[]');
          await learn();
          const staffConfig = ok(await staff.get<{ addOns?: Record<string, unknown> }>('/apps/pos/staff/surface-config.json'));
          expect(Object.keys(staffConfig.addOns ?? {}).sort()).toEqual(run.addOns ? ['inventory', 'offers'] : []);
        }, 300_000);

        it('keeps every row that was there, byte for byte, and every column as it was', async () => {
          const after = await raw();
          const added: Record<string, string[]> = {};
          const redeclared: string[] = [];
          for (const [name, was] of Object.entries(before)) {
            const ref = name.slice(PREFIX.length);
            const now = after[name];
            expect(now, `${name} is still there`).toBeDefined();
            expect([name, now!.key]).toEqual([name, was.key]);
            added[name] = Object.keys(now!.columns).filter((c) => !(c in was.columns)).sort();
            const widened = Object.keys(NEW_ENUM_VALUES[ref] ?? {});
            for (const [column, declared] of Object.entries(was.columns)) {
              expect(now!.columns[column], `${name}.${column} is still there`).toBeDefined();
              // A list that gained a value is declared with it (MySQL's enum, a check elsewhere): that is the addition.
              if (now!.columns[column] !== declared && !widened.includes(column)) redeclared.push(`${name}.${column}: ${declared} → ${now!.columns[column]!}`);
            }
            expect([name, now!.rows.length]).toEqual([name, was.rows.length]);
            const kept = now!.rows.map((found) => Object.fromEntries(Object.keys(was.columns).map((c) => [c, found[c]])));
            expect(kept, `the rows of ${name}`).toEqual(was.rows);
            // A column the update adds holds nothing on a row that was there — or, for the four with one, its default.
            for (const column of added[name]!) {
              const allowed = DEFAULTED[ref]?.[column];
              const odd = now!.rows.filter((found) => (allowed === undefined ? found[column] !== null : !allowed(found[column] ?? null)));
              expect([name, column, odd.length, odd[0]?.[column]]).toEqual([name, column, 0, undefined]);
            }
          }
          expect(redeclared).toEqual([]);
          expect(Object.fromEntries(Object.entries(added).filter(([name, list]) => list.length > 0 && name !== `${PREFIX}sample_data`))).toEqual(Object.fromEntries(Object.entries(NEW_COLUMNS).map(([ref, list]) => [`${PREFIX}${ref}`, list])));
          // The new table, with the manifest's columns, and nothing in it.
          for (const ref of NEW_TABLES) {
            const table = after[`${PREFIX}${ref}`];
            expect(table, `${PREFIX}${ref} exists`).toBeDefined();
            expect([ref, Object.keys(table!.columns).sort()]).toEqual([ref, TABLES.find((t) => t.ref === ref)!.columns.map((c) => c.ref).sort()]);
            expect([ref, table!.rows.length]).toEqual([ref, 0]);
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
          expect(after[`${PREFIX}tickets`]!.rows.map((row) => [row['id'], row['tax'], row['total'], row['charged']])).toEqual(before[`${PREFIX}tickets`]!.rows.map((row) => [row['id'], row['tax'], row['total'], row['charged']]));
        }, 180_000);

        // ── writes on what was there ──────────────────────────────────────────

        it('refunds a line of a ticket paid before the update at the figure 0.2.3 gives, with no money in the request — and the ticket keeps its cents', async () => {
          const ticket = await d.one('tickets', made.paid);
          const lines = (await d.rows('ticket_items')).filter((l) => l['ticket_id'] === made.paid);
          const payment = (await d.rows('payments')).find((p) => p['ticket_id'] === made.paid)!;
          const line = lines[2]!;
          const want = refund023(ticket, Number(line['unit_price']) * 2, 0.0825);
          const body = { id: randomUUID(), ticket_id: made.paid, method: 'card', payment_id: payment['id'], staff_id: made.staff };
          const children = { refund_items: [{ id: randomUUID(), ticket_item_id: line['id'], qty: 2 }] };
          const quote = ok(await d.dryCreate('refunds', body, children)) as { data: Row };
          expect([cents(quote.data['amount']), cents(quote.data['tax'])]).toEqual([Math.round(want.amount * 100), Math.round(want.tax * 100)]);
          const refund = await d.insert('refunds', body, children);
          expect([cents(refund['amount']), cents(refund['tax'])]).toEqual([Math.round(want.amount * 100), Math.round(want.tax * 100)]);
          // Money a browser names is not what is kept.
          const named = await d.insert('refunds', { id: randomUUID(), ticket_id: made.paid, method: 'card', payment_id: payment['id'], amount: 0.01, tax: 0 }, { refund_items: [{ id: randomUUID(), ticket_item_id: lines[1]!['id'], qty: 1 }] });
          const one = refund023(ticket, Number(lines[1]!['unit_price']), 0.0825);
          expect(cents(named['amount'])).toBe(Math.round(one.amount * 100));
          // A sample ticket too: the one the sample's own refund is on, its second line.
          const sampled = (await d.rows('tickets')).find((t) => t['number'] === 'S-0911')!;
          const sampledLine = (await d.rows('ticket_items')).filter((l) => l['ticket_id'] === sampled['id'])[1];
          if (sampledLine !== undefined) {
            const wanted = refund023(sampled, Number(sampledLine['unit_price']), 0.0825);
            const sampledPayment = (await d.rows('payments')).find((p) => p['ticket_id'] === sampled['id'])!;
            const given = await d.post('refunds', { id: randomUUID(), ticket_id: sampled['id'], method: 'card', payment_id: sampledPayment['id'] }, { refund_items: [{ id: randomUUID(), ticket_item_id: sampledLine['id'], qty: 1 }] });
            if (run.addOns) {
              // With Offers answering, a ticket that already holds a refund from before it could answer is not
              // refunded again from the till: Offers has no figure for the earlier one. Recorded as it is.
              expect([given.status, given.code, given.details['column']]).toEqual([409, 'ADJUST_REFUSED', 'repriced']);
            } else {
              expect(given.status, JSON.stringify(given.body).slice(0, 600)).toBe(201);
              expect([cents(given.body.data['amount']), cents(given.body.data['tax'])]).toEqual([Math.round(wanted.amount * 100), Math.round(wanted.tax * 100)]);
            }
          }
          // No ticket that was there moved by a cent, and no refund that was there either: read from the database.
          const after = await raw();
          const ticketsWere = before[`${PREFIX}tickets`]!;
          expect(after[`${PREFIX}tickets`]!.rows.slice(0, ticketsWere.rows.length).map((row) => Object.fromEntries(Object.keys(ticketsWere.columns).map((c) => [c, row[c]])))).toEqual(ticketsWere.rows);
          const oldRefund = before[`${PREFIX}refunds`]!.rows[0]!;
          expect(after[`${PREFIX}refunds`]!.rows.find((row) => row['id'] === oldRefund['id'])).toMatchObject(oldRefund);
        }, 120_000);

        it('refuses a write on a line of a ticket paid before the update, and leaves its total alone', async () => {
          const ticket = await d.one('tickets', made.paid);
          const line = (await d.rows('ticket_items')).find((l) => l['ticket_id'] === made.paid)!;
          for (const refused of [await d.patch('ticket_items', line['id'], { qty: 9 }), await d.post('ticket_items', { ticket_id: made.paid, name: 'Late', qty: 1, unit_price: 1 })]) {
            expect([refused.status, refused.code]).toEqual([409, 'RECORD_LOCKED']);
          }
          expect(figures(await d.one('tickets', made.paid))).toEqual(figures(ticket));
          // A paid ticket still takes what the till writes after the sale.
          await d.update('tickets', made.paid, { receipt_via: 'print', pickup_stage: 'collected' });
          expect(figures(await d.one('tickets', made.paid))).toEqual(figures(ticket));
        }, 60_000);

        it('carries a ticket opened before the update onto a new one and charges it right', async () => {
          const old = await d.one('tickets', made.open);
          expect(old['tax_rate_bp'] ?? null).toBeNull();
          // It has no rate, so it cannot be paid — whatever was paid on it.
          const stuck = await d.patch('tickets', made.open, { status: 'paid', closed_at: new Date().toISOString() });
          expect([stuck.status, stuck.code, stuck.details['requires']]).toEqual([409, 'STATE_MOVE_REFUSED', 'tax_rate_bp']);
          // The till's one tap: a new ticket, and each line moved with its quantity and price sent again.
          const fresh = await d.insert('tickets', { guests: old['guests'], status: 'open', staff_id: old['staff_id'] });
          expect(Number(fresh['tax_rate_bp'])).toBe(825);
          const lines = (await d.rows('ticket_items')).filter((l) => l['ticket_id'] === made.open);
          expect(lines).toHaveLength(2);
          for (const line of lines) await d.update('ticket_items', line['id'], { ticket_id: fresh['id'], qty: line['qty'], unit_price: line['unit_price'] });
          await d.update('tickets', made.open, { status: 'void', merged_into_id: fresh['id'] });
          const now = await d.one('tickets', fresh['id']);
          const goods = lines.reduce((sum, l) => sum + cents(l['unit_price']) * Number(l['qty']), 0);
          const tax = Math.floor((2 * goods * 825 + 10_000) / 20_000);
          expect([cents(now['subtotal']), cents(now['goods']), cents(now['tax']), cents(now['total']), cents(now['due'])]).toEqual([goods, goods, tax, goods + tax, goods + tax]);
          await d.insert('payments', { id: randomUUID(), ticket_id: fresh['id'], method: 'cash', amount: (goods + tax) / 100 });
          const paid = await d.update('tickets', fresh['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
          expect([paid['status'], cents(paid['total']), cents(paid['due'])]).toEqual(['paid', goods + tax, 0]);
          // The old one holds nothing now.
          expect(cents((await d.one('tickets', made.open))['subtotal'])).toBe(0);
        }, 120_000);

        it("an old client's close: the tax and total it sends are ignored, the server's stand", async () => {
          const ticket = await d.insert('tickets', { guests: 1, status: 'open', staff_id: made.staff });
          await d.insert('ticket_items', { ticket_id: ticket['id'], name: 'Flat White', qty: 2, unit_price: 5 });
          await d.insert('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', amount: 10.83 });
          const closed = await d.update('tickets', ticket['id'], { status: 'paid', closed_at: new Date().toISOString(), tax: 9.99, tip: 1, total: 99.99 });
          expect([closed['status'], cents(closed['tax']), cents(closed['total']), cents(closed['charged'])]).toEqual(['paid', 83, 1083, 1183]);
          // With something still owing, the same close is refused: the ticket stays open.
          const short = await d.insert('tickets', { guests: 1, status: 'open', staff_id: made.staff });
          await d.insert('ticket_items', { ticket_id: short['id'], name: 'Flat White', qty: 2, unit_price: 5 });
          const refused = await d.patch('tickets', short['id'], { status: 'paid', closed_at: new Date().toISOString(), tax: 0.83, tip: 0, total: 10.83 });
          expect([refused.status, refused.code]).toEqual([409, 'STATE_MOVE_REFUSED']);
          expect((await d.one('tickets', short['id']))['status']).toBe('open');
        }, 60_000);

        it('floors a card that was there: a spend over its balance is refused, the three old rows count', async () => {
          const card = (await d.rows('gift_cards')).find((c) => c['code'] === 'GC-48219930')!;
          expect(cents(card['balance'])).toBe(3850);
          const over = await d.post('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind: 'redeem', amount: -38.51 });
          expect([over.status, over.code, cents(over.details['balance'])]).toEqual([409, 'BALANCE_EXCEEDED', 3850]);
          await d.insert('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind: 'redeem', amount: -38.5 });
          const now = (await d.rows('gift_cards')).find((c) => c['id'] === card['id'])!;
          expect([cents(now['balance']), cents(now['remaining'])]).toEqual([0, 0]);
          const more = await d.post('gift_card_ledger', { id: randomUUID(), card_id: card['id'], kind: 'redeem', amount: -0.01 });
          expect([more.status, more.code]).toEqual([409, 'BALANCE_EXCEEDED']);
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
        }, 240_000);
      });
    });
  });
});
