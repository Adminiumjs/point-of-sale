/**
 * POINT OF SALE'S CONTRACT WITH ADMINIUM AND ITS TWO ADD-ONS, ON EVERY ENGINE.
 *
 * This repo's own `manifest.json`, installed on a BUILT Adminium beside the
 * Invoices & Receipts and Barcode Labels add-ons, on SQLite, Postgres and
 * MySQL, then driven over HTTP as the till drives it:
 *
 *   1. the install check offers both add-ons as suggestions, each with the
 *      feature it switches on, and ticks neither;
 *   2. installed with both ticked, the till's staff config lists them — the
 *      two features are on — and nothing opens the guest's address to the
 *      public side;
 *   3. a paid ticket keeps what the guest was charged, tip included;
 *   4. an emailed receipt: the one row the till writes goes out with the
 *      receipt Invoices & Receipts drew attached (a PDF in a Latin language,
 *      the print copy in Arabic), and the row says it was sent;
 *   5. shelf labels: a label sheet for a menu item through the staff route,
 *      drawn from its own barcode; an accented name, a mistyped barcode and
 *      no barcode each refused in the words the till shows;
 *   6. an add-on switched off for the app: its feature is off in the staff
 *      config, the label route says so, and a receipt is never sent without
 *      its receipt.
 *
 * It runs where an Adminium checkout with its built server and dashboard is
 * (`ADMINIUM_REPO`) and the add-ons checkout beside this repo (`ADD_ONS_REPO`),
 * and says why it skipped when they are not; `ADMINIUM_REQUIRE_CONTRACT=1`
 * makes that a failure. Postgres and MySQL run with `TEST_POSTGRES_URL` /
 * `TEST_MYSQL_URL`. The engines run one after the other on the same four ports
 * (`CONTRACT_PORT`, default 4931–4934).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { labelOutcomeOf } from '../data/documents';
import { featuresOf } from '../features';
import type { AttachedAddOn } from '../staffConnection';
import { ADD_ON_DIRS, addOnBundle, appBundle, attachedFiles, packedFloor, boot, Caller, ENGINES, mailbox, missing, ok, packedVersion, until, type Engine, type Server } from './harness';

type Row = Record<string, unknown>;

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931);
const ADMIN = { email: process.env['E2E_ADMIN_EMAIL'] ?? 'e2e@adminium.local', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'adminium-e2e-password' };
const VENUE = 'Harbour Kiosk';

/** Said in the name: a checkout packed as the release it will be. */
const REHEARSAL =
  why === null
    ? Object.keys(ADD_ON_DIRS)
        .map((key) => ({ key, ...packedVersion(key) }))
        .filter((p) => p.rehearsed)
        .map((p) => `${p.key} ${p.checkout} packed as ${p.version}`)
        .concat(packedFloor().rehearsed ? [`the app's floor ${packedFloor().asked} packed as ${packedFloor().floor}, the Adminium checkout's own`] : [])
        .join(', ')
    : '';

const money = (value: unknown) => Math.round(Number(value) * 100) / 100;

describe.skipIf(why !== null)(`the contract with a built Adminium${why === null ? (REHEARSAL === '' ? '' : ` (${REHEARSAL}: their release not yet stamped)`) : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let server: Server;
      let staff: Caller;
      let connectionId = '';
      let tableIds: Record<string, string> = {};

      beforeAll(async () => {
        server = await boot(engine as Engine, PORT, `pos_contract_${engine}`);
        staff = new Caller(server.base, { origin: server.base });
        await staff.signIn(ADMIN.email, ADMIN.password);
        const connections = ok(await staff.get<{ connections: { id: string; name: string }[] }>('/api/v1/connections'));
        connectionId = connections.connections.find((c) => c.name === 'northwind')!.id;
      }, 240_000);

      afterAll(async () => {
        await server?.stop();
      });

      const data = (ref: string) => `/api/v1/data/${connectionId}/${encodeURIComponent(tableIds[ref]!)}`;
      const insert = async (ref: string, values: Row): Promise<Row> => ok(await staff.post<{ data: Row }>(data(ref), { values }), 201).data;
      const update = async (ref: string, id: unknown, values: Row): Promise<Row> => ok(await staff.patch<{ data: Row }>(`${data(ref)}/${String(id)}`, { values })).data;
      const one = async (ref: string, id: unknown): Promise<Row> => ok(await staff.get<{ data: Row }>(`${data(ref)}/${String(id)}`)).data;
      const config = async () => ok(await staff.get<{ addOns?: Record<string, AttachedAddOn> }>('/apps/pos/staff/surface-config.json'));
      // As the till asks for a sheet (`portDocuments`): the count as a request value.
      const label = (id: unknown, count = 1) =>
        staff.post<{ contentUrl: string; reused: boolean }>('/api/v1/apps/pos/documents/render', { kind: 'label-sheet', ref: 'menu_items', pk: { id }, values: { count } });

      it('offers both add-ons at the install check, each with its feature, ticking neither', async () => {
        for (const key of Object.keys(ADD_ON_DIRS)) {
          const addOn = addOnBundle(key);
          const stored = ok(await staff.post<{ key: string; version: string }>(`/api/v1/add-ons/upload?expectedSha512=${encodeURIComponent(addOn.integrity)}`, addOn.buffer));
          expect([stored.key, stored.version]).toEqual([addOn.key, addOn.version]);
        }
        const app = appBundle();
        const staged = await staff.post(`/api/v1/apps/upload?expectedSha512=${encodeURIComponent(app.integrity)}`, app.buffer);
        expect([200, 201], JSON.stringify(staged.body).slice(0, 800)).toContain(staged.status);
        const plan = ok(
          await staff.post<{ plan: { installable: boolean; addOns: { key: string; need: string; checked: boolean; action: string | null; features: { id: string }[]; reason: Record<string, string> }[] } }>(
            '/api/v1/apps/plan',
            { key: app.key, version: app.version, connectionId },
          ),
        ).plan;
        expect(plan.installable).toBe(true);
        const offered = Object.fromEntries(plan.addOns.map((a) => [a.key, a]));
        expect(Object.keys(offered).sort()).toEqual(['barcode-labels', 'invoices']);
        expect(offered['invoices']).toMatchObject({ checked: false, action: 'install', features: [{ id: 'emailed-receipts' }] });
        expect(offered['barcode-labels']).toMatchObject({ checked: false, action: 'install', features: [{ id: 'shelf-labels' }] });
        // Suggested, never required: the till installs without either.
        expect(offered['invoices']!.need).not.toBe('requires');
        expect(offered['invoices']!.reason['de-DE']).toContain('E-Mail');
      }, 120_000);

      it('installs with both ticked: the add-ons first, the till’s two features on', async () => {
        const app = appBundle();
        const body = { key: app.key, version: app.version, connectionId };
        const plan = ok(await staff.post<{ plan: { checksum: string } }>('/api/v1/apps/plan', body)).plan;
        const addOns = Object.keys(ADD_ON_DIRS).map((key) => ({ key, version: packedVersion(key).version }));
        const installed = ok(
          await staff.post<{ schema: { created: string[] }; rules: { skipped: unknown[] }; outbox?: { defined: boolean }; addOns?: { installed: { key: string }[] } }>('/api/v1/apps/install', {
            ...body,
            planChecksum: plan.checksum,
            addOns,
          }),
        );
        expect(installed.addOns?.installed.map((a) => a.key).sort()).toEqual(['barcode-labels', 'invoices']);
        expect(JSON.stringify(installed.rules.skipped)).toBe('[]');
        expect(installed.outbox?.defined).toBe(true);
        const created = installed.schema.created;
        expect(created).toEqual(expect.arrayContaining(['pos_messages', 'pos_tickets', 'pos_menu_items']));
        const schema = ok(await staff.get<{ model: { tables: { id: string; name: string }[] } }>(`/api/v1/connections/${connectionId}/schema`));
        tableIds = Object.fromEntries(created.map((name) => [name.slice('pos_'.length), schema.model.tables.find((t) => t.name === name)!.id]));
        // The staff config names both add-ons, so the till shows both features.
        const staffConfig = await config();
        expect(Object.keys(staffConfig.addOns ?? {}).sort()).toEqual(['barcode-labels', 'invoices']);
        expect(featuresOf(staffConfig.addOns)).toEqual({ 'emailed-receipts': true, 'shelf-labels': true });
        // The venue's name, which the email is signed with.
        await insert('settings', { venue_name: VENUE, tax_rate_bp: 825 });
      }, 240_000);

      it('opens nothing of a guest’s address to the public side', async () => {
        ok(await staff.put('/api/v1/public-api', { enabled: true }));
        const publicConfig = ok(await new Caller(server.base).get<{ publishableKey: string; addOns?: Record<string, unknown> }>('/apps/pos/customer/surface-config.json'));
        // The public document says an add-on is there, and nothing of its settings.
        for (const entry of Object.values(publicConfig.addOns ?? {})) expect(entry).toEqual({ present: true });
        const guest = new Caller(server.base, { authorization: `Bearer ${publicConfig.publishableKey}`, origin: server.base });
        const refs = ok(await guest.get<{ data: { refs: Record<string, { select?: string[] }> } }>('/api/v1/public/config')).data.refs;
        const exposed = JSON.stringify(refs);
        expect(exposed).not.toContain('pos_messages');
        expect(exposed).not.toContain('pos_tickets');
        expect(exposed).not.toContain('receipt_to');
        expect(exposed).not.toContain('to_address');
      }, 60_000);

      let ticketId: unknown;
      let ticketNumber = '';
      it('keeps what a paid ticket charged the guest, tip included', async () => {
        const server = await insert('staff', { name: 'Mira Costa' });
        const ticket = await insert('tickets', { guests: 1, status: 'open', staff_id: server['id'] });
        ticketId = ticket['id'];
        ticketNumber = String(ticket['number']);
        // As the till writes a sale: two flat whites and a croissant, a muffin voided before it was paid.
        await insert('ticket_items', { ticket_id: ticketId, name: 'Flat White', qty: 2, unit_price: 4.5, seat: 1 });
        await insert('ticket_items', { ticket_id: ticketId, name: 'Croissant', qty: 1, unit_price: 3.8, seat: 1 });
        await insert('ticket_items', { ticket_id: ticketId, name: 'Blueberry Muffin', qty: 1, unit_price: 3.9, seat: 1, voided_at: new Date().toISOString(), void_reason: 'Dropped' });
        // Subtotal 12.80 (the rollup leaves the voided line out), 1.00 off the ticket, tax 0.97, tip 1.50.
        const paid = await update('tickets', ticketId, { status: 'paid', closed_at: new Date().toISOString(), discount_kind: 'amount', discount_value: 1, tax: 0.97, tip: 1.5, total: 12.77 });
        expect(money(paid['subtotal'])).toBe(12.8);
        expect(money(paid['charged'])).toBe(14.27);
        expect(money((await one('tickets', ticketId))['charged'])).toBe(14.27);
        // A value a writer sends is not what is kept: the rule decides it.
        const again = await update('tickets', ticketId, { charged: 99, tip: 2 });
        expect(money(again['charged'])).toBe(14.77);
        await update('tickets', ticketId, { tip: 1.5 });
      }, 60_000);

      // Not a reserved domain (`example.com` and the like are never sent to): the sink catches every address.
      it('sends the receipt the till asked for, with the 80 mm receipt attached', async () => {
        const to = `guest-${engine}@tillmail.net`;
        const id = randomUUID();
        // Exactly the row the till writes (`emailReceipt` in state/store.ts).
        await insert('messages', { id, kind: 'receipt', status: 'queued', to_address: to, language: 'en-US', ticket_id: ticketId });
        const mail = await until(async () => (await mailbox(server)).find((m) => m.to.includes(to)), `the receipt to ${to}`, 150_000);
        expect(mail.subject).toBe(`Your receipt from ${VENUE}`);
        expect(mail.text).toContain('tip included');
        const files = attachedFiles(mail);
        expect(files, JSON.stringify(mail.attachments)).toHaveLength(1);
        expect(files[0]).toMatchObject({ contentType: 'application/pdf' });
        expect(files[0]!.filename).toMatch(/^receipt.*\.pdf$/);
        const row = await until(async () => {
          const r = await one('messages', id);
          return r['status'] === 'sent' ? r : undefined;
        }, 'the message to read sent');
        expect(row['sent_at']).not.toBeNull();
        expect(row['error']).toBeNull();
      }, 180_000);

      it('draws that receipt as the sale: its lines, the discount, tip, what was taken and who served', async () => {
        // The same receipt the email carried (the row is unchanged, so it is handed back, not drawn again).
        const drawn = ok(await staff.post<{ printUrl: string; reused: boolean; document: { number: string | null } }>('/api/v1/apps/pos/documents/render', { kind: 'receipt', ref: 'tickets', pk: { id: ticketId } }));
        expect(drawn.reused).toBe(true);
        const page = (await staff.get(drawn.printUrl)).bytes.toString('utf8').replace(/&#x27;|&#39;/g, "'");
        const text = page.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
        for (const line of ['Flat White', 'Croissant', 'Mira Costa', ticketNumber]) expect(text, line).toContain(line);
        expect(text).not.toContain('Blueberry Muffin');
        // Adminium's register numbers the receipt; the ticket's number is its reference.
        expect(text).toMatch(/REC-\d+/);
        // Subtotal, tax and tip as stored; the total with the tip (12.77 + 1.50), which is also what was taken.
        for (const figure of ['12.80', '0.97', '1.50', '14.27']) expect(text, `${figure} in ${text.slice(text.indexOf('Receipt'), text.indexOf('Receipt') + 900)}`).toContain(figure);
        // A reduction off the whole ticket, printed as its own row.
        expect(text).toMatch(/[−-]\s?\S?1\.00/);
      }, 60_000);

      it('carries the print copy in a language a PDF cannot set (Arabic)', async () => {
        const to = `guest-ar-${engine}@tillmail.net`;
        await insert('messages', { id: randomUUID(), kind: 'receipt', status: 'queued', to_address: to, language: 'ar-EG', ticket_id: ticketId });
        const mail = await until(async () => (await mailbox(server)).find((m) => m.to.includes(to)), `the Arabic receipt to ${to}`, 150_000);
        expect(mail.subject).toBe(`إيصالك من ${VENUE}`);
        const files = attachedFiles(mail);
        expect(files, JSON.stringify(mail.attachments)).toHaveLength(1);
        // Arabic words have no glyphs in a PDF's standard fonts: the print copy goes instead.
        expect(files[0]!.contentType, JSON.stringify(files)).toMatch(/^text\/html/);
      }, 180_000);

      let itemId: unknown;
      it('draws a sheet of shelf labels from a menu item’s own barcode', async () => {
        const item = await insert('menu_items', { name: 'Sea Salt Crackers', price: 3.5, barcode: '4006381333931' });
        itemId = item['id'];
        const first = await label(itemId);
        expect(first.status, first.message).toBe(201);
        const bytes = (await staff.get(first.body.contentUrl)).bytes;
        expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(bytes.toString('latin1')).toContain('Sea Salt Crackers');
        // The row unchanged, the same sheet comes back.
        const second = await label(itemId);
        expect([second.status, second.body.reused]).toEqual([200, true]);
        // As many labels as the till asks for: a full sheet, then more than a sheet holds.
        const pagesOf = async (count: number) => {
          const drawn = await label(itemId, count);
          expect(drawn.status, drawn.message).toBeLessThan(300);
          const pdf = (await staff.get(drawn.body.contentUrl)).bytes.toString('latin1');
          return { labels: pdf.split('(Sea Salt Crackers)').length - 1, pages: Number(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/.exec(pdf)?.[1]) };
        };
        expect(await pagesOf(1)).toEqual({ labels: 1, pages: 1 });
        expect(await pagesOf(24)).toEqual({ labels: 24, pages: 1 });
        expect(await pagesOf(30)).toEqual({ labels: 30, pages: 2 });
        // Only the slot the manifest lists (`requestValues: ["count"]`) takes a request value.
        const other = await staff.post('/api/v1/apps/pos/documents/render', { kind: 'label-sheet', ref: 'menu_items', pk: { id: itemId }, values: { entity: 'Shelf' } });
        expect(other.status, other.message).toBe(400);
        const onReceipt = await staff.post('/api/v1/apps/pos/documents/render', { kind: 'receipt', ref: 'tickets', pk: { id: ticketId }, values: { count: 2 } });
        expect(onReceipt.status, onReceipt.message).toBe(400);

      }, 60_000);

      it('refuses an accented name, a mistyped barcode and no barcode — each in the till’s words', async () => {
        await update('menu_items', itemId, { name: 'Café crème' });
        const latin = await label(itemId);
        expect([latin.status, latin.code]).toEqual([422, 'DOCUMENT_NOT_DRAWN']);
        expect(labelOutcomeOf(latin)).toEqual({ ok: false, reason: 'latin', letters: expect.stringContaining('é') });

        await update('menu_items', itemId, { name: 'Sea Salt Crackers', barcode: '4006381333930' });
        expect(labelOutcomeOf(await label(itemId))).toEqual({ ok: false, reason: 'code' });

        await update('menu_items', itemId, { barcode: null });
        expect(labelOutcomeOf(await label(itemId))).toEqual({ ok: false, reason: 'missing' });

        // A row that is not there is the one 404.
        expect(labelOutcomeOf(await label(987654))).toEqual({ ok: false, reason: 'gone' });
        await update('menu_items', itemId, { barcode: '4006381333931' });
      }, 60_000);

      it('switches shelf labels off with Barcode Labels, and on again', async () => {
        const off = ok(await staff.patch<{ features?: unknown[] }>('/api/v1/add-ons/barcode-labels', { attachedTo: 'pos', enabled: false }));
        // Switching it off warns that a feature stops.
        expect(JSON.stringify(off.features ?? [])).toContain('shelf-labels');
        expect(featuresOf((await config()).addOns)).toEqual({ 'emailed-receipts': true, 'shelf-labels': false });
        const refused = await label(itemId);
        expect([refused.status, refused.code]).toEqual([409, 'FEATURE_OFF']);
        expect(labelOutcomeOf(refused)).toEqual({ ok: false, reason: 'off' });
        ok(await staff.patch('/api/v1/add-ons/barcode-labels', { attachedTo: 'pos', enabled: true }));
        expect(featuresOf((await config()).addOns)['shelf-labels']).toBe(true);
        expect((await label(itemId)).status).toBeLessThan(300);
      }, 60_000);

      it('never sends a receipt without its receipt: Invoices & Receipts off, the email fails and says why', async () => {
        ok(await staff.patch('/api/v1/add-ons/invoices', { attachedTo: 'pos', enabled: false }));
        expect(featuresOf((await config()).addOns)['emailed-receipts']).toBe(false);
        const to = `guest-off-${engine}@tillmail.net`;
        const id = randomUUID();
        await insert('messages', { id, kind: 'receipt', status: 'queued', to_address: to, language: 'en-US', ticket_id: ticketId });
        const row = await until(async () => {
          const r = await one('messages', id);
          return r['status'] === 'failed' ? r : undefined;
        }, 'the message to fail', 150_000);
        expect(String(row['error'])).toMatch(/not available/i);
        expect((await mailbox(server)).some((m) => m.to.includes(to))).toBe(false);
        ok(await staff.patch('/api/v1/add-ons/invoices', { attachedTo: 'pos', enabled: true }));
      }, 180_000);
    });
  });
});
