// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Connected mode: the till's read set, read once at boot and mapped into the
 * shapes `demoSource` returns.
 *
 * ── WHAT IT READS (plan §3.2) ──────────────────────────────────────────────
 *
 *   in full    the venue's settings and booking rules, the staff, the menu
 *              (categories, items, their groups and options) and the floor —
 *              all small;
 *   filtered   the tickets still open or at the kitchen, with their lines,
 *              options and payments (`ticket_id in (…)`, 200 at a time);
 *              today's payments and refunds, from the venue's midnight; the
 *              open shift; the bookings from today to `days_ahead`.
 *
 * Nothing else — no whole history. Every "today" is the VENUE's day, in the
 * zone the connection (or the staff config) names.
 *
 * ── READS DO NOT BECOME ASYNC ──────────────────────────────────────────────
 * `loadSnapshot` fetches the set before React mounts and hands back
 * SYNCHRONOUS shapes. What changes afterwards — tickets, the floor, the
 * kitchen, bookings — lives in the store from then on.
 *
 * ── ONE MAPPING, TWO TRANSPORTS ────────────────────────────────────────────
 * `loadSnapshot` takes a `SnapshotPort`: the hosted staff build's session
 * transport, or the public client for a build served elsewhere. Forking the
 * mapping per transport would be two copies of every rule below.
 */

import { appName } from '../i18n/ambient';
import { createPublicClient, toTenantDay, type PublicClient } from '@adminiumjs/public-client';

import type {
  BookingRules,
  Category,
  ClockEntry,
  HeldTicket,
  KdsOrder,
  KdsStatus,
  LineItem,
  MenuItem,
  ModifierGroup,
  PickupOrder,
  PickupStage,
  Reservation,
  ReservationStatus,
  Selection,
  ShiftTotals,
  Split,
  Staff,
  TableInfo,
  Ticket,
} from './types';
import type { ListCondition, SnapshotPort } from './snapshotPort';
import type { DataSource } from './source';
import { instant, venueMidnight } from './venueTime';
import { listAll, listIn } from './listing';

/* --------------------------------------------------------------- the wire */

/** `numeric` serializes as a STRING; a key may arrive as either. */
type Num = number | string;
type Key = number | string;

interface WireSettings {
  id: Key;
  venue_name: string | null;
  venue_mark: string | null;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  tax_rate_bp: Num;
  tip_presets: unknown;
}
interface WireRules {
  opens: string;
  closes: string;
  slot_minutes: Num;
  covers_per_slot: Num;
  days_ahead: Num;
  max_party: Num;
  hold_minutes: Num;
  cancel_hours: Num;
  occasions: unknown;
}
interface WireStaff {
  id: Key;
  name: string;
  initials: string | null;
  role: string | null;
  email: string | null;
  active: boolean | number;
}
interface WireCategory {
  id: Key;
  slug: string | null;
  name: string;
  position: Num;
  icon: string | null;
  tint: string | null;
}
interface WireMenuItem {
  id: Key;
  category_id: Key | null;
  slug: string | null;
  name: string;
  price: Num;
  image: string | null;
  available: boolean | number;
  featured: boolean | number;
  position: Num;
  barcode: string | null;
}
interface WireGroup {
  id: Key;
  item_id: Key;
  slug: string | null;
  name: string;
  kind: 'radio' | 'check';
  min: Num;
  max: Num;
  position: Num;
}
interface WireOption {
  id: Key;
  group_id: Key;
  slug: string | null;
  name: string;
  price_delta: Num;
  available: boolean | number;
  position: Num;
}
interface WireTable {
  id: Key;
  label: string;
  seats: Num;
  zone: string | null;
  position: Num;
}
interface WireTicket {
  id: Key;
  number: string | null;
  table_id: Key | null;
  status: string;
  kitchen_status: string;
  held: boolean | number;
  guests: Num;
  total: Num;
  opened_at: string;
  sent_at: string | null;
  closed_at: string | null;
  /** The loyalty member it is for (wave 2). */
  customer_id: Key | null;
  /** Pickup (wave 2): how it came in, and where it is. */
  channel: PickupOrder['channel'] | null;
  pickup_stage: PickupStage | null;
  ready_at: string | null;
  notified_at: string | null;
}
interface WireTicketItem {
  id: Key;
  ticket_id: Key;
  menu_item_id: Key | null;
  name: string;
  qty: Num;
  unit_price: Num;
  seat: Num;
  notes: string | null;
  sent_at: string | null;
  voided_at: string | null;
  /** A reward a member's points paid for (wave 2): the line is free. */
  reward_id: Key | null;
  /** The gift card this line puts money on (wave 2). */
  gift_card_id: Key | null;
}
interface WirePayment {
  id: Key;
  ticket_id: Key;
  method: 'cash' | 'card' | 'qr' | 'gift_card';
  /** A gift card's code, when one paid. */
  reference: string | null;
  amount: Num;
  tip: Num | null;
  paid_at: string;
}
interface WireRefund {
  id: Key;
  ticket_id: Key;
  method: 'cash' | 'card' | 'qr' | 'gift_card';
  amount: Num;
  tax: Num;
  refunded_at: string;
}
interface WireShift {
  id: Key;
  started_at: string;
  ended_at: string | null;
  opening_float: Num;
}
interface WireClock {
  id: Key;
  staff_id: Key;
  clock_in: string;
  clock_out: string | null;
}
interface WireReservation {
  id: Key;
  code: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  party_size: Num;
  starts_at: string;
  status: ReservationStatus;
  channel: Reservation['channel'];
  table_id: Key | null;
  occasion: string | null;
  guest_request: string | null;
  staff_note: string | null;
}

/**
 * The columns the backend must expose, checked at boot.
 *
 * Exported because `refCoverage.test.ts` holds `tableOfRef.ts` to exactly this
 * set, and `schema-contract.test.ts` holds it to what the manifest installs.
 */
export const REQUIRED = {
  settings: ['id', 'venue_name', 'venue_mark', 'address', 'phone', 'tax_rate_bp', 'tip_presets', 'receipt_footer'],
  bookingRules: ['id', 'opens', 'closes', 'slot_minutes', 'covers_per_slot', 'days_ahead', 'max_party', 'hold_minutes', 'cancel_hours', 'occasions'],
  staff: ['id', 'name', 'initials', 'role', 'email', 'active'],
  menuCategories: ['id', 'slug', 'name', 'position', 'icon', 'tint'],
  menuItems: ['id', 'category_id', 'slug', 'name', 'price', 'image', 'available', 'featured', 'position', 'barcode'],
  modifierGroups: ['id', 'item_id', 'slug', 'name', 'kind', 'min', 'max', 'position'],
  modifiers: ['id', 'group_id', 'slug', 'name', 'price_delta', 'available', 'position'],
  restaurantTables: ['id', 'label', 'seats', 'zone', 'position'],
  tickets: ['id', 'number', 'table_id', 'status', 'kitchen_status', 'held', 'guests', 'subtotal', 'tax', 'total', 'opened_at', 'sent_at', 'closed_at', 'customer_id', 'channel', 'pickup_code', 'pickup_stage', 'ready_at', 'notified_at'],
  ticketItems: ['id', 'ticket_id', 'menu_item_id', 'name', 'qty', 'unit_price', 'seat', 'notes', 'sent_at', 'voided_at', 'reward_id', 'gift_card_id'],
  ticketItemModifiers: ['id', 'ticket_item_id', 'modifier_id', 'price_delta'],
  payments: ['id', 'ticket_id', 'method', 'amount', 'tip', 'reference', 'paid_at'],
  refunds: ['id', 'ticket_id', 'method', 'amount', 'tax', 'refunded_at'],
  refundItems: ['id', 'refund_id', 'ticket_item_id', 'qty'],
  shifts: ['id', 'started_at', 'ended_at', 'opening_float'],
  timeClock: ['id', 'staff_id', 'clock_in', 'clock_out'],
  reservations: ['id', 'code', 'name', 'mobile', 'email', 'party_size', 'starts_at', 'status', 'channel', 'table_id', 'occasion', 'guest_request', 'staff_note'],
  // Wave 2: loyalty. Read on demand (`loyalty.ts`), checked here so a database without them says so at boot.
  customers: ['id', 'member_no', 'name', 'mobile', 'email', 'joined_at', 'points', 'lifetime_points', 'visits'],
  rewards: ['id', 'name', 'points', 'menu_item_id', 'icon', 'active', 'position'],
  loyaltyLedger: ['id', 'customer_id', 'kind', 'points', 'visit', 'reward_id', 'ticket_id', 'note', 'staff_id', 'at'],
  // Wave 2: gift cards, read on demand (`giftCards.ts`).
  giftCards: ['id', 'code', 'status', 'balance', 'issued_at'],
  giftCardLedger: ['id', 'card_id', 'kind', 'amount', 'ticket_id', 'staff_id', 'at'],
};

let lastSnapshotError: Error | null = null;

/** Why the last {@link loadSnapshot} returned null, or null if it did not. */
export function snapshotFailure(): Error | null {
  return lastSnapshotError;
}

export interface Snapshot {
  /** The tenant's ISO-4217 code, or null. Drives every money figure. */
  currency: string | null;
  /** The venue's zone: where "today" starts and the receipt's clock. */
  timezone: string;
  timezoneSource: 'operator' | 'host' | 'fallback' | null;
  brand: string | null;
  /** The venue's address, phone and receipt footer. */
  venue: { address: string | null; phone: string | null; footer: string | null };
  taxRate: number | null;
  tipPresets: number[] | null;
  rules: BookingRules | null;
  staff: Staff[];
  /** Who is clocked in now. */
  clock: ClockEntry[];
  /** The open shift's opening float. */
  openingFloat: number;
  /** The staff rows by e-mail, lowercased — who a signed-in person is at this till. */
  staffByEmail: Record<string, Staff>;
  menu: MenuItem[];
  categories: Category[];
  groups: ModifierGroup[];
  tables: TableInfo[];
  zones: string[];
  favourites: string[];
  shift: ShiftTotals;
  shiftStart: number;
  shiftId: string | null;
  openTicket: Ticket;
  /** What has already been paid on the open ticket: a part-paid ticket stays part-paid. */
  openSplits: Split[];
  held: HeldTicket[];
  kitchen: KdsOrder[];
  reservations: Reservation[];
  /** Orders waiting to be collected, whether paid yet or not (wave 2). */
  pickups: PickupOrder[];
}

/**
 * The client, or null when either build-time variable is absent.
 *
 * The emptiness check is `createPublicClient`'s, not repeated here.
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

const num = (value: Num | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));
const yes = (value: boolean | number | null | undefined): boolean => value === true || value === 1;
const key = (value: Key): string => String(value);
const byPosition = <T extends { position: Num }>(a: T, b: T) => num(a.position) - num(b.position);
const list = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * Fetch the read set and map it into the app's shapes.
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
    const cap = (ref: string): number => config.refs[ref]?.limit ?? 100;
    const all = <T>(ref: string, order?: string) =>
      listAll<T>(client, ref, { size: cap(ref), max: 10_000, ...(order === undefined ? {} : { order }) });

    const todayISO = toTenantDay(new Date().toISOString(), tz);
    const midnight = venueMidnight(todayISO, tz);

    const [settingsRows, rulesRows, staffRows, categories, items, groups, options, tables] = await Promise.all([
      all<WireSettings>('settings'),
      all<WireRules>('bookingRules'),
      all<WireStaff>('staff'),
      all<WireCategory>('menuCategories'),
      all<WireMenuItem>('menuItems'),
      all<WireGroup>('modifierGroups'),
      all<WireOption>('modifiers'),
      all<WireTable>('restaurantTables'),
    ]);
    const settings = settingsRows[0];
    const rulesRow = rulesRows[0];
    const daysAhead = rulesRow === undefined ? 0 : num(rulesRow.days_ahead);
    const until = new Date(Date.parse(midnight) + (daysAhead + 1) * 86_400_000).toISOString();

    const [live, todaysPayments, refunds, shifts, bookings, clockRows] = await Promise.all([
      listAll<WireTicket>(client, 'tickets', {
        size: cap('tickets'),
        max: 10_000,
        where: { column: 'status', op: 'in', value: ['open', 'sent'] },
        order: 'opened_at.desc',
      }),
      listAll<WirePayment>(client, 'payments', { size: cap('payments'), max: 50_000, where: { column: 'paid_at', op: 'gte', value: midnight } }),
      listAll<WireRefund>(client, 'refunds', { size: cap('refunds'), max: 10_000, where: { column: 'refunded_at', op: 'gte', value: midnight } }),
      listAll<WireShift>(client, 'shifts', {
        size: 1,
        max: 1,
        where: { column: 'ended_at', op: 'is_null' },
        order: 'started_at.desc',
      }),
      listAll<WireReservation>(client, 'reservations', {
        size: cap('reservations'),
        max: 10_000,
        where: { and: [{ column: 'starts_at', op: 'gte', value: midnight }, { column: 'starts_at', op: 'lt', value: until }] },
        order: 'starts_at.asc',
      }),
      // Who is clocked in: the open time-clock rows.
      listAll<WireClock>(client, 'timeClock', { size: cap('timeClock'), max: 1_000, where: { column: 'clock_out', op: 'is_null' } }),
    ]);
    // Pickup orders not yet collected: open ones are in `live`, paid ones are read here.
    const waiting = await listAll<WireTicket>(client, 'tickets', {
      size: cap('tickets'),
      max: 1_000,
      where: { column: 'pickup_stage', op: 'in', value: ['queued', 'making', 'ready'] },
      order: 'opened_at.asc',
    });
    const liveKeys = live.map((t) => t.id);
    const lines = (await listIn<WireTicketItem>(client, 'ticketItems', 'ticket_id', liveKeys, cap('ticketItems'))).filter(
      (row) => row.voided_at === null,
    );
    const cardKeys = [...new Set(lines.flatMap((l) => (l.gift_card_id === null || l.gift_card_id === undefined ? [] : [l.gift_card_id])))];
    const [lineOptions, livePayments, loadedCards] = await Promise.all([
      listIn<{ ticket_item_id: Key; modifier_id: Key | null }>(client, 'ticketItemModifiers', 'ticket_item_id', lines.map((l) => l.id), cap('ticketItemModifiers')),
      listIn<WirePayment>(client, 'payments', 'ticket_id', liveKeys, cap('payments')),
      // The cards an open ticket is putting money on, for their codes.
      listIn<{ id: Key; code: string | null }>(client, 'giftCards', 'id', cardKeys, 200),
    ]);
    const codeOfCard = new Map(loadedCards.map((c) => [key(c.id), c.code ?? '']));

    /* --- the venue ------------------------------------------------------ */

    const tipPresets = settings === undefined ? [] : list(settings.tip_presets).map(Number).filter(Number.isFinite);
    const rules: BookingRules | null =
      rulesRow === undefined
        ? null
        : {
            opens: rulesRow.opens,
            closes: rulesRow.closes,
            slotMinutes: num(rulesRow.slot_minutes),
            coversPerSlot: num(rulesRow.covers_per_slot),
            daysAhead,
            maxParty: num(rulesRow.max_party),
            holdMinutes: num(rulesRow.hold_minutes),
            cancelHours: num(rulesRow.cancel_hours),
            occasions: list(rulesRow.occasions).map(String),
          };

    /* --- staff: a roster without PINs (D61), matched by e-mail ---------- */

    const staff: Staff[] = staffRows
      .filter((row) => yes(row.active))
      .map((row) => ({ id: key(row.id), name: row.name, initials: row.initials ?? initialsOf(row.name), role: row.role ?? '', pin: '', email: row.email }));
    const onRoster = new Set(staff.map((x) => x.id));
    const clock: ClockEntry[] = clockRows
      .filter((row) => onRoster.has(key(row.staff_id)))
      .map((row) => ({ staffId: key(row.staff_id), rid: key(row.id), since: instant(row.clock_in) }));
    const staffByEmail: Record<string, Staff> = {};
    for (const row of staffRows) {
      if (row.email === null || !yes(row.active)) continue;
      const person = staff.find((s) => s.id === key(row.id));
      if (person !== undefined) staffByEmail[row.email.toLowerCase()] = person;
    }

    /* --- the menu (v1) -------------------------------------------------- */

    /*
     * A row's slug is the sample's own word for it ("coffee"), which names it
     * in every language; an operator's rows have none and are keyed by id.
     */
    const slugFor = (row: { id: Key; slug: string | null }): string => row.slug ?? `id-${key(row.id)}`;
    const slugOf = new Map(categories.map((c) => [key(c.id), c]));
    const mappedMenu: MenuItem[] = [...items].sort(byPosition).map((row) => {
      const category = row.category_id === null ? undefined : slugOf.get(key(row.category_id));
      return {
        id: key(row.id),
        name: row.name,
        price: num(row.price),
        cat: category === undefined ? '' : slugFor(category),
        icon: category?.icon ?? 'utensils',
        image: row.image ?? '',
        // The groups below replace the old schemes; the sheet reads them (menu v1).
        mods: null,
        available: yes(row.available),
        barcode: row.barcode,
      };
    });
    const mappedCategories: Category[] = [...categories].sort(byPosition).map((c) => ({
      slug: slugFor(c),
      name: c.name,
      icon: c.icon ?? 'utensils',
      tint: c.tint,
    }));
    const mappedGroups: ModifierGroup[] = [...groups].sort(byPosition).map((g) => ({
      id: key(g.id),
      itemId: key(g.item_id),
      slug: slugFor(g),
      name: g.name,
      kind: g.kind,
      min: num(g.min),
      max: num(g.max),
      options: options
        .filter((o) => key(o.group_id) === key(g.id))
        .sort(byPosition)
        .map((o) => ({ id: key(o.id), slug: slugFor(o), name: o.name, delta: num(o.price_delta), available: yes(o.available) })),
    }));
    const itemName = new Map(mappedMenu.map((m) => [m.id, m.name]));

    /* --- tickets -------------------------------------------------------- */

    const labelOf = new Map(tables.map((t) => [key(t.id), t.label]));
    const seatsOf = new Map(tables.map((t) => [key(t.id), num(t.seats)]));
    const optionsOf = new Map<string, string[]>();
    for (const row of lineOptions) {
      if (row.modifier_id === null) continue;
      optionsOf.set(key(row.ticket_item_id), [...(optionsOf.get(key(row.ticket_item_id)) ?? []), key(row.modifier_id)]);
    }
    // A line's options, filed under the group each belongs to: its selection.
    const groupOfOption = new Map<string, string>();
    for (const g of mappedGroups) for (const o of g.options) groupOfOption.set(o.id, g.id);
    // The kitchen reads a line's options by name, in the menu's order (as the till's own `send` writes them).
    const allOptions = mappedGroups.flatMap((g) => g.options);
    const optionNames = (lineId: Key): string[] => {
      const chosen = optionsOf.get(key(lineId)) ?? [];
      return allOptions.filter((o) => chosen.includes(o.id)).map((o) => o.name);
    };
    const selectionOf = (lineId: Key): Selection => {
      const out: Selection = {};
      for (const option of optionsOf.get(key(lineId)) ?? []) {
        const group = groupOfOption.get(option);
        if (group !== undefined) out[group] = [...(out[group] ?? []), option];
      }
      return out;
    };
    const linesOf = (ticket: WireTicket): LineItem[] =>
      lines
        .filter((row) => key(row.ticket_id) === key(ticket.id))
        .map((row) => ({
          key: key(row.id),
          rid: key(row.id),
          id: row.menu_item_id === null ? '' : key(row.menu_item_id),
          qty: num(row.qty),
          selection: selectionOf(row.id),
          note: row.notes ?? '',
          seat: num(row.seat),
          sent: row.sent_at !== null,
          ...(row.reward_id === null || row.reward_id === undefined ? {} : { rewardId: key(row.reward_id) }),
          ...(row.gift_card_id === null || row.gift_card_id === undefined
            ? {}
            : { giftCard: { cardId: key(row.gift_card_id), code: codeOfCard.get(key(row.gift_card_id)) ?? '', amount: num(row.unit_price) } }),
        }));
    const numberOf = (value: string | null, id: Key): number => {
      const match = value === null ? null : /(\d+)/.exec(value);
      return match === null ? Number(id) : Number(match[1]);
    };
    const tableLabel = (id: Key | null) => (id === null ? null : (labelOf.get(key(id)) ?? null));

    const current = live.find((t) => !yes(t.held));
    const openTicket: Ticket =
      current === undefined
        ? { number: 0, table: null, seats: 2, openedAt: Date.now(), items: [] }
        : {
            number: numberOf(current.number, current.id),
            rid: key(current.id),
            table: tableLabel(current.table_id),
            seats: current.table_id === null ? num(current.guests) : (seatsOf.get(key(current.table_id)) ?? num(current.guests)),
            openedAt: instant(current.opened_at),
            items: linesOf(current),
            ...(current.customer_id === null || current.customer_id === undefined ? {} : { customerId: key(current.customer_id) }),
          };
    const held: HeldTicket[] = live
      .filter((t) => t !== current)
      .map((row) => ({
        number: numberOf(row.number, row.id),
        rid: key(row.id),
        table: tableLabel(row.table_id),
        at: instant(row.opened_at),
        seats: row.table_id === null ? num(row.guests) : (seatsOf.get(key(row.table_id)) ?? num(row.guests)),
        items: linesOf(row),
        ...(row.customer_id === null || row.customer_id === undefined ? {} : { customerId: key(row.customer_id) }),
      }));

    /* --- the floor ------------------------------------------------------ */

    const busy = new Map<string, WireTicket>();
    for (const row of live) if (row.table_id !== null && !busy.has(key(row.table_id))) busy.set(key(row.table_id), row);
    const mappedTables: TableInfo[] = [...tables].sort(byPosition).map((row) => {
      const ticket = busy.get(key(row.id));
      const info: TableInfo = {
        id: key(row.id),
        zone: row.zone ?? '',
        label: row.label,
        seats: num(row.seats),
        status: ticket === undefined ? 'open' : 'occupied',
      };
      if (ticket !== undefined) {
        info.total = num(ticket.total);
        info.since = instant(ticket.opened_at);
      }
      return info;
    });
    const zones: string[] = [];
    for (const row of mappedTables) if (!zones.includes(row.zone)) zones.push(row.zone);

    /* --- the kitchen display -------------------------------------------- */

    const kitchen: KdsOrder[] = live
      .filter((row) => row.status === 'sent' && row.kitchen_status !== 'served')
      .sort((a, b) => (a.sent_at ?? a.opened_at).localeCompare(b.sent_at ?? b.opened_at))
      .map((row) => ({
        number: numberOf(row.number, row.id),
        rid: key(row.id),
        table: tableLabel(row.table_id),
        at: instant(row.sent_at ?? row.opened_at),
        status: (['new', 'cooking', 'ready'].includes(row.kitchen_status) ? row.kitchen_status : 'new') as KdsStatus,
        items: lines
          .filter((line) => key(line.ticket_id) === key(row.id))
          .map((line) => ({ n: line.menu_item_id === null ? line.name : (itemName.get(key(line.menu_item_id)) ?? line.name), q: num(line.qty), m: [...optionNames(line.id), line.notes ?? ''].filter(Boolean).join(' · ') })),
      }));

    /* --- pickup (wave 2) ------------------------------------------------ */

    const pickupLines = await listIn<WireTicketItem>(client, 'ticketItems', 'ticket_id', waiting.map((t) => t.id), cap('ticketItems'));
    const who = await listIn<{ id: Key; name: string; mobile: string | null }>(
      client,
      'customers',
      'id',
      [...new Set(waiting.flatMap((t) => (t.customer_id === null || t.customer_id === undefined ? [] : [t.customer_id])))],
      200,
    );
    const pickups: PickupOrder[] = waiting.map((row) => {
      const person = who.find((c) => key(c.id) === key(row.customer_id ?? ''));
      return {
        rid: key(row.id),
        number: numberOf(row.number, row.id),
        name: person?.name ?? '',
        mobile: person?.mobile ?? null,
        channel: row.channel ?? 'till',
        stage: (row.pickup_stage === 'making' || row.pickup_stage === 'ready' ? row.pickup_stage : 'queued'),
        placedAt: instant(row.opened_at),
        readyAt: row.ready_at === null ? null : instant(row.ready_at),
        notifiedAt: row.notified_at === null ? null : instant(row.notified_at),
        items: pickupLines
          .filter((line) => key(line.ticket_id) === key(row.id) && line.voided_at === null)
          .map((line) => (num(line.qty) > 1 ? `${String(num(line.qty))}× ` : '') + (line.menu_item_id === null ? line.name : (itemName.get(key(line.menu_item_id)) ?? line.name))),
      };
    });

    /* --- the shift ------------------------------------------------------ */

    const openShift = shifts[0];
    const shiftStart = openShift === undefined ? Date.parse(midnight) : instant(openShift.started_at);
    const takings = todaysPayments.filter((row) => instant(row.paid_at) >= shiftStart);
    // Added in cents: a float sum of prices drifts (96.24000000000001).
    const cents = (values: Num[]): number => values.reduce<number>((total, v) => total + Math.round(num(v) * 100), 0) / 100;
    const sum = (method: WirePayment['method']): number =>
      cents(takings.filter((row) => row.method === method).flatMap((row) => [row.amount, row.tip ?? 0]));
    const shift: ShiftTotals = {
      orders: new Set(takings.map((row) => key(row.ticket_id))).size,
      gross: cents(takings.map((row) => row.amount)),
      card: sum('card'),
      cash: sum('cash'),
      qr: sum('qr'),
      gift: sum('gift_card'),
      tips: cents(takings.map((row) => row.tip ?? 0)),
      refunds: cents(refunds.filter((row) => instant(row.refunded_at) >= shiftStart).map((row) => row.amount)),
      cashRefunds: cents(refunds.filter((row) => instant(row.refunded_at) >= shiftStart && row.method === 'cash').map((row) => row.amount)),
      comps: 0,
    };
    const openSplits: Split[] =
      current === undefined
        ? []
        : livePayments
            .filter((row) => key(row.ticket_id) === key(current.id))
            .map((row) => ({ method: row.method, amount: num(row.amount) + num(row.tip), ...(row.reference === null || row.reference === undefined ? {} : { reference: row.reference }) }));

    /* The register's first row: the items the operator featured, else what sells. */
    const featured = [...items].filter((row) => yes(row.featured)).sort(byPosition).map((row) => key(row.id));
    const sold = new Map<string, number>();
    for (const row of lines) {
      if (row.menu_item_id !== null) sold.set(key(row.menu_item_id), (sold.get(key(row.menu_item_id)) ?? 0) + num(row.qty));
    }
    const favourites =
      featured.length > 0
        ? featured.slice(0, 6)
        : [...mappedMenu].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0)).slice(0, 6).map((row) => row.id);

    /* --- bookings ------------------------------------------------------- */

    const reservations: Reservation[] = bookings.map(reservationOf);

    return {
      currency: config.currency,
      timezone: tz,
      timezoneSource: config.timezoneSource ?? null,
      brand: settings?.venue_name ?? null,
      venue: { address: settings?.address ?? null, phone: settings?.phone ?? null, footer: settings?.receipt_footer ?? null },
      taxRate: settings === undefined ? null : num(settings.tax_rate_bp) / 10_000,
      tipPresets: tipPresets.length === 0 ? null : tipPresets.map((p) => p / 100),
      rules,
      staff,
      clock,
      openingFloat: openShift === undefined ? 0 : num(openShift.opening_float),
      staffByEmail,
      menu: mappedMenu,
      categories: mappedCategories,
      groups: mappedGroups,
      tables: mappedTables,
      zones,
      favourites,
      shift,
      shiftStart,
      shiftId: openShift === undefined ? null : key(openShift.id),
      openTicket,
      openSplits,
      held,
      kitchen,
      reservations,
      pickups,
    };
  } catch (error) {
    /* The reason is KEPT, not swallowed: the failure screen names it. */
    lastSnapshotError = error instanceof Error ? error : new Error(String(error));
    console.warn('[adminium] could not load a snapshot:', error);
    return null;
  }
}

function reservationOf(row: WireReservation): Reservation {
  return {
    id: key(row.id),
    code: row.code,
    name: row.name,
    mobile: row.mobile,
    email: row.email ?? null,
    partySize: num(row.party_size),
    startsAt: instant(row.starts_at),
    status: row.status,
    channel: row.channel,
    tableId: row.table_id === null ? null : key(row.table_id),
    occasion: row.occasion,
    request: row.guest_request,
    note: row.staff_note,
  };
}

/** One booking, read again: a live frame carries its guest's name and number masked. */
export async function readReservation(client: SnapshotPort, id: string): Promise<Reservation | null> {
  const rows = await client
    .list<WireReservation>('reservations', { limit: 1, offset: 0, where: { column: 'id', op: 'eq', value: Number.isNaN(Number(id)) ? id : Number(id) } })
    .catch(() => ({ data: [] as WireReservation[] }));
  const row = rows.data[0];
  return row === undefined ? null : reservationOf(row);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * A synchronous `DataSource` over an already-fetched snapshot.
 *
 * `operator` is the person the hosted build's session names. They are the
 * staff row carrying their e-mail when there is one — so what they ring up is
 * recorded against that row — and otherwise themselves, recorded against no
 * row. The PIN pad opens nobody: there is no PIN column (D61), and the session
 * opened the till.
 */
export function snapshotSource(snap: Snapshot, operator: Staff | null = null, email: string | null = null): DataSource {
  const signedIn = operator === null ? null : ((email === null ? undefined : snap.staffByEmail[email.toLowerCase()]) ?? operator);
  return {
    /* The venue's own name, else what the operator called the app in Adminium,
     * else nothing — the screens handle an empty brand. */
    brand: () => snap.brand ?? appName() ?? '',
    venue: () => ({ name: snap.brand ?? appName() ?? '', ...snap.venue }),
    // Unset tax is a visible zero, never a plausible rate nobody chose.
    taxRate: () => snap.taxRate ?? 0,
    /* Tip presets are BUTTONS a cashier taps; the venue's own, else the app's four. */
    tipPresets: () => [...(snap.tipPresets ?? [0, 0.1, 0.15, 0.2])],
    favourites: () => [...snap.favourites],
    zoneOrder: () => [...snap.zones],
    shiftStart: () => snap.shiftStart,
    openShiftId: () => snap.shiftId,
    openingFloat: () => snap.openingFloat,
    bookingRules: () => (snap.rules === null ? null : { ...snap.rules, occasions: [...snap.rules.occasions] }),
    modifierGroups: () => snap.groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) })),
    staff: (): Staff[] => (signedIn === null ? [] : [{ ...signedIn }]),
    roster: () => snap.staff.map((x) => ({ ...x })),
    timeClock: () => snap.clock.map((x) => ({ ...x })),
    menu: () => snap.menu.map((row) => ({ ...row })),
    categories: () => snap.categories.map((row) => ({ ...row })),
    tables: () => snap.tables.map((row) => ({ ...row })),
    shift: () => ({ ...snap.shift }),
    openTicket: () => ({ ...snap.openTicket, items: snap.openTicket.items.map((i) => ({ ...i })) }),
    openSplits: () => snap.openSplits.map((x) => ({ ...x })),
    heldTickets: () => snap.held.map((h) => ({ ...h, items: h.items.map((i) => ({ ...i })) })),
    kitchenOrders: () => snap.kitchen.map((k) => ({ ...k, items: k.items.map((i) => ({ ...i })) })),
    reservations: () => snap.reservations.map((r) => ({ ...r })),
    pickups: () => snap.pickups.map((p) => ({ ...p, items: [...p.items] })),
  };
}
