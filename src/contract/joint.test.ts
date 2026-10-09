/**
 * ONE MENU, TWO APPS, ONE DEDUCTION EACH — ON EVERY ENGINE.
 *
 * Point of Sale made the menu; Online ordering, installed beside it on the
 * same database, shares it. A dish is linked to a stock item once, under the
 * name of the table's maker (`pos:menu_items`). A till sale and an online
 * order of that dish then each take one from the shelf: two records in
 * Inventory, one per sale, and nothing counted twice.
 *
 * Online ordering is read from its own checkout (`ORDERING_REPO`, its built
 * `manifest.json` and sample; stand-in pages) and is skipped, saying so, when
 * that is not here.
 */
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminiumVersion, ENGINES, missing, ok, until, type Engine } from './harness';

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x![i] !== y![i]) return x![i]! > y![i]!;
  return false;
};
import { readIds, standUp, type Row, type Stand } from './stand';

const ORDERING_REPO = process.env['ORDERING_REPO'] ?? '';
const orderingHere = ORDERING_REPO !== '' && existsSync(join(ORDERING_REPO, 'manifest.json'));
const why = missing() ?? (orderingHere ? null : 'ORDERING_REPO is not set (a checkout of Online ordering with its manifest.json)');
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 24;
/** A Tuesday lunchtime at the kitchen: Online ordering's sample is open then. */
const NOON = Date.parse('2026-07-28T18:40:00Z');
const ZONE = 'America/Los_Angeles';

/** An npm-shaped tarball of Online ordering as its checkout holds it. */
function orderingBundle(): { buffer: Buffer; integrity: string; key: string; version: string } {
  const manifest = JSON.parse(readFileSync(join(ORDERING_REPO, 'manifest.json'), 'utf8')) as { key: string; version: string; sampleData?: { file: string }; frontends?: { side: string }[]; compatibility: Record<string, unknown> };
  const files: Record<string, Buffer> = {
    'package.json': Buffer.from(JSON.stringify({ name: `@adminiumjs/app-${manifest.key}`, version: manifest.version })),
    // As the till's own bundle is packed: a floor that names the release this Adminium checkout is about to be is packed at the checkout's own number.
    'manifest.json': Buffer.from(JSON.stringify(newer(String(manifest.compatibility['minAdminiumVersion']), adminiumVersion()) ? { ...manifest, compatibility: { ...manifest.compatibility, minAdminiumVersion: adminiumVersion() } } : manifest)),
  };
  for (const side of (manifest.frontends ?? []).map((f) => f.side)) files[`${side}/index.html`] = Buffer.from(`<!doctype html><html><body data-app="ordering-${side}"></body></html>`);
  if (manifest.sampleData !== undefined) files[manifest.sampleData.file] = readFileSync(join(ORDERING_REPO, manifest.sampleData.file));
  const members: Buffer[] = [];
  const put = (block: Buffer, at: number, length: number, value: string) => Buffer.from(value, 'latin1').subarray(0, length).copy(block, at);
  for (const [path, body] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    put(header, 0, 100, `package/${path}`);
    put(header, 100, 8, '0000644\0');
    put(header, 124, 12, `${body.length.toString(8).padStart(11, '0')}\0`);
    put(header, 136, 12, '00000000000\0');
    put(header, 156, 1, '0');
    put(header, 257, 6, 'ustar\0');
    put(header, 263, 2, '00');
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(header, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
    members.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  members.push(Buffer.alloc(1024));
  const buffer = gzipSync(Buffer.concat(members), { mtime: 0 } as never);
  return { buffer, integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}`, key: manifest.key, version: manifest.version };
}

describe.skipIf(why !== null)(`one menu, the till and Online ordering, one deduction each${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let dish: Row;
      let point: Row;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_joint_${engine}`, { addOns: ['inventory'], addOnSamples: ['inventory'], now: NOON - 60_000 });
        ok(await s.staff.patch(`/api/v1/connections/${s.connectionId}`, { timezone: ZONE, currency: 'USD' }));
        await s.insert('settings', { venue_name: 'Juniper Kitchen', tax_rate_bp: 825 });
        const food = await s.insert('menu_categories', { name: 'Drinks' });
        dish = await s.insert('menu_items', { name: 'House lemonade', price: 4, category_id: food['id'] });
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      const stock = async () => Number((await s.rows('inventory_stock_points')).find((one) => one['id'] === point['id'])!['on_hand']);

      it('Online ordering installs beside the till and shares its menu: the dish the till made is on its menu', async () => {
        const app = orderingBundle();
        const staged = await s.staff.post(`/api/v1/apps/upload?expectedSha512=${encodeURIComponent(app.integrity)}`, app.buffer);
        expect([200, 201], JSON.stringify(staged.body).slice(0, 800)).toContain(staged.status);
        const body = { key: app.key, version: app.version, connectionId: s.connectionId };
        const plan = ok(await s.staff.post<{ plan: { checksum: string; installable: boolean; tables: { ref: string; table: string; action: string }[] } }>('/api/v1/apps/plan', body)).plan;
        expect(plan.installable).toBe(true);
        // The menu is the till's own table, reused.
        expect(plan.tables.find((t) => t.ref === 'menu_items')).toMatchObject({ table: 'pos_menu_items' });
        const installed = await s.staff.post('/api/v1/apps/install', { ...body, planChecksum: plan.checksum, addOns: [{ key: 'inventory', version: ok(await s.staff.get<{ addOns: { key: string; version: string }[] }>('/api/v1/add-ons')).addOns.find((a) => a.key === 'inventory')!.version }] });
        expect(installed.status, JSON.stringify(installed.body).slice(0, 1500)).toBe(200);
        ok(await s.staff.post('/api/v1/apps/ordering/sample-data'));
        await until(async () => (ok(await s.staff.get<{ loaded: boolean }>('/api/v1/apps/ordering/sample-data')).loaded ? true : undefined), "Online ordering's sample to be added");
        await readIds(s.staff, s.connectionId, s.ids);
        expect(s.ids['ordering_orders']).toBeDefined();
      }, 300_000);

      it('one link on the dish, under the name of the menu’s maker', async () => {
        const points = await s.rows('inventory_stock_points');
        point = points.filter((one) => Number(one['available']) >= 8 && Number(one['available']) <= 60).sort((a, b) => Number(a['available']) - Number(b['available']))[0]!;
        ok(await s.staff.post(s.data('inventory_links'), { values: { source_table: 'pos:menu_items', source_row: String(dish['id']), kind: 'item', item_id: point['item_id'], qty: '1', place_id: point['place_id'] } }), 201);
      }, 60_000);

      it('a till sale and an online order each take one, once: two records, one per sale', async () => {
        const before = await stock();
        // The till: one lemonade, paid.
        const ticket = await s.insert('tickets', { guests: 1, status: 'open' });
        await s.insert('ticket_items', { ticket_id: ticket['id'], menu_item_id: dish['id'], name: dish['name'], qty: 1, unit_price: 4, seat: 1 });
        await s.insert('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'cash', amount: Number((await s.one('tickets', ticket['id']))['due']) });
        await s.update('tickets', ticket['id'], { status: 'paid', closed_at: new Date().toISOString() });
        expect(await stock()).toBe(before - 1);
        // The kitchen: a phone order of the same dish, taken, confirmed and started.
        const pickup = new Date(NOON + 50 * 60_000).toISOString();
        const order = await s.post('ordering_orders', { language: 'en-US', name: 'Ana', phone: '+12075550100', pickup_at: pickup, channel: 'phone' }, { ordering_order_items: [{ menu_item_id: dish['id'], qty: 1 }] });
        expect(order.status, JSON.stringify(order.body).slice(0, 1200)).toBe(201);
        // Held, not yet taken.
        expect(await stock()).toBe(before - 1);
        for (const status of ['confirmed', 'preparing']) expect((await s.patch('ordering_orders', order.body.data['id'], { status })).status, status).toBe(200);
        expect(await stock()).toBe(before - 2);
        const posts = (await s.rows('inventory_postings')).filter((row) => Number(row['rows']) > 0 && row['phase'] === 'post' && ['pos:tickets', 'ordering:orders'].includes(String(row['source_table'])));
        expect(posts.map((row) => [row['source_table'], String(row['source_row']), row['posting']]).sort()).toEqual([['ordering:orders', String(order.body.data['id']), 'ingredients'], ['pos:tickets', String(ticket['id']), 'sale']].sort());
      }, 180_000);
    });
  });
});
