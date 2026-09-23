// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Connected mode: the read set, and what the till makes of it.
 *
 * A fake port answers each read as the data API would — applying the
 * `where` and `order` it is sent — so these pin both halves: that the till
 * asks only for what it needs (open tickets, today's money, tonight's
 * bookings), and that the rows become the shapes `demoSource` returns.
 *
 * The three refusals this file used to pin (no staff table, no modifier
 * catalogue, no tax) are gone with the schema that forced them: the tables
 * exist now, so the till reads them — and still invents nothing they do not
 * say.
 */
import { describe, expect, it } from 'vitest';

import { createPublicClient } from '@adminiumjs/public-client';

import { REQUIRED, loadSnapshot, snapshotFailure, snapshotSource } from './adminiumSource';
import { portHistory } from './history';
import type { ListCondition, ListOptions, SnapshotPort } from './snapshotPort';
import { demoSource, isConnected, setDataSource, source } from './source';

const TZ = 'Europe/Lisbon';
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const at = (hhmm: string, dayOffset = 0) => {
  const d = new Date(`${today}T${hhmm}:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
};
const YESTERDAY = at('10:00', -1);

type Rows = Record<string, Record<string, unknown>[]>;

const ROWS: Rows = {
  settings: [{ id: 1, venue_name: 'Daybreak Coffee', venue_mark: 'D', address: '128 Alder Lane', phone: '(415) 555-0148', tax_rate_bp: 825, tip_presets: [0, 10, 15, 20], receipt_footer: 'See you soon' }],
  bookingRules: [{ id: 1, opens: '17:00', closes: '21:00', slot_minutes: 30, covers_per_slot: 12, days_ahead: 2, max_party: 8, hold_minutes: 15, cancel_hours: 2, occasions: '["birthday","date"]' }],
  staff: [
    { id: 3, name: 'Sam Rivera', initials: 'SR', role: 'Barista', email: 'sam@daybreak.test', active: true },
    { id: 4, name: 'Alex Chen', initials: null, role: 'Shift lead', email: null, active: 1 },
    { id: 5, name: 'Gone Away', initials: 'GA', role: 'Barista', email: 'gone@daybreak.test', active: false },
  ],
  menuCategories: [
    { id: 2, slug: 'bakery', name: 'Bakery', position: 2, icon: 'croissant', tint: '#c19a3e' },
    { id: 1, slug: 'coffee', name: 'Coffee', position: 1, icon: 'coffee', tint: '#9a6a3c' },
  ],
  menuItems: [
    { id: 11, category_id: 1, slug: 'flatwhite', name: 'Flat White', price: '4.50', image: 'fw.webp', available: true, featured: 1, position: 1 },
    { id: 12, category_id: 2, slug: 'croissant', name: 'Croissant', price: '3.80', image: null, available: false, featured: 0, position: 2 },
  ],
  modifierGroups: [{ id: 21, item_id: 11, slug: 'milk', name: 'Milk', kind: 'radio', min: 1, max: 1, position: 0 }],
  modifiers: [
    { id: 32, group_id: 21, slug: 'oat', name: 'Oat milk', price_delta: '0.60', available: true, position: 1 },
    { id: 31, group_id: 21, slug: 'whole', name: 'Whole milk', price_delta: '0.00', available: true, position: 0 },
  ],
  restaurantTables: [
    { id: 41, label: 'W2', seats: 2, zone: 'Window', position: 0 },
    { id: 42, label: 'P1', seats: 4, zone: 'Patio', position: 1 },
  ],
  tickets: [
    { id: 51, number: '1042', table_id: 41, status: 'open', kitchen_status: 'new', held: false, guests: 2, total: '9.00', opened_at: at('09:10'), sent_at: null, closed_at: null },
    { id: 52, number: '1041', table_id: 42, status: 'sent', kitchen_status: 'cooking', held: true, guests: 3, total: '3.80', opened_at: at('09:00'), sent_at: at('09:02'), closed_at: null },
    { id: 53, number: '1040', table_id: null, status: 'paid', kitchen_status: 'served', held: false, guests: 1, subtotal: '4.50', tax: '0.37', total: '4.87', opened_at: at('08:30'), sent_at: at('08:31'), closed_at: at('08:35') },
    { id: 49, number: 'S-0990', table_id: 42, status: 'paid', kitchen_status: 'served', held: false, guests: 2, subtotal: '10.00', tax: '0.83', total: '9.83', opened_at: at('12:00', -3), sent_at: at('12:01', -3), closed_at: at('12:30', -3) },
  ],
  ticketItems: [
    { id: 61, ticket_id: 51, menu_item_id: 11, name: 'Flat White', qty: 2, unit_price: '5.10', seat: 1, notes: 'Extra hot', sent_at: null, voided_at: null },
    { id: 62, ticket_id: 51, menu_item_id: 12, name: 'Croissant', qty: 1, unit_price: '3.80', seat: 1, notes: null, sent_at: null, voided_at: at('09:12') },
    { id: 63, ticket_id: 52, menu_item_id: 12, name: 'Croissant', qty: 1, unit_price: '3.80', seat: 0, notes: null, sent_at: at('09:02'), voided_at: null },
    { id: 64, ticket_id: 53, menu_item_id: 11, name: 'Flat White', qty: 1, unit_price: '4.50', seat: 1, notes: null, sent_at: at('08:31'), voided_at: null },
    { id: 65, ticket_id: 49, menu_item_id: 12, name: 'Croissant', qty: 2, unit_price: '5.00', seat: 0, notes: null, sent_at: at('12:01', -3), voided_at: null },
  ],
  ticketItemModifiers: [
    { id: 71, ticket_item_id: 61, modifier_id: 32, price_delta: '0.60' },
    { id: 72, ticket_item_id: 64, modifier_id: 32, price_delta: '0.60' },
  ],
  payments: [
    { id: 'p1', ticket_id: 53, method: 'card', amount: '4.50', tip: '0.50', paid_at: at('08:35') },
    { id: 'p2', ticket_id: 51, method: 'cash', amount: '4.00', tip: null, paid_at: at('09:20') },
    { id: 'p0', ticket_id: 50, method: 'cash', amount: '99.00', tip: null, paid_at: YESTERDAY },
    { id: 'p9', ticket_id: 49, method: 'qr', amount: '9.83', tip: null, paid_at: at('12:30', -3) },
  ],
  refunds: [
    { id: 'r1', ticket_id: 53, method: 'cash', amount: '1.20', tax: '0.09', refunded_at: at('09:30') },
    { id: 'r0', ticket_id: 50, method: 'card', amount: '50.00', tax: '3.80', refunded_at: YESTERDAY },
  ],
  refundItems: [{ id: 'ri1', refund_id: 'r1', ticket_item_id: 64, qty: 1 }],
  shifts: [
    { id: 81, started_at: at('07:00'), ended_at: null, opening_float: '150.00' },
    { id: 80, started_at: at('07:00', -1), ended_at: at('15:00', -1), opening_float: '200.00' },
  ],
  timeClock: [
    { id: 101, staff_id: 3, clock_in: at('06:55'), clock_out: null },
    { id: 100, staff_id: 4, clock_in: at('07:00', -1), clock_out: at('15:00', -1) },
    { id: 102, staff_id: 5, clock_in: at('07:00'), clock_out: null },
  ],
  reservations: [
    { id: 91, code: 'MR-4829', name: 'Mara Rossi', mobile: '+1 415 555 0166', party_size: 2, starts_at: at('19:00'), status: 'confirmed', channel: 'online', table_id: null, occasion: 'anniversary', guest_request: 'Quiet, please', staff_note: null },
    { id: 90, code: 'MR-OLD1', name: 'Last Week', mobile: null, party_size: 2, starts_at: at('19:00', -7), status: 'confirmed', channel: 'phone', table_id: null, occasion: null, guest_request: null, staff_note: null },
  ],
};

/** A row passes a condition as the data API would judge it. */
function matches(row: Record<string, unknown>, where: ListCondition): boolean {
  if ('and' in where) return where.and.every((c) => matches(row, c));
  if ('or' in where) return where.or.some((c) => matches(row, c));
  const value = row[where.column];
  switch (where.op) {
    case 'eq':
      return value === where.value;
    case 'in':
      return (where.value as unknown[]).map(String).includes(String(value));
    case 'gte':
      return String(value) >= String(where.value);
    case 'lt':
      return String(value) < String(where.value);
    case 'is_null':
      return value === null;
    default:
      throw new Error(`the fake does not judge ${where.op}`);
  }
}

function fakePort(rows: Rows = ROWS, opts: { missing?: string } = {}) {
  const asked: { ref: string; opts: ListOptions }[] = [];
  const port: SnapshotPort = {
    config: async () => ({ side: 'staff', timezone: TZ, timezoneSource: 'operator', currency: 'EUR', refs: {} }),
    async assertRefs(required) {
      if (opts.missing !== undefined) throw new Error(`this database does not match what this app reads — ${opts.missing}`);
      expect(required).toBe(REQUIRED);
    },
    async list<T>(ref: string, o: ListOptions) {
      asked.push({ ref, opts: o });
      let found = [...(rows[ref] ?? [])];
      if (o.where !== undefined) found = found.filter((row) => matches(row, o.where!));
      if (o.order !== undefined) {
        const [column, dir] = o.order.split('.') as [string, string];
        found.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (dir === 'desc' ? -1 : 1));
      }
      return { data: found.slice(o.offset, o.offset + o.limit) as T[] };
    },
  };
  return { port, asked };
}

const load = async (rows?: Rows) => {
  const { port, asked } = fakePort(rows);
  const snap = await loadSnapshot(port);
  expect(snap, String(snapshotFailure())).not.toBeNull();
  return { snap: snap!, asked };
};

describe('a load that cannot finish', () => {
  it('builds no client when either variable is absent', () => {
    expect(createPublicClient({ baseUrl: 'https://x.test', publishableKey: '' })).toBeNull();
    expect(createPublicClient({ baseUrl: '', publishableKey: 'adm_pub_x' })).toBeNull();
    expect(createPublicClient(undefined)).toBeNull();
  });

  it('returns null and keeps the reason when the database does not match', async () => {
    expect(await loadSnapshot(fakePort(ROWS, { missing: 'tickets: missing kitchen_status' }).port)).toBeNull();
    expect(snapshotFailure()?.message).toMatch(/kitchen_status/);
  });

  it('forgets an old failure once a load succeeds', async () => {
    await loadSnapshot(fakePort(ROWS, { missing: 'x' }).port);
    await load();
    expect(snapshotFailure()).toBeNull();
  });
});

describe('what the till asks for', () => {
  it('reads only the tickets still open or at the kitchen, and only their lines', async () => {
    const { snap, asked } = await load();
    expect(asked.find((a) => a.ref === 'tickets')!.opts.where).toEqual({ column: 'status', op: 'in', value: ['open', 'sent'] });
    expect(asked.find((a) => a.ref === 'ticketItems')!.opts.where).toEqual({ column: 'ticket_id', op: 'in', value: [51, 52] });
    // The paid ticket is history, not the till's business at boot.
    expect([snap.openTicket, ...snap.held].map((t) => t.number).sort()).toEqual([1041, 1042]);
  });

  it('asks for a large set of lines 200 tickets at a time', async () => {
    const tickets = Array.from({ length: 250 }, (_, i) => ({ ...ROWS['tickets']![0]!, id: 1000 + i, number: String(1000 + i), held: true }));
    const { asked } = await load({ ...ROWS, tickets });
    const lineReads = asked.filter((a) => a.ref === 'ticketItems');
    expect(lineReads.map((a) => ((a.opts.where as { value: unknown[] }).value).length)).toEqual([200, 50]);
  });

  it('counts the day from the venue’s midnight, and books to `days_ahead`', async () => {
    const { snap, asked } = await load();
    const paid = asked.find((a) => a.ref === 'payments' && (a.opts.where as { column: string }).column === 'paid_at')!;
    expect((paid.opts.where as { op: string }).op).toBe('gte');
    expect(snap.shift.gross).toBeCloseTo(8.5);
    expect(snap.reservations.map((r) => r.code)).toEqual(['MR-4829']);
    const window = asked.find((a) => a.ref === 'reservations')!.opts.where as { and: { value: string }[] };
    // Today plus the two days the rules allow booking ahead.
    expect(Date.parse(window.and[1]!.value) - Date.parse(window.and[0]!.value)).toBe(3 * 86_400_000);
  });
});

describe('what comes from the rows', () => {
  it('prices and names the venue from its own settings', async () => {
    const { snap } = await load();
    const connected = snapshotSource(snap);
    expect(connected.brand()).toBe('Daybreak Coffee');
    expect(connected.taxRate()).toBeCloseTo(0.0825);
    expect(connected.tipPresets()).toEqual([0, 0.1, 0.15, 0.2]);
    expect(connected.bookingRules()).toMatchObject({ opens: '17:00', daysAhead: 2, occasions: ['birthday', 'date'] });
  });

  it('prints the venue’s own address, phone and footer on its receipts', async () => {
    const { snap } = await load();
    expect(snapshotSource(snap).venue()).toEqual({ name: 'Daybreak Coffee', address: '128 Alder Lane', phone: '(415) 555-0148', footer: 'See you soon' });
  });

  it('charges no tax and names no brand when the venue has no settings row', async () => {
    const { snap } = await load({ ...ROWS, settings: [] });
    const connected = snapshotSource(snap);
    expect(connected.taxRate()).toBe(0);
    expect(connected.brand()).toBe('');
  });

  it('opens the till for the signed-in person, as their staff row when their e-mail has one', async () => {
    const { snap } = await load();
    const session = { id: 'session', name: 'Sam', initials: 'S', role: '', pin: '' };
    expect(snapshotSource(snap, session, 'SAM@daybreak.test').staff()).toEqual([
      { id: '3', name: 'Sam Rivera', initials: 'SR', role: 'Barista', pin: '', email: 'sam@daybreak.test' },
    ]);
    // No staff row carries this address: the session person, recorded against no row.
    expect(snapshotSource(snap, session, 'else@daybreak.test').staff()).toEqual([session]);
    // Nobody signed in opens nothing; and nobody opens it through the pad.
    expect(snapshotSource(snap).staff()).toEqual([]);
    expect(snap.staff.every((s) => s.pin === '')).toBe(true);
    expect(snap.staff.map((s) => s.initials)).toEqual(['SR', 'AC']);
  });

  it('reads menu v1: sections in order, items in them, and each item’s options', async () => {
    const { snap } = await load();
    expect(snap.categories.map((c) => c.slug)).toEqual(['coffee', 'bakery']);
    expect(snap.menu.map((m) => [m.id, m.cat, m.price, m.available])).toEqual([
      ['11', 'coffee', 4.5, true],
      ['12', 'bakery', 3.8, false],
    ]);
    expect(snapshotSource(snap).modifierGroups()).toEqual([
      {
        id: '21', itemId: '11', slug: 'milk', name: 'Milk', kind: 'radio', min: 1, max: 1,
        options: [
          { id: '31', slug: 'whole', name: 'Whole milk', delta: 0, available: true },
          { id: '32', slug: 'oat', name: 'Oat milk', delta: 0.6, available: true },
        ],
      },
    ]);
    expect(snap.favourites).toEqual(['11']);
  });

  it('keys an operator’s own category and option, which have no slug, by their id', async () => {
    const { snap } = await load({
      ...ROWS,
      menuCategories: [...ROWS.menuCategories!, { id: 3, slug: null, name: 'Juices', position: 3, icon: null, tint: null }],
      menuItems: [...ROWS.menuItems!, { id: 13, category_id: 3, slug: null, name: 'Orange', price: '3.00', image: null, available: true, featured: 0, position: 3 }],
      modifiers: [...ROWS.modifiers!, { id: 33, group_id: 21, slug: null, name: 'Soy milk', price_delta: '0.50', available: true, position: 2 }],
    });
    expect(snap.categories.map((c) => c.slug)).toEqual(['coffee', 'bakery', 'id-3']);
    expect(snap.menu.find((m) => m.id === '13')?.cat).toBe('id-3');
    expect(snapshotSource(snap).modifierGroups()[0]?.options.map((o) => o.slug)).toEqual(['whole', 'oat', 'id-33']);
  });

  it('puts the newest ticket not on hold on the till, with its payments so far, and holds the rest', async () => {
    const { snap } = await load();
    expect(snap.openTicket).toMatchObject({ number: 1042, rid: '51', table: 'W2', seats: 2 });
    // The voided line is on the record, not on the till.
    expect(snap.openTicket.items.map((i) => [i.rid, i.qty, i.note, i.sent])).toEqual([['61', 2, 'Extra hot', false]]);
    expect(snap.openSplits).toEqual([{ method: 'cash', amount: 4 }]);
    expect(snap.held.map((h) => [h.number, h.rid, h.table])).toEqual([[1041, '52', 'P1']]);
  });

  it('marks a table taken when a live ticket sits on it, and keeps the table’s key', async () => {
    const { snap } = await load();
    expect(snap.tables.map((t) => [t.id, t.label, t.status])).toEqual([
      ['41', 'W2', 'occupied'],
      ['42', 'P1', 'occupied'],
    ]);
  });

  it('shows the kitchen what it is making, at the stage it is at', async () => {
    const { snap } = await load();
    expect(snap.kitchen).toEqual([
      expect.objectContaining({ number: 1041, rid: '52', table: 'P1', status: 'cooking', items: [{ n: 'Croissant', q: 1, m: '' }] }),
    ]);
  });

  it('totals the open shift from its own payments, tips and refunds', async () => {
    const { snap } = await load();
    expect(snap.shiftId).toBe('81');
    expect(snap.shift).toMatchObject({ orders: 2, card: 5, cash: 4, tips: 0.5, refunds: 1.2 });
  });

  it('keeps the cash refunds apart, for the drawer count, and the open shift’s float', async () => {
    const { snap } = await load();
    expect(snap.shift.cashRefunds).toBe(1.2);
    expect(snap.openingFloat).toBe(150);
  });

  it('lists every active staff member, and who of them is clocked in now', async () => {
    const { snap, asked } = await load();
    const source$ = snapshotSource(snap);
    expect(source$.roster().map((p) => [p.id, p.name, p.email])).toEqual([
      ['3', 'Sam Rivera', 'sam@daybreak.test'],
      ['4', 'Alex Chen', null],
    ]);
    // Only the open rows are read, and a deactivated person's is left off.
    expect(asked.find((a) => a.ref === 'timeClock')?.opts.where).toEqual({ column: 'clock_out', op: 'is_null' });
    expect(source$.timeClock()).toEqual([{ staffId: '3', rid: '101', since: Date.parse(at('06:55')) }]);
  });

  it('hands back the same shapes demoSource does', async () => {
    const connected = snapshotSource((await load()).snap);
    for (const key of Object.keys(demoSource) as (keyof typeof demoSource)[]) {
      expect(typeof connected[key], key).toBe('function');
    }
    connected.openTicket().items.push({ ...connected.openTicket().items[0]! });
    expect(connected.openTicket().items).toHaveLength(1);
  });
});

describe('closed sales, read when Refund asks', () => {
  const history$ = () => {
    const { port, asked } = fakePort();
    const names: Record<string, string> = { '32': 'Oat milk' };
    return { asked, history: portHistory(port, { timeZone: TZ, optionName: (id) => names[id] ?? null, tableLabel: (id) => (id === '42' ? 'P1' : null) }) };
  };

  it('lists today’s paid tickets with their lines, options, method and what was given back', async () => {
    const { history, asked } = history$();
    const today$ = await history.today();
    expect(today$).toEqual([
      {
        rid: '53',
        number: 1040,
        table: null,
        closedAt: Date.parse(at('08:35')),
        method: 'card',
        lines: [{ rid: '64', name: 'Flat White', qty: 1, unit: 4.5, line: 4.5, mod: 'Oat milk', refunded: 1 }],
        subtotal: 4.5,
        discount: 0,
        tax: 0.37,
        total: 4.87,
        refunded: 1.2,
      },
    ]);
    // From the venue's midnight, paid only.
    expect(asked[0]!.opts.where).toMatchObject({ and: [{ column: 'status', op: 'eq', value: 'paid' }, { column: 'closed_at', op: 'gte' }] });
  });

  it('finds an older sale by its number, however the cashier types it, and works out its discount', async () => {
    const { history } = history$();
    const found = await history.find('990');
    expect(found.map((x) => [x.number, x.table, x.method, x.discount])).toEqual([[990, 'P1', 'qr', 1]]);
    expect(await history.find('#990')).toHaveLength(1);
    expect(await history.find('abc')).toEqual([]);
  });
});

describe('the seam', () => {
  it('reports demo mode until a real source is installed', () => {
    expect(isConnected()).toBe(false);
  });

  it('refuses a swap that arrives after the till has read', () => {
    // `state/calc.ts` reads the menu and the tax rate at module scope, so a
    // static `import App` would evaluate it before any fetch could resolve and
    // price a real shop's sales with the demo's rates.
    source.menu();
    expect(() => setDataSource(demoSource)).toThrow(/after the till already read/);
  });
});
