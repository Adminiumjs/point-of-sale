// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Connected mode (28-public-surface.md §5.2, 28-T28 — the fleet's last app).
 *
 * ── WHY THIS DRIVES A REAL CLIENT ──────────────────────────────────────────
 * `createPublicClient` takes an injectable `fetch`, so these run the SHIPPED
 * client against canned wire responses rather than a hand-written stub of it.
 * `assertRefs`, the config fetch, the paging and the URL building are therefore
 * under test too.
 *
 * ── THE THREE REFUSALS ARE THE POINT OF THIS FILE ──────────────────────────
 * A till with no staff table, no PIN column, no modifier catalogue and no tax
 * rate cannot be run. The tests below pin each refusal so that nobody
 * "helpfully" fills one in with the demo's numbers: an empty roster (a till
 * anybody can open is worse than one nobody can), an empty modifier sheet (O6),
 * and a tax rate of zero (the wrong number here is money).
 */

import { describe, expect, it } from 'vitest';

import { createPublicClient } from '@adminiumjs/public-client';

import { loadSnapshot, snapshotFailure, snapshotSource } from './adminiumSource';
import { demoSource, isConnected, setDataSource, source } from './source';

const REFS = ['menuItems', 'restaurantTables', 'tickets', 'ticketItems', 'payments', 'shifts'];

/** Today in the tenant's zone, so the shift's takings are not date-pinned. */
const TODAY = new Date().toISOString().slice(0, 10);

const ROWS: Record<string, unknown[]> = {
  menuItems: [
    { id: 1, name: 'Flat White', price: '4.20', category: 'Coffee', image_url: 'fw.webp', available: true },
    { id: 2, name: 'Croissant', price: '3.10', category: 'Bakery', image_url: null, available: false },
  ],
  restaurantTables: [
    { id: 10, label: 'W2', seats: 2, zone: 'Window' },
    { id: 11, label: 'P1', seats: 4, zone: 'Patio' },
  ],
  tickets: [
    { id: 20, number: '1042', table_id: 10, status: 'open', total: '11.50', opened_at: `${TODAY}T09:10:00Z`, closed_at: null },
    { id: 21, number: '1041', table_id: 11, status: 'sent', total: '8.40', opened_at: `${TODAY}T09:00:00Z`, closed_at: null },
    { id: 22, number: '1040', table_id: null, status: 'paid', total: '4.20', opened_at: `${TODAY}T08:30:00Z`, closed_at: `${TODAY}T08:35:00Z` },
  ],
  ticketItems: [
    { id: 30, ticket_id: 20, menu_item_id: 1, qty: 2, unit_price: '4.20', notes: 'Oat milk' },
    { id: 31, ticket_id: 21, menu_item_id: 2, qty: 1, unit_price: '3.10', notes: null },
    { id: 32, ticket_id: 22, menu_item_id: 1, qty: 1, unit_price: '4.20', notes: null },
  ],
  payments: [
    { ticket_id: 22, method: 'card', amount: '4.20', paid_at: `${TODAY}T08:35:00Z` },
  ],
  shifts: [
    { staff: 'Ada', started_at: `${TODAY}T07:00:00Z`, ended_at: null },
  ],
};

interface FakeOptions {
  rows?: Record<string, unknown[]>;
  expose?: (ref: string) => string[];
  /** The scope's per-ref page ceiling — the operator's number, not the app's. */
  limit?: number;
}

/** A server that answers exactly what the scope would, paging included. */
function fakeFetch(overrides: FakeOptions = {}) {
  const rows = overrides.rows ?? ROWS;
  const limit = overrides.limit ?? 500;
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

    if (url.pathname.endsWith('/public/config')) {
      const refs: Record<string, unknown> = {};
      for (const ref of REFS) {
        refs[ref] = {
          actions: ['list'],
          expose: overrides.expose?.(ref) ?? Object.keys((rows[ref]?.[0] ?? {}) as object),
          filterable: [], searchable: [], orderable: [], writable: [], limit,
        };
      }
      // `/public/config` is the one route the client unwraps: it reads
      // `body.data`, while `list` reads the body itself.
      return json({
        data: { version: 1, side: 'staff', timezone: 'UTC', currency: 'USD', claim: null, refs },
      });
    }

    const ref = url.pathname.split('/').pop() ?? '';
    const all = rows[ref] ?? [];
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const size = Number(url.searchParams.get('limit') ?? String(all.length));
    return json({ data: all.slice(offset, offset + size) });
  };
}

const clientWith = (fetch: ReturnType<typeof fakeFetch>) =>
  createPublicClient({ baseUrl: 'https://api.example.test', publishableKey: 'adm_pub_test', fetch });

const snapshot = async (overrides: FakeOptions = {}) =>
  loadSnapshot(clientWith(fakeFetch(overrides))!);

describe('a load that cannot finish', () => {
  it('builds no client when either variable is absent', () => {
    expect(createPublicClient({ baseUrl: 'https://x.test', publishableKey: '' })).toBeNull();
    expect(createPublicClient({ baseUrl: '', publishableKey: 'adm_pub_x' })).toBeNull();
    expect(createPublicClient(undefined)).toBeNull();
  });

  /*
   * Null, never a throw — and never the seed. A non-demo build hard-stops on
   * null (`main.tsx`), so what matters is that the REASON survives for the
   * failure screen instead of dying in a console line.
   */
  it('returns null and keeps the reason when the server is unreachable', async () => {
    const client = clientWith(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await loadSnapshot(client!)).toBeNull();
    expect(snapshotFailure()?.message).toMatch(/ECONNREFUSED/);
  });

  it('returns null and names the columns when the scope does not expose them', async () => {
    expect(await snapshot({ expose: () => ['id'] })).toBeNull();
    expect(snapshotFailure()?.message).toMatch(/menuItems\.name/);
  });

  it('forgets an old failure once a load succeeds', async () => {
    expect(await snapshot({ expose: () => ['id'] })).toBeNull();
    expect(await snapshot()).not.toBeNull();
    expect(snapshotFailure()).toBeNull();
  });
});

describe('the three refusals', () => {
  it('opens no till, because there is no staff table and no PIN column', async () => {
    const connected = snapshotSource((await snapshot())!);
    // WS-I G-1. `shifts.staff` is a text name. A roster derived from it would carry
    // blank PINs — a till anybody can open, on a device that sits on a counter.
    // A connected build that refuses to open is visible and fixable; one that
    // opens for anyone is a loss nobody notices until the drawer is short.
    expect(connected.staff()).toEqual([]);
  });

  it('opens a hosted till for the signed-in operator, and for nobody through the pad', async () => {
    // The hosted build's roster is the one person its Adminium session names
    // (sessionOperator.ts). The EMPTY pin is the other half of that: the PIN pad
    // compares four digits against it and can never match.
    const operator = { id: 'session', name: 'Ada Lovelace', initials: 'AL', role: '', pin: '' };
    const hosted = snapshotSource((await snapshot())!, operator);
    expect(hosted.staff()).toEqual([operator]);
    expect(hosted.staff().every((member) => member.pin === '')).toBe(true);
    // A copy each time: a screen that edits the entry cannot rename the session.
    hosted.staff()[0]!.name = 'Somebody Else';
    expect(hosted.staff()[0]!.name).toBe('Ada Lovelace');
  });

  it('offers no size, no milk and no extra, which is O6 in one assertion', async () => {
    const connected = snapshotSource((await snapshot())!);
    // WS-I G-2. §5.3's "pricing has no schema". Carrying the demo's arrays would
    // charge 60c for oat milk in a shop that never set that price.
    expect(connected.sizes()).toEqual([]);
    expect(connected.milks()).toEqual([]);
    expect(connected.extras()).toEqual([]);
    // …and every item therefore takes no modifiers at all.
    expect(connected.menu().every((row) => row.mods === null)).toBe(true);
  });

  it('charges no tax and prints no brand', async () => {
    const connected = snapshotSource((await snapshot())!);
    // WS-I G-3. The wrong number here is money.
    expect(connected.taxRate()).toBe(0);
    expect(connected.brand()).toBe('');
    // Tip presets stay: they are buttons a cashier taps, not a charge this app
    // applies on its own.
    expect(connected.tipPresets()).toEqual([0, 0.1, 0.15, 0.2]);
  });
});

describe('what does come from real rows', () => {
  it('carries the tenant’s currency and zone, which price and clock the till', async () => {
    const snap = await snapshot();
    expect(snap!.currency).toBe('USD');
    expect(snap!.timezone).toBe('UTC');
    // The public API has no provenance for a scope's zone — only the session
    // transport reports one — so this is no claim, not a guess.
    expect(snap!.timezoneSource).toBeNull();
  });

  it('reads the menu and derives its sections from the rows themselves', async () => {
    const snap = await snapshot();
    expect(snap).not.toBeNull();
    // `numeric` arrives as a string and must not reach arithmetic as one.
    expect(snap!.menu[0]).toMatchObject({ id: '1', name: 'Flat White', price: 4.2, cat: 'Coffee' });
    expect(snap!.menu[1]!.available).toBe(false);
    // There is no categories table; `menu_items.category` is free text.
    expect(snap!.categories.map((c) => c.slug)).toEqual(['Coffee', 'Bakery']);
  });

  it('puts the newest live ticket on the till and holds the rest', async () => {
    const snap = await snapshot();
    expect(snap!.openTicket.number).toBe(1042);
    expect(snap!.openTicket.table).toBe('W2');
    expect(snap!.openTicket.seats).toBe(2);
    expect(snap!.openTicket.items[0]).toMatchObject({ id: '1', qty: 2, note: 'Oat milk', sent: false });
    // WS-I G-2 again, from the other side: a modifier that was typed into `notes`
    // survives as a note, because there is nowhere else for it to go.
    expect(snap!.openTicket.items[0]!.milk).toBeNull();
    expect(snap!.held.map((h) => h.number)).toEqual([1041]);
    // A `sent` ticket's lines are sent.
    expect(snap!.held[0]!.items[0]!.sent).toBe(true);
  });

  it('marks a table occupied when a live ticket sits on it', async () => {
    const snap = await snapshot();
    const [window, patio] = snap!.tables;
    expect(window).toMatchObject({ label: 'W2', status: 'occupied', total: 11.5 });
    expect(patio).toMatchObject({ label: 'P1', status: 'occupied', total: 8.4 });
    // Zones come from the rows, in first-seen order — there is no zone table.
    expect(snap!.zones).toEqual(['Window', 'Patio']);
  });

  it('sends every sent ticket to the kitchen, with the names spelled out', async () => {
    const snap = await snapshot();
    expect(snap!.kitchen).toHaveLength(1);
    expect(snap!.kitchen[0]).toMatchObject({ number: 1041, table: 'P1', status: 'new' });
    expect(snap!.kitchen[0]!.items[0]).toEqual({ n: 'Croissant', q: 1, m: '' });
  });

  it('totals the shift from its payments and refuses to invent the rest', async () => {
    const snap = await snapshot();
    expect(snap!.shift).toEqual({
      orders: 1, gross: 4.2, card: 4.2, cash: 0, qr: 0,
      // No column records a tip, a refund or a comp, and a made-up figure on a
      // shift report is a number somebody reconciles against a bank statement.
      tips: 0, refunds: 0, comps: 0,
    });
    expect(snap!.shiftStart).toBe(Date.parse(`${TODAY}T07:00:00Z`));
  });

  it('fills the register’s first row with what actually sells', async () => {
    const snap = await snapshot();
    // There is no "favourite" column; three flat whites beat one croissant.
    expect(snap!.favourites[0]).toBe('1');
  });

  it('reads every page, not just the first the scope allows', async () => {
    const snap = await snapshot({ limit: 1 });
    expect(snap!.menu).toHaveLength(2);
    expect(snap!.tables).toHaveLength(2);
    expect(snap!.openTicket.items).toHaveLength(1);
  });

  it('hands back the same shapes demoSource does', async () => {
    const connected = snapshotSource((await snapshot())!);
    for (const key of Object.keys(demoSource) as (keyof typeof demoSource)[]) {
      expect(typeof connected[key], key).toBe('function');
    }
    connected.openTicket().items.push({ ...connected.openTicket().items[0]! });
    expect(connected.openTicket().items).toHaveLength(1);
  });
});

describe('the seam', () => {
  it('reports demo mode until a real source is installed', () => {
    expect(isConnected()).toBe(false);
  });

  it('refuses a swap that arrives after the till has read', () => {
    // THE SILENT FAILURE THIS PINS. `state/calc.ts` — the pricing engine —
    // reads the menu and the tax rate at module scope, so a static `import App`
    // evaluates it during main.tsx's own imports, before any fetch can resolve.
    // The till would then price a real shop's sales with the demo's rates.
    source.menu();
    expect(() => setDataSource(demoSource)).toThrow(/after the till already read/);
  });
});
