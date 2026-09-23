/**
 * The sample data an operator can add from Adminium — `seeds/pos.sample.json`,
 * in the `adminium.sample/1` format the manifest's `sampleData` names.
 *
 * `buildSample()` is PURE and deterministic: the same catalogue as demo.ts, the
 * same café, and a few days of trading made by a seeded generator, so the
 * committed bundle can be compared with a fresh build byte for byte
 * (sample-drift.test.ts) and `db/seed.sql` is generated from it
 * (sample-sql.ts). Nothing here is written by hand twice.
 *
 * Times are relative — `@ago` for "an hour ago", `@day`/`@time` for a wall
 * time on the venue's clock — so a bundle added next month still shows today's
 * tickets and tonight's bookings. Names the reader sees go out in all eight
 * languages (`@t`): the menu from sample-names.ts, categories, zones and sizes
 * from the till's own bundles.
 *
 * The money follows the till's rules: a line's unit price is the item's price
 * with its options added in (calc.ts), a ticket's subtotal adds up its lines
 * that are not voided, tax is the venue's rate on the subtotal, and the total
 * is subtotal plus tax — the tip is kept beside it, not in it.
 */
import { MESSAGES } from '../i18n/messages';
import { LOCALE_TAGS } from '../i18n/locales';
import { BRAND, BRAND_INITIAL, CATS, EXTRAS, FAVOURITES, MENU, MILKS, SCHEME_OF, STAFF, TABLES, TAX, TIP_PRESETS, type SchemeName } from './demo';
import { GROUP_NAMES, ITEM_NAMES, OPTION_NAMES, REWARD_NAMES, TEXT_NAMES, type Names } from './sample-names';

export const SAMPLE_FORMAT = 'adminium.sample/1';

type Value = string | number | boolean | null | Record<string, unknown> | unknown[];
export type SampleRow = Record<string, Value>;
export interface SampleTable {
  ref: string;
  rows: SampleRow[];
}
export interface SampleBundle {
  format: typeof SAMPLE_FORMAT;
  app: 'pos';
  assets: Record<string, { file: string; sha256: string }>;
  tables: SampleTable[];
}

// ── the till's prices (calc.ts), as data ─────────────────────────────────────

export const SIZE_DELTAS = { S: -0.4, M: 0, L: 0.7 } as const;
export const extraDeltaOf = (extra: string): number => (extra === 'Extra shot' ? 0.9 : extra === 'Decaf' ? 0 : 0.5);
const SIZE_KEYS = { S: 'size.small', M: 'size.medium', L: 'size.large' } as const;

const GROUPS: Record<SchemeName, ('size' | 'milk' | 'extras')[]> = {
  coffee: ['size', 'milk', 'extras'],
  tea: ['size', 'milk'],
  cold: ['size', 'extras'],
};

// ── helpers ──────────────────────────────────────────────────────────────────

const round2 = (value: number): number => Math.round(value * 100) / 100;
const amount = (value: number): string => round2(value).toFixed(2);
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const t = (names: Names) => ({ '@t': { ...names } });
/** A chrome string in every language, from the till's bundles. */
const bundled = (key: string) =>
  t(Object.fromEntries(LOCALE_TAGS.map((tag) => [tag, MESSAGES[tag]?.[key] ?? MESSAGES['en-US'][key]!])) as Names);
const ref = (label: string) => ({ '@ref': label });
const ago = (minutes: number) => ({ '@ago': `PT${String(minutes)}M` });
const wall = (day: number, minutes: number) => ({
  '@day': day,
  '@time': `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
});

/** mulberry32: small, seeded, the same sequence on every machine. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uuid shaped like a v4, numbered: stable across builds, never a real device's. */
const uuid = (n: number): string => `5a3b1e00-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ── the build ────────────────────────────────────────────────────────────────

interface Line {
  item: string;
  qty: number;
  size?: keyof typeof SIZE_DELTAS;
  milk?: string;
  extras?: string[];
  seat?: number;
  note?: string;
  sent: boolean;
  voided?: boolean;
}

interface TicketSpec {
  number: string;
  table: string | null;
  staff: string;
  shift: string;
  guests: number;
  status: 'open' | 'sent' | 'paid';
  kitchen: 'new' | 'cooking' | 'ready' | 'served';
  held?: boolean;
  opened: Value;
  sent: Value | null;
  closed: Value | null;
  lines: Line[];
  method?: 'cash' | 'card' | 'qr';
  tipRate?: number;
  /** An order someone will collect (wave 2): who, how it came in, where it stands. */
  pickup?: { customer: string; channel: 'till' | 'phone'; stage: 'queued' | 'making' | 'ready' };
}

export function buildSample(): SampleBundle {
  const rand = random(55);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const menuById = new Map(MENU.map((item) => [item.id, item]));

  // Menu v1: categories, items, and each item's groups of options.
  const categories = CATS.filter((c) => c.slug !== 'all').map((c, position) => ({
    '@label': `cat:${c.slug}`,
    slug: c.slug,
    name: bundled(`category.${c.slug}`),
    position,
    icon: c.icon,
    tint: c.tint,
  }));
  const items = MENU.map((item, position) => ({
    '@label': `item:${item.id}`,
    category_id: ref(`cat:${item.cat}`),
    slug: item.id,
    name: t(ITEM_NAMES[item.id]!),
    price: amount(item.price),
    image: item.image ?? null,
    available: item.available !== false,
    featured: FAVOURITES.includes(item.id),
    position,
    // Packaged goods carry a code the scanner reads (T74).
    barcode: item.barcode ?? null,
  }));
  const groups: SampleRow[] = [];
  const options: SampleRow[] = [];
  for (const item of MENU) {
    const scheme = SCHEME_OF[item.id];
    if (scheme === undefined) continue;
    GROUPS[scheme].forEach((group, position) => {
      const label = `group:${item.id}:${group}`;
      groups.push({
        '@label': label,
        item_id: ref(`item:${item.id}`),
        slug: group,
        name: t(GROUP_NAMES[group]),
        kind: group === 'extras' ? 'check' : 'radio',
        min: group === 'extras' ? 0 : 1,
        max: group === 'extras' ? EXTRAS.length : 1,
        position,
      });
      const choices =
        group === 'size'
          ? (['S', 'M', 'L'] as const).map((size) => ({ key: size, name: bundled(SIZE_KEYS[size]), delta: SIZE_DELTAS[size] }))
          : group === 'milk'
            ? MILKS.map((milk) => ({ key: milk.v, name: t(OPTION_NAMES[milk.v]!), delta: milk.delta }))
            : EXTRAS.map((extra) => ({ key: extra.v, name: t(OPTION_NAMES[extra.v]!), delta: extraDeltaOf(extra.v) }));
      choices.forEach((choice, at) => {
        options.push({
          '@label': `mod:${item.id}:${group}:${slug(choice.key)}`,
          group_id: ref(label),
          slug: slug(choice.key),
          name: choice.name,
          price_delta: amount(choice.delta),
          available: true,
          position: at,
        });
      });
    });
  }

  const tables = TABLES.map((table, position) => ({
    '@label': `table:${table.label}`,
    label: table.label,
    seats: table.seats,
    zone: table.zone,
    position,
  }));
  const staff = STAFF.map((person) => ({
    '@label': `staff:${person.id}`,
    name: person.name,
    initials: person.initials,
    role: person.role,
    email: null,
    active: true,
  }));

  // Three days of shifts: two closed, today's open since the till's own start.
  const shifts: SampleRow[] = [];
  const clock: SampleRow[] = [];
  for (const day of [-2, -1]) {
    shifts.push({ '@label': `shift:${String(day)}`, opened_by: ref('staff:alex'), started_at: wall(day, 7 * 60), ended_at: wall(day, 15 * 60), opening_float: amount(200), closed_by: ref('staff:alex') });
    clock.push({ '@label': `clock:${String(day)}:alex`, staff_id: ref('staff:alex'), clock_in: wall(day, 6 * 60 + 50), clock_out: wall(day, 15 * 60 + 10) });
    clock.push({ '@label': `clock:${String(day)}:${day === -2 ? 'jordan' : 'sam'}`, staff_id: ref(day === -2 ? 'staff:jordan' : 'staff:sam'), clock_in: wall(day, 7 * 60), clock_out: wall(day, 15 * 60) });
  }
  shifts.push({ '@label': 'shift:0', opened_by: ref('staff:alex'), started_at: ago(192), opening_float: amount(200) });
  clock.push({ '@label': 'clock:0:alex', staff_id: ref('staff:alex'), clock_in: ago(195) });
  clock.push({ '@label': 'clock:0:sam', staff_id: ref('staff:sam'), clock_in: ago(190) });
  clock.push({ '@label': 'clock:0:jordan', staff_id: ref('staff:jordan'), clock_in: ago(120) });

  // Tickets: two past days of trade, today's paid tickets, and what is open now.
  const specs: TicketSpec[] = [];
  const randomLines = (): Line[] => {
    const count = 1 + Math.floor(rand() * 3);
    const out: Line[] = [];
    for (let i = 0; i < count; i += 1) {
      const item = pick(MENU.filter((m) => m.available !== false));
      const line: Line = { item: item.id, qty: 1 + Math.floor(rand() * 2), sent: true };
      const scheme = SCHEME_OF[item.id];
      if (scheme !== undefined) {
        line.size = pick(['S', 'M', 'M', 'L'] as const);
        if (GROUPS[scheme].includes('milk') && rand() < 0.4) line.milk = pick(['Oat', 'Almond']);
        if (GROUPS[scheme].includes('extras') && rand() < 0.3) line.extras = [pick(EXTRAS.map((e) => e.v))];
      }
      out.push(line);
    }
    return out;
  };
  const METHODS = ['card', 'card', 'cash', 'qr'] as const;
  let number = 901;
  for (const day of [-2, -1]) {
    for (let k = 0; k < 10; k += 1) {
      const opened = 7 * 60 + 30 + k * 42;
      const table = rand() < 0.3 ? null : pick(TABLES).label;
      specs.push({
        number: `S-${String(number).padStart(4, '0')}`,
        table,
        staff: pick(['sam', 'alex', 'jordan']),
        shift: `shift:${String(day)}`,
        guests: table === null ? 1 : 1 + Math.floor(rand() * 4),
        status: 'paid',
        kitchen: 'served',
        opened: wall(day, opened),
        sent: wall(day, opened + 2),
        closed: wall(day, opened + 25),
        lines: randomLines(),
        method: pick(METHODS),
        tipRate: pick([0, 0.1, 0.15, 0.2]),
      });
      number += 1;
    }
  }
  number = 1029;
  for (let k = 0; k < 8; k += 1) {
    const opened = 180 - k * 18;
    const table = rand() < 0.3 ? null : pick(TABLES).label;
    specs.push({
      number: `S-${String(number)}`,
      table,
      staff: pick(['sam', 'alex']),
      shift: 'shift:0',
      guests: table === null ? 1 : 1 + Math.floor(rand() * 4),
      status: 'paid',
      kitchen: 'served',
      opened: ago(opened),
      sent: ago(opened - 2),
      closed: ago(opened - 20),
      lines: randomLines(),
      method: pick(METHODS),
      tipRate: pick([0, 0.1, 0.15, 0.2]),
    });
    number += 1;
  }
  // The till's own open tickets (demo.ts seedTicket / seedHeld / seedKds).
  specs.push(
    {
      number: 'S-1037', table: 'B1', staff: 'alex', shift: 'shift:0', guests: 1, status: 'sent', kitchen: 'ready',
      opened: ago(14), sent: ago(11), closed: null,
      lines: [
        { item: 'latte', qty: 1, size: 'M', milk: 'Almond', sent: true },
        { item: 'muffin', qty: 1, sent: true },
      ],
    },
    {
      number: 'S-1038', table: 'W2', staff: 'alex', shift: 'shift:0', guests: 4, status: 'sent', kitchen: 'cooking',
      opened: ago(38), sent: ago(8), closed: null,
      lines: [
        { item: 'wrap', qty: 1, note: 'No onion', sent: true },
        { item: 'soup', qty: 1, sent: true },
        { item: 'croissant', qty: 2, sent: true },
      ],
    },
    {
      number: 'S-1039', table: 'T10', staff: 'sam', shift: 'shift:0', guests: 2, status: 'open', kitchen: 'served', held: true,
      opened: ago(26), sent: ago(22), closed: null,
      lines: [
        { item: 'latte', qty: 1, size: 'M', milk: 'Oat', sent: true },
        { item: 'bowl', qty: 1, sent: true },
        { item: 'oj', qty: 2, sent: true },
      ],
    },
    {
      number: 'S-1040', table: 'P1', staff: 'jordan', shift: 'shift:0', guests: 4, status: 'sent', kitchen: 'cooking',
      opened: ago(9), sent: ago(4), closed: null,
      lines: [
        { item: 'bowl', qty: 1, sent: true },
        { item: 'coldbrew', qty: 2, size: 'M', note: 'Extra ice', sent: true },
      ],
    },
    {
      number: 'S-1041', table: 'B2', staff: 'alex', shift: 'shift:0', guests: 1, status: 'open', kitchen: 'new', held: true,
      opened: ago(2), sent: null, closed: null,
      lines: [
        { item: 'cappuccino', qty: 1, size: 'M', sent: false },
        { item: 'croissant', qty: 1, sent: false },
      ],
    },
    {
      number: 'S-1042', table: 'T12', staff: 'sam', shift: 'shift:0', guests: 4, status: 'sent', kitchen: 'new',
      opened: ago(19), sent: ago(1), closed: null,
      lines: [
        { item: 'flatwhite', qty: 2, size: 'M', milk: 'Oat', seat: 1, sent: true },
        { item: 'avotoast', qty: 1, note: 'No chili flakes', seat: 1, sent: true },
        { item: 'coldbrew', qty: 1, size: 'L', extras: ['Extra shot'], seat: 2, sent: false },
        { item: 'croissant', qty: 2, sent: false },
        // Rung up by mistake and voided: on the ticket, not in its money.
        { item: 'mocha', qty: 1, size: 'M', sent: false, voided: true },
      ],
    },
    // Two pickup orders (wave 2): one paid and ready at the counter, one phoned in and being made.
    {
      number: 'S-1043', table: null, staff: 'sam', shift: 'shift:0', guests: 1, status: 'paid', kitchen: 'ready',
      opened: ago(8), sent: ago(7), closed: ago(7), method: 'card', tipRate: 0,
      lines: [
        { item: 'flatwhite', qty: 2, size: 'M', milk: 'Whole', sent: true },
        { item: 'croissant', qty: 1, sent: true },
      ],
      pickup: { customer: 'dana', channel: 'till', stage: 'ready' },
    },
    {
      number: 'S-1044', table: null, staff: 'sam', shift: 'shift:0', guests: 1, status: 'sent', kitchen: 'cooking',
      opened: ago(5), sent: ago(4), closed: null,
      lines: [
        { item: 'bowl', qty: 1, sent: true },
        { item: 'oj', qty: 1, sent: true },
      ],
      pickup: { customer: 'luis', channel: 'phone', stage: 'making' },
    },
  );

  const tickets: SampleRow[] = [];
  const lines: SampleRow[] = [];
  const lineOptions: SampleRow[] = [];
  const payments: SampleRow[] = [];
  let paymentNo = 1;
  for (const spec of specs) {
    const label = `ticket:${spec.number}`;
    let subtotal = 0;
    spec.lines.forEach((line, at) => {
      const item = menuById.get(line.item)!;
      const chosen: { group: string; key: string; delta: number }[] = [];
      if (line.size !== undefined) chosen.push({ group: 'size', key: line.size, delta: SIZE_DELTAS[line.size] });
      if (line.milk !== undefined) chosen.push({ group: 'milk', key: line.milk, delta: MILKS.find((m) => m.v === line.milk)!.delta });
      for (const extra of line.extras ?? []) chosen.push({ group: 'extras', key: extra, delta: extraDeltaOf(extra) });
      const unit = round2(item.price + chosen.reduce((sum, c) => sum + c.delta, 0));
      if (line.voided !== true) subtotal += unit * line.qty;
      const lineLabel = `line:${spec.number}:${String(at)}`;
      lines.push({
        '@label': lineLabel,
        ticket_id: ref(label),
        menu_item_id: ref(`item:${item.id}`),
        name: t(ITEM_NAMES[item.id]!),
        qty: line.qty,
        unit_price: amount(unit),
        seat: line.seat ?? 1,
        notes: line.note ?? null,
        sent_at: line.sent ? (spec.sent ?? spec.opened) : null,
        ...(line.voided === true ? { voided_at: ago(1), void_reason: t(TEXT_NAMES.voidReason), voided_by: ref(`staff:${spec.staff}`) } : {}),
      });
      for (const c of chosen) {
        lineOptions.push({
          ticket_item_id: ref(lineLabel),
          modifier_id: ref(`mod:${item.id}:${c.group}:${slug(c.key)}`),
          price_delta: amount(c.delta),
        });
      }
    });
    const tax = round2(subtotal * TAX);
    const total = round2(subtotal + tax);
    const tip = spec.status === 'paid' && spec.method === 'card' ? round2(subtotal * (spec.tipRate ?? 0)) : 0;
    tickets.push({
      '@label': label,
      number: spec.number,
      table_id: spec.table === null ? null : ref(`table:${spec.table}`),
      staff_id: ref(`staff:${spec.staff}`),
      shift_id: ref(spec.shift),
      guests: spec.guests,
      status: spec.status,
      kitchen_status: spec.kitchen,
      held: spec.held === true,
      subtotal: amount(subtotal),
      tax: amount(tax),
      tip: amount(tip),
      total: amount(total),
      opened_at: spec.opened,
      sent_at: spec.sent,
      closed_at: spec.closed,
      ...(spec.pickup === undefined
        ? {}
        : {
            customer_id: ref(`customer:${spec.pickup.customer}`),
            channel: spec.pickup.channel,
            pickup_code: spec.number,
            pickup_stage: spec.pickup.stage,
            ready_at: spec.pickup.stage === 'ready' ? ago(2) : null,
          }),
    });
    if (spec.status === 'paid') {
      payments.push({
        id: uuid(paymentNo),
        ticket_id: ref(label),
        method: spec.method!,
        amount: amount(total),
        tip: amount(tip),
        ...(spec.method === 'cash' ? { tendered: amount(Math.ceil(total + tip)), change: amount(Math.ceil(total + tip) - total - tip) } : {}),
        paid_at: spec.closed!,
        staff_id: ref(`staff:${spec.staff}`),
      });
      paymentNo += 1;
    }
  }

  // Yesterday's one refund: a wrong item on an early ticket.
  const refunded = specs.find((spec) => spec.shift === 'shift:-1')!;
  const firstLine = refunded.lines[0]!;
  const refundUnit = Number(lines.find((row) => row['@label'] === `line:${refunded.number}:0`)!['unit_price']);
  const refunds = [
    {
      '@label': 'refund:1',
      id: uuid(9001),
      ticket_id: ref(`ticket:${refunded.number}`),
      method: refunded.method ?? 'card',
      amount: amount(refundUnit),
      tax: amount(refundUnit * TAX),
      reason: t(TEXT_NAMES.refundReason),
      staff_id: ref('staff:alex'),
      refunded_at: wall(-1, 10 * 60 + 15),
    },
  ];
  const refundItems = [
    { id: uuid(9101), refund_id: ref('refund:1'), ticket_item_id: ref(`line:${refunded.number}:0`), qty: Math.min(1, firstLine.qty) },
  ];

  // Bookings for tonight and tomorrow. One is the booking the demo's
  // "Manage my booking" finds: MR-4829 with (415) 555-0166.
  const GUESTS = ['Iris Moreau', 'Tomás Alves', 'Priya Anand', 'Mara Rossi', 'Kenji Watanabe', 'Lena Fischer', 'Noah Becker', 'Amara Okafor', 'Sofia Lindqvist', 'Omar Haddad'];
  const code = () => `MR-${Array.from({ length: 4 }, () => CROCKFORD[Math.floor(rand() * CROCKFORD.length)]).join('')}`;
  const BOOKINGS: [day: number, time: number, party: number, occasion: string | null, channel: 'online' | 'phone' | 'walk_in'][] = [
    [0, 17 * 60, 2, null, 'online'],
    [0, 17 * 60 + 30, 4, null, 'phone'],
    [0, 18 * 60, 6, 'birthday', 'online'],
    [0, 19 * 60, 2, 'anniversary', 'online'],
    [0, 19 * 60 + 30, 3, null, 'phone'],
    [0, 20 * 60, 2, null, 'online'],
    [1, 17 * 60 + 30, 2, null, 'online'],
    [1, 18 * 60 + 30, 4, 'business', 'phone'],
    [1, 19 * 60, 5, 'birthday', 'online'],
    [1, 20 * 60 + 30, 2, null, 'online'],
  ];
  const reservations = BOOKINGS.map(([day, time, party, occasion, channel], i) => {
    const manage = i === 3;
    return {
      '@label': `booking:${String(i + 1)}`,
      code: manage ? 'MR-4829' : code(),
      name: GUESTS[i]!,
      mobile: manage ? '+1 415 555 0166' : `+1 415 555 01${String(10 + i)}`,
      email: channel === 'online' ? `${GUESTS[i]!.split(' ')[0]!.toLowerCase()}@example.com` : null,
      party_size: party,
      starts_at: wall(day, time),
      status: 'confirmed',
      channel,
      occasion,
      guest_request: manage ? t(TEXT_NAMES.quietTable) : null,
    };
  });

  const bookingRules = [
    {
      opens: '17:00',
      closes: '21:00',
      slot_minutes: 30,
      covers_per_slot: 12,
      days_ahead: 5,
      max_party: 8,
      hold_minutes: 15,
      cancel_hours: 2,
      occasions: ['birthday', 'anniversary', 'business', 'date'],
    },
  ];
  const settings = [
    {
      venue_name: BRAND,
      venue_mark: BRAND_INITIAL,
      address: '48 Harbour Street, Portland, ME 04101',
      phone: '+1 207 555 0142',
      tax_rate_bp: Math.round(TAX * 10000),
      tip_presets: TIP_PRESETS.map((fraction) => Math.round(fraction * 100)),
      receipt_footer: t(TEXT_NAMES.receiptFooter),
    },
  ];

  /*
   * Loyalty (wave 2): the comp's three members, the rewards, and a history
   * whose sums ARE their balances — Adminium's rollups add them up on the way
   * in. Each member's earlier years arrive as one opening adjustment.
   */
  const rewards = [
    { key: 'latte', item: 'latte', points: 250, icon: 'coffee' },
    { key: 'pastry', item: 'croissant', points: 180, icon: 'croissant' },
    { key: 'bowl', item: 'bowl', points: 600, icon: 'salad' },
  ].map((r, position) => ({ '@label': `reward:${r.key}`, name: t(REWARD_NAMES[r.key as keyof typeof REWARD_NAMES]), points: r.points, menu_item_id: ref(`item:${r.item}`), icon: r.icon, active: true, position }));
  const HISTORY: [who: string, kind: 'earn' | 'redeem' | 'adjust', points: number, visit: number, reward: string | null, daysAgo: number][] = [
    ['dana', 'adjust', 1469, 36, null, 60],
    ['dana', 'earn', 9, 1, null, 10],
    ['dana', 'redeem', -250, 0, 'latte', 6],
    ['dana', 'earn', 12, 1, null, 0],
    ['luis', 'adjust', 404, 11, null, 60],
    ['luis', 'earn', 16, 1, null, 2],
    ['aisha', 'adjust', 2689, 63, null, 60],
    ['aisha', 'redeem', -600, 0, 'bowl', 14],
    ['aisha', 'earn', 21, 1, null, 1],
  ];
  /*
   * Sample rows go in as they are, with no rules run — so a member's totals
   * are written here, as the rollups would have added them up.
   */
  const sums = (who: string) => {
    const mine = HISTORY.filter((h) => h[0] === who);
    return {
      points: mine.reduce((sum, h) => sum + h[2], 0),
      lifetime_points: mine.filter((h) => h[4] === null).reduce((sum, h) => sum + h[2], 0),
      visits: mine.reduce((sum, h) => sum + h[3], 0),
    };
  };
  const customers = [
    { key: 'dana', name: 'Dana Whitfield', mobile: '(415) 555-0132', email: 'dana.w@example.com', joined: 900 },
    { key: 'luis', name: 'Luis Romano', mobile: '(415) 555-0781', email: null, joined: 420 },
    { key: 'aisha', name: 'Aisha Bello', mobile: '(628) 555-0244', email: 'aisha@example.com', joined: 1300 },
  ].map((c) => ({
    '@label': `customer:${c.key}`,
    name: c.name,
    mobile: c.mobile,
    email: c.email,
    joined_at: { '@ago': `P${String(c.joined)}D` },
    ...sums(c.key),
  }));
  const pointsLedger = HISTORY.map(([who, kind, points, visit, reward, daysAgo], i) => ({
    id: uuid(9201 + i),
    customer_id: ref(`customer:${who}`),
    kind,
    points,
    visit,
    reward_id: reward === null ? null : ref(`reward:${reward}`),
    staff_id: kind === 'adjust' ? null : ref('staff:sam'),
    at: daysAgo === 0 ? ago(40) : { '@ago': `P${String(daysAgo)}DT2H` },
  }));

  // Gift cards (wave 2): the comp's card, $25 when sold, $25 more, then a purchase — $38.50 left.
  const CARD_HISTORY: [kind: 'issue' | 'reload' | 'redeem', amount: number, daysAgo: number][] = [
    ['issue', 25, 40],
    ['reload', 25, 9],
    ['redeem', -11.5, 2],
  ];
  const giftCards = [
    {
      '@label': 'gift:1',
      code: 'GC-48219930',
      status: 'active',
      // Written as the rollup would add it up: sample rows go in with no rules run.
      balance: amount(CARD_HISTORY.reduce((sum, h) => sum + h[1], 0)),
      issued_at: { '@ago': 'P40DT3H' },
    },
  ];
  const cardLedger = CARD_HISTORY.map(([kind, value, daysAgo], i) => ({
    id: uuid(9301 + i),
    card_id: ref('gift:1'),
    kind,
    amount: amount(value),
    staff_id: ref('staff:sam'),
    at: { '@ago': `P${String(daysAgo)}DT3H` },
  }));

  return {
    format: SAMPLE_FORMAT,
    app: 'pos',
    assets: {},
    tables: [
      { ref: 'menu_categories', rows: categories },
      { ref: 'menu_items', rows: items },
      { ref: 'modifier_groups', rows: groups },
      { ref: 'modifiers', rows: options },
      { ref: 'restaurant_tables', rows: tables },
      { ref: 'staff', rows: staff },
      { ref: 'time_clock', rows: clock },
      { ref: 'shifts', rows: shifts },
      { ref: 'booking_rules', rows: bookingRules },
      { ref: 'settings', rows: settings },
      { ref: 'reservations', rows: reservations },
      { ref: 'customers', rows: customers },
      { ref: 'rewards', rows: rewards },
      { ref: 'tickets', rows: tickets },
      { ref: 'ticket_items', rows: lines },
      { ref: 'ticket_item_modifiers', rows: lineOptions },
      { ref: 'payments', rows: payments },
      { ref: 'refunds', rows: refunds },
      { ref: 'refund_items', rows: refundItems },
      { ref: 'loyalty_ledger', rows: pointsLedger },
      { ref: 'gift_cards', rows: giftCards },
      { ref: 'gift_card_ledger', rows: cardLedger },
    ],
  };
}
