// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A `DataSource` backed by a real Adminium instance (28-public-surface.md §5.2,
 * 28-T28 — the last app in the fleet, and §5.3 files it last for a reason).
 *
 * ── READ THIS BEFORE POINTING A BUILD AT A TILL ────────────────────────────
 * WS-I G-1. THERE IS NO STAFF TABLE AND THERE IS NO PIN COLUMN. `shifts.staff` is a
 * text name and nothing more. So connected mode returns an EMPTY ROSTER and the
 * till cannot be signed into at all.
 *
 * That is deliberate and it is the only safe answer. The alternative is to
 * derive a roster from `shifts.staff` and hand every one of them a blank PIN —
 * which is a till anybody can open, on a device that sits on a counter. A
 * connected build that refuses to open is a visible, fixable problem; one that
 * opens for anyone is a loss nobody notices until the drawer is short. This app
 * needs a `staff` table with a credential before it can be connected, and that
 * is 28-T36's first item for this repo.
 *
 * The HOSTED staff build is the one exception, and it is not a relaxation. It
 * runs on Adminium's own origin behind the operator's session, so the roster
 * is the one person that session names (`sessionOperator.ts`) — with an empty
 * PIN the pad can never match. The credential is the Adminium sign-in, which
 * already governs every row this till reads.
 *
 * WS-I G-2. THE MODIFIER CATALOGUE HAS NO SCHEMA EITHER — this is §5.3's "pricing has
 * no schema" and it is open decision O6. Sizes, milk surcharges and extras are
 * arrays in `demo.ts`; `ticket_items` has a `notes` column and no modifier
 * rows. So connected mode offers NO sizes, NO milks and NO extras, and the
 * modifier sheet is empty. Carrying the demo's would charge 60c for oat milk in
 * a shop that never set that price.
 *
 * WS-I G-3. And the tax rate is ZERO for the same reason it is zero in
 * online-ordering: there is no column, and the wrong number here is money.
 *
 * ── WHAT DOES WORK ─────────────────────────────────────────────────────────
 * The menu, the floor plan, open and sent tickets, the kitchen display and the
 * shift's takings all come from real rows. They are enough to prove the seam
 * and not enough to run a business, which is the honest state of this repo.
 *
 * ── READS DO NOT BECOME ASYNC ──────────────────────────────────────────────
 * `loadSnapshot` fetches the read-set once, before React mounts, and hands back
 * the same SYNCHRONOUS shapes `demoSource` returns.
 *
 * ── ONE MAPPING, TWO TRANSPORTS ────────────────────────────────────────────
 * `loadSnapshot` takes a `SnapshotPort`, not a `PublicClient`: a standalone
 * build drives it with the public client and a publishable key, a hosted staff
 * build with `sessionSource.ts` and the operator's session. Forking the mapping
 * per transport would be two copies of every rule below.
 */

import {
  createPublicClient,
  toTenantDay,
  type PublicClient,
} from '@adminiumjs/public-client';

import type {
  Category,
  Extra,
  HeldTicket,
  KdsOrder,
  KdsStatus,
  LineItem,
  MenuItem,
  ShiftTotals,
  Size,
  Staff,
  TableInfo,
  Ticket,
} from './types';
import type { SnapshotPort } from './snapshotPort';
import type { DataSource } from './source';

/* --------------------------------------------------------------- the wire */

interface WireMenuItem {
  id: number;
  name: string;
  /** `numeric` serializes as a STRING, not a number. */
  price: string;
  category: string;
  image_url: string | null;
  available: boolean;
}

interface WireTable {
  id: number;
  label: string;
  seats: number;
  zone: string;
}

interface WireTicket {
  id: number;
  number: string;
  table_id: number | null;
  status: string;
  total: string;
  opened_at: string;
  closed_at: string | null;
}

interface WireTicketItem {
  id: number;
  ticket_id: number;
  menu_item_id: number | null;
  qty: number;
  unit_price: string;
  notes: string | null;
}

interface WirePayment {
  ticket_id: number;
  method: 'cash' | 'card' | 'qr';
  amount: string;
  paid_at: string;
}

interface WireShift {
  staff: string;
  started_at: string;
  ended_at: string | null;
}

/**
 * The columns the backend must expose, checked at boot.
 *
 * Exported because `refCoverage.test.ts` holds `tableOfRef.ts` to exactly this
 * set: the hosted transport reads each ref from a table, and a ref with no
 * mapping would throw on the first load in production with every suite green.
 */
export const REQUIRED = {
  menuItems: ['id', 'name', 'price', 'category', 'image_url', 'available'],
  restaurantTables: ['id', 'label', 'seats', 'zone'],
  tickets: ['id', 'number', 'table_id', 'status', 'total', 'opened_at', 'closed_at'],
  ticketItems: ['id', 'ticket_id', 'menu_item_id', 'qty', 'unit_price', 'notes'],
  payments: ['ticket_id', 'method', 'amount', 'paid_at'],
  shifts: ['staff', 'started_at', 'ended_at'],
};

/** A ticket the kitchen is working: sent, not yet paid or voided. */
const KITCHEN = 'sent';

let lastSnapshotError: Error | null = null;

/** Why the last {@link loadSnapshot} returned null, or null if it did not. */
export function snapshotFailure(): Error | null {
  return lastSnapshotError;
}

export interface Snapshot {
  /** The tenant's ISO-4217 code, or null (28-T34). Drives every money figure. */
  currency: string | null;
  /** The zone "today" was computed in, and the receipt's clock renders in. */
  timezone: string;
  /**
   * Who chose {@link timezone}. Carried so the top bar can SAY which zone the
   * clock is in when nobody confirmed it — an unconfirmed zone and a UTC
   * substitute are otherwise silent (a console line is not an operator surface).
   */
  timezoneSource: 'operator' | 'host' | 'fallback' | null;
  menu: MenuItem[];
  categories: Category[];
  tables: TableInfo[];
  shift: ShiftTotals;
  shiftStart: number;
  zones: string[];
  favourites: string[];
  openTicket: Ticket;
  held: HeldTicket[];
  kitchen: KdsOrder[];
}

/**
 * The client, or null when either build-time variable is absent.
 *
 * The emptiness check is `createPublicClient`'s, not repeated here: it already
 * treats a missing or empty value as 'this build has no server', and a second
 * copy of that rule is a second place for it to drift.
 */
export function clientFromEnv(): PublicClient | null {
  /* DOT access, never brackets. `vite.config.ts` defines these by expression
     text, so a bracketed read of the env object is never substituted and
     survives into the bundle as a runtime lookup — `surfaceBuild.test.ts`
     refuses one anywhere under src/, comments included. */
  return createPublicClient({
    baseUrl: import.meta.env.VITE_ADMINIUM_API_BASE_URL,
    publishableKey: import.meta.env.VITE_ADMINIUM_PUBLISHABLE_KEY,
  });
}

/** Read a whole ref, a page at a time, at whatever size the backend permits. */
async function listAll<T>(
  client: SnapshotPort,
  ref: string,
  size: number,
  max: number,
): Promise<T[]> {
  const out: T[] = [];
  const page = Math.max(1, Math.min(size, 500));
  for (let offset = 0; offset < max; offset += page) {
    const res = await client.list<T>(ref, { limit: page, offset });
    out.push(...res.data);
    if (res.data.length < page) return out;
  }
  console.warn(`[adminium] ${ref}: stopped at ${String(max)} rows — the rest were not read.`);
  return out;
}

/**
 * Fetch the read-set and map it into the app's shapes.
 *
 * Returns `null` on ANY failure, with the reason kept for `snapshotFailure()`.
 * A non-demo build HARD-STOPS on null (`main.tsx`) — it never falls back to the
 * seed, because a till full of invented tickets for a real shop is the failure
 * the build-time split exists to remove.
 */
export async function loadSnapshot(client: SnapshotPort): Promise<Snapshot | null> {
  lastSnapshotError = null;
  try {
    await client.assertRefs(REQUIRED);
    const config = await client.config();
    const tz = config.timezone;
    /* The per-ref page ceiling. A scope sets it; the session transport has none
     * of its own and pages at its route's cap, so `?? 100` is only a start. */
    const cap = (ref: string): number => config.refs[ref]?.limit ?? 100;

    const [menu, tables, tickets, items, payments, shifts] = await Promise.all([
      listAll<WireMenuItem>(client, 'menuItems', cap('menuItems'), 10_000),
      listAll<WireTable>(client, 'restaurantTables', cap('restaurantTables'), 1_000),
      listAll<WireTicket>(client, 'tickets', cap('tickets'), 100_000),
      listAll<WireTicketItem>(client, 'ticketItems', cap('ticketItems'), 200_000),
      listAll<WirePayment>(client, 'payments', cap('payments'), 200_000),
      listAll<WireShift>(client, 'shifts', cap('shifts'), 10_000),
    ]);

    const todayISO = toTenantDay(new Date().toISOString(), tz);

    /* --- the menu, and the categories it implies ------------------------ */

    const nameOf = new Map<number, string>(menu.map((row) => [row.id, row.name]));
    const mappedMenu: MenuItem[] = menu.map((row) => ({
      id: String(row.id),
      name: row.name,
      price: Number(row.price),
      cat: row.category,
      /* No icon column. One neutral glyph beats a per-row guess that is wrong
       * for most of the menu. */
      icon: 'utensils',
      image: row.image_url ?? '',
      /* G-2: a modifier SCHEME selects which sheet opens, and there is no
       * catalogue behind any of them. `null` is "this item takes no
       * modifiers", which is the truth about a connected build. */
      mods: null,
      available: row.available,
    }));

    /* `menu_items.category` is free text and there is no categories table, so
     * the sections are whatever the menu says they are, in first-seen order. */
    const seen: string[] = [];
    for (const row of menu) if (!seen.includes(row.category)) seen.push(row.category);
    const categories: Category[] = seen.map((slug) => ({
      slug,
      name: slug,
      icon: 'utensils',
      tint: null,
    }));

    /* --- tickets ------------------------------------------------------- */

    const itemsByTicket = new Map<number, WireTicketItem[]>();
    for (const row of items) {
      const list = itemsByTicket.get(row.ticket_id) ?? [];
      list.push(row);
      itemsByTicket.set(row.ticket_id, list);
    }
    const labelOf = new Map<number, string>(tables.map((t) => [t.id, t.label]));

    const linesOf = (ticket: WireTicket): LineItem[] =>
      (itemsByTicket.get(ticket.id) ?? []).map((row) => ({
        key: `${String(row.id)}`,
        id: row.menu_item_id === null ? '' : String(row.menu_item_id),
        qty: row.qty,
        // WS-I G-2: no size, milk or extras columns anywhere.
        size: null,
        milk: null,
        extras: [],
        note: row.notes ?? '',
        /* No seat column: this schema records what was ordered and not who at
         * the table ordered it, so every line sits on seat one. */
        seat: 1,
        sent: ticket.status !== 'open',
      }));

    const numberOf = (value: string): number => {
      const match = /(\d+)/.exec(value);
      return match === null ? 0 : Number(match[1]);
    };

    const live = tickets
      .filter((row) => row.status === 'open' || row.status === KITCHEN)
      .sort((a, b) => b.opened_at.localeCompare(a.opened_at));

    const first = live[0];
    const openTicket: Ticket = first === undefined
      ? { number: 0, table: null, seats: 0, openedAt: Date.parse(`${todayISO}T00:00:00Z`), items: [] }
      : {
          number: numberOf(first.number),
          table: first.table_id === null ? null : labelOf.get(first.table_id) ?? null,
          seats: first.table_id === null ? 0 : tables.find((t) => t.id === first.table_id)?.seats ?? 0,
          openedAt: Date.parse(first.opened_at),
          items: linesOf(first),
        };

    const held: HeldTicket[] = live.slice(1).map((row) => ({
      number: numberOf(row.number),
      table: row.table_id === null ? null : labelOf.get(row.table_id) ?? null,
      at: Date.parse(row.opened_at),
      seats: row.table_id === null ? 0 : tables.find((t) => t.id === row.table_id)?.seats ?? 0,
      items: linesOf(row),
    }));

    /* --- the floor ------------------------------------------------------ */

    const busy = new Map<number, WireTicket>();
    for (const row of live) if (row.table_id !== null) busy.set(row.table_id, row);

    const mappedTables: TableInfo[] = tables.map((row) => {
      const ticket = busy.get(row.id);
      const info: TableInfo = {
        zone: row.zone,
        label: row.label,
        seats: row.seats,
        /* `attention` has no rule in this schema — nothing records a table that
         * has been waiting — so a table is occupied or it is free. */
        status: ticket === undefined ? 'open' : 'occupied',
      };
      if (ticket !== undefined) {
        info.total = Number(ticket.total);
        info.since = Date.parse(ticket.opened_at);
      }
      return info;
    });

    const zones: string[] = [];
    for (const row of tables) if (!zones.includes(row.zone)) zones.push(row.zone);

    /* --- the kitchen display -------------------------------------------- */

    const kitchen: KdsOrder[] = tickets
      .filter((row) => row.status === KITCHEN)
      .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
      .map((row) => ({
        number: numberOf(row.number),
        table: row.table_id === null ? null : labelOf.get(row.table_id) ?? null,
        at: Date.parse(row.opened_at),
        /* `tickets.status` has one word for the whole kitchen, so every sent
         * ticket reads as new. A `cooking` / `ready` board needs a column. */
        status: 'new' as KdsStatus,
        items: (itemsByTicket.get(row.id) ?? []).map((item) => ({
          n: item.menu_item_id === null ? '' : nameOf.get(item.menu_item_id) ?? '',
          q: item.qty,
          m: item.notes ?? '',
        })),
      }));

    /* --- the shift ------------------------------------------------------ */

    const openShift = shifts.find((row) => row.ended_at === null) ??
      [...shifts].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    const shiftStart = openShift === undefined
      ? Date.parse(`${todayISO}T00:00:00Z`)
      : Date.parse(openShift.started_at);

    const takings = payments.filter((row) => Date.parse(row.paid_at) >= shiftStart);
    const sum = (method: WirePayment['method']): number =>
      takings.filter((row) => row.method === method).reduce((total, row) => total + Number(row.amount), 0);

    const paidTickets = new Set(takings.map((row) => row.ticket_id));
    const shift: ShiftTotals = {
      orders: paidTickets.size,
      gross: takings.reduce((total, row) => total + Number(row.amount), 0),
      card: sum('card'),
      cash: sum('cash'),
      qr: sum('qr'),
      /* No column records a tip, a refund or a comp. Zero is what this schema
       * can say, and a made-up figure on a shift report is a number somebody
       * would reconcile against a bank statement. */
      tips: 0,
      refunds: 0,
      comps: 0,
    };

    /* The register's first row has no column either, so it is what actually
     * sells — the six most-ordered items on this shift's tickets. */
    const sold = new Map<string, number>();
    for (const row of items) {
      if (row.menu_item_id === null) continue;
      const id = String(row.menu_item_id);
      sold.set(id, (sold.get(id) ?? 0) + row.qty);
    }
    const favourites = [...mappedMenu]
      .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0))
      .slice(0, 6)
      .map((row) => row.id);

    return {
      currency: config.currency,
      timezone: tz,
      timezoneSource: config.timezoneSource ?? null,
      menu: mappedMenu,
      categories,
      tables: mappedTables,
      shift,
      shiftStart,
      zones,
      favourites,
      openTicket,
      held,
      kitchen,
    };
  } catch (error) {
    /* The reason is KEPT, not swallowed. This used to log "using demo data",
     * which stopped being true when a non-demo build began to hard-stop — the
     * failure screen would have said something generic while the real cause sat
     * in the console. */
    lastSnapshotError = error instanceof Error ? error : new Error(String(error));
    console.warn('[adminium] could not load a snapshot:', error);
    return null;
  }
}

/**
 * A synchronous `DataSource` over an already-fetched snapshot.
 *
 * `operator` is the person the hosted build's session names, and nobody
 * anywhere else: a standalone build passes nothing and keeps its empty roster.
 */
export function snapshotSource(snap: Snapshot, operator: Staff | null = null): DataSource {
  return {
    // WS-I G-1: no brand column.
    brand: () => '',
    // WS-I G-3: no tax column. A visible zero beats a plausible 8.25% nobody set.
    taxRate: () => 0,
    /* Tip presets are BUTTONS a cashier taps, not a charge this app applies, so
     * the app's own four stay. Nothing is added without somebody pressing it. */
    tipPresets: () => [0, 0.1, 0.15, 0.2],
    // WS-I G-2: the modifier catalogue has no schema. See the header, and O6.
    sizes: (): { v: Size; label: string }[] => [],
    milks: (): { v: string; delta: number }[] => [],
    extras: (): Extra[] => [],
    favourites: () => [...snap.favourites],
    zoneOrder: () => [...snap.zones],
    shiftStart: () => snap.shiftStart,
    /* WS-I G-1: THE TILL CANNOT BE OPENED FROM THIS ROSTER. There is no staff
     * table and no PIN column, and a roster with blank PINs is a till anybody
     * can open. The one entry a hosted build adds is the signed-in operator,
     * whose empty PIN the pad can never match — the session opened the till,
     * not the pad. */
    staff: (): Staff[] => (operator === null ? [] : [{ ...operator }]),
    menu: () => snap.menu.map((row) => ({ ...row })),
    categories: () => snap.categories.map((row) => ({ ...row })),
    tables: () => snap.tables.map((row) => ({ ...row })),
    shift: () => ({ ...snap.shift }),
    openTicket: () => ({ ...snap.openTicket, items: snap.openTicket.items.map((i) => ({ ...i })) }),
    heldTickets: () => snap.held.map((h) => ({ ...h, items: h.items.map((i) => ({ ...i })) })),
    kitchenOrders: () => snap.kitchen.map((k) => ({ ...k, items: k.items.map((i) => ({ ...i })) })),
  };
}
