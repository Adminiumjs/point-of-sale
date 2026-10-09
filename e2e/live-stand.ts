/**
 * The shop `live.e2e.ts` opens the till on: a built Adminium on SQLite with
 * Offers & gift cards, Inventory and Invoices & Receipts beside this repo's
 * app — packed with the BUILT staff screens (`npm run build:surface`), so the
 * real till is served at `/apps/pos/staff/`.
 *
 * Run by `vite-node` (the contract's harness is TypeScript); it seeds what the
 * flows need through the stand's doors, signs three people in, writes where
 * the shop is and each session's cookie to the file named by `LIVE_STAND_OUT`,
 * and then stays up until it is told to stop (SIGTERM).
 *
 * Tests only; nothing that ships imports it.
 */
import { writeFileSync } from 'node:fs';

import { appBundle, missing, ok } from '../src/contract/harness.ts';
import { standUp, type Row } from '../src/contract/stand.ts';

const PORT = Number(process.env['LIVE_STAND_PORT'] ?? 8940);
const OUT = process.env['LIVE_STAND_OUT'] ?? '';

export interface LiveStand {
  base: string;
  pid: number;
  connectionId: string;
  /** Each person's session, as the `cookie` header a browser would send. */
  /** `seller`: a cashier the owner also gave Offers' desk role — who may sell a new gift card, and print it. */
  cookies: { cashier: string; manager: string; admin: string; seller: string };
  names: { cashier: string; manager: string; seller: string };
  items: Record<string, string>;
  /** How many of the counted item the books hold. */
  mugsLeft: number;
  offerName: string;
}

async function main(): Promise<void> {
  const why = missing();
  if (why !== null) throw new Error(why);
  if (OUT === '') throw new Error('LIVE_STAND_OUT is not set');
  if (!appBundle().built) throw new Error('the staff screens are not built: run `npm run build:surface` first');

  const s = await standUp('sqlite', PORT, 'pos_e2e_live', { addOns: ['offers', 'inventory', 'invoices'], addOnSamples: ['offers', 'inventory'] });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void s.server.stop().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  try {
    await s.insert('settings', { venue_name: 'Daybreak Goods', tax_rate_bp: 825 });
    // A shop: the till opens in retail, where a returned thing is asked where it goes.
    ok(await s.staff.patch('/api/v1/apps/pos/settings', { values: { business_type: 'retail' } }));
    await s.insert('staff', { name: 'Mira Costa' });
    const food = await s.insert('menu_categories', { name: 'Food' });
    const shelf = await s.insert('menu_categories', { name: 'Homeware' });
    const items: Record<string, Row> = {};
    for (const [name, price, category] of [
      ['Breakfast Bowl', 12, food],
      ['Flat White', 5, food],
      ['Croissant', 3.8, food],
      ['Stoneware mug', 14, shelf],
      ['Enamel pin', 6, shelf],
    ] as const) {
      items[name] = await s.insert('menu_items', { name, price, category_id: category['id'] });
    }

    // Stock: the mug is counted on a shelf that holds some; the pin on one that holds none.
    const points = await s.rows('inventory_stock_points');
    const some = points.filter((one) => Number(one['available']) >= 8 && Number(one['available']) <= 60).sort((a, b) => Number(a['available']) - Number(b['available']))[0];
    if (some === undefined) throw new Error('Inventory’s sample has no shelf with stock on it');
    const link = async (item: Row, point: Row) =>
      ok(await s.staff.post(s.data('inventory_links'), { values: { source_table: 'pos:menu_items', source_row: String(item['id']), kind: 'item', item_id: point['item_id'], qty: '1', place_id: point['place_id'] } }), 201);
    await link(items['Stoneware mug']!, some);
    let none = points.find((one) => Number(one['on_hand']) === 0 && Number(one['available']) === 0 && one['id'] !== some['id']);
    if (none === undefined) {
      // No empty shelf in the sample: the pin shares the smallest other one, sold down to nothing below.
      none = points.filter((one) => one['id'] !== some['id'] && Number(one['available']) > 0).sort((a, b) => Number(a['available']) - Number(b['available']))[0];
      if (none === undefined) throw new Error('Inventory’s sample has no second shelf');
    }
    await link(items['Enamel pin']!, none);

    // What each of the till's roles may give.
    await s.insert('offers_ceilings', { role: 'pos-cashier', max_percent: 10, may_comp: false });
    await s.insert('offers_ceilings', { role: 'pos-manager', max_percent: 50, may_comp: false });

    // An automatic offer on one dish: a draft, what it is for, then switched on.
    const offerName = 'Croissant morning';
    const offer = await s.insert('offers_offers', { name: offerName, public_name: { 'en-US': 'Croissants, a tenth off' }, gives: 'percent', value: '10', trigger: 'automatic', applies_to: 'lines', starts_on: '2026-01-01', budget_open: true, combinable: true });
    await s.insert('offers_offer_targets', { offer_id: offer['id'], kind: 'item', source_table: 'pos:menu_items', source_row: String(items['Croissant']!['id']), label: 'Croissant' });
    await s.update('offers_offers', offer['id'], { status: 'active' });

    const names = { cashier: 'Sam Okafor', manager: 'Priya Nair', seller: 'Lena Fischer' };
    const cashier = await s.member('cashier', names.cashier);
    const manager = await s.member('manager', names.manager);
    const seller = await s.member('cashier', names.seller);
    // The manager also sits at Offers' desk: whoever sells a new gift card holds that role.
    const roles = ok(await s.staff.get<{ roles: { id: string; name: string }[] }>('/api/v1/roles')).roles;
    const users = ok(await s.staff.get<{ users: { id: string; name: string }[] }>('/api/v1/users')).users;
    const priya = users.find((one) => one.name === names.manager);
    const wanted = ['POS manager', 'Offers desk'].map((name) => roles.find((role) => role.name === name)?.id);
    if (priya === undefined || wanted.some((id) => id === undefined)) throw new Error(`no manager or no desk role: ${roles.map((role) => role.name).join(', ')}`);
    ok(await s.staff.put(`/api/v1/users/${priya.id}/roles`, { roleIds: wanted }));
    // And one cashier is given it beside the till's own role: a plain cashier sells no new card, and prints none.
    const lena = users.find((one) => one.name === names.seller);
    const both = ['POS cashier', 'Offers desk'].map((name) => roles.find((role) => role.name === name)?.id);
    if (lena === undefined || both.some((id) => id === undefined)) throw new Error('no second cashier, or no desk role');
    ok(await s.staff.put(`/api/v1/users/${lena.id}/roles`, { roleIds: both }));

    // The pin's shelf, sold down to nothing if the sample left something on it.
    const pinLeft = Number((await s.rows('inventory_stock_points')).find((one) => one['id'] === none!['id'])!['available']);
    if (pinLeft > 0) {
      const ticket = await s.insert('tickets', { guests: 1, status: 'open' });
      await s.insert('ticket_items', { ticket_id: ticket['id'], menu_item_id: items['Enamel pin']!['id'], name: 'Enamel pin', qty: pinLeft, unit_price: 6, seat: 1 });
      await s.insert('payments', { id: crypto.randomUUID(), ticket_id: ticket['id'], method: 'cash', amount: Number((await s.one('tickets', ticket['id']))['due']) });
      await s.update('tickets', ticket['id'], { status: 'paid', closed_at: new Date().toISOString(), tip: 0 });
    }

    const out: LiveStand = {
      base: s.server.base,
      pid: process.pid,
      connectionId: s.connectionId,
      cookies: { cashier: cashier.session, manager: manager.session, admin: s.staff.session, seller: seller.session },
      names,
      items: Object.fromEntries(Object.entries(items).map(([name, row]) => [name, String(row['id'])])),
      mugsLeft: Number(some['available']),
      offerName,
    };
    writeFileSync(OUT, JSON.stringify(out), { mode: 0o600 });
  } catch (error) {
    await s.server.stop();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
