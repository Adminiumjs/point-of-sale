// Built-in demo data — ported verbatim from the design comp. In production this
// is where the DataSource (see source.ts) would hand back live data from an
// Adminium instance; today it's a fixed in-memory catalogue so the example runs
// with zero backend.

import { t } from '../i18n/ambient';
import { keyOf } from './key';
import type {
  BookingRules,
  Category,
  Extra,
  HeldTicket,
  KdsOrder,
  LineItem,
  MenuItem,
  ClockEntry,
  ModifierGroup,
  PastSale,
  PayMethod,
  PickupOrder,
  Reservation,
  Selection,
  Staff,
  ShiftTotals,
  TableInfo,
  Ticket,
} from './types';

/** The demo venue. Authored once: the top bar's brand mark still read "M", a
 * leftover from before the rebrand, while every other surface said this. */
export const BRAND = 'Daybreak Coffee';
export const BRAND_INITIAL = BRAND.charAt(0);
/** The demo venue's street and phone, as its receipt and its guest pages print them. */
export const VENUE_ADDRESS = '128 Alder Lane, San Francisco';
export const VENUE_PHONE = '(415) 555-0148';

export const TAX = 0.0825;

/** Tip presets as fractions, indexed 0..3 → No tip / 10% / 15% / 20%. */
export const TIP_PRESETS = [0, 0.1, 0.15, 0.2];

export const SHIFT_START = Date.now() - 192 * 60000;

export const SHIFT: ShiftTotals = {
  orders: 47,
  gross: 842.6,
  card: 611.4,
  cash: 168.2,
  qr: 63.0,
  gift: 0,
  tips: 92.5,
  refunds: 12.0,
  cashRefunds: 0,
  comps: 18.5,
};

/** The float counted into the drawer when the demo's shift opened. */
export const OPENING_FLOAT = 200;

export const STAFF: Staff[] = [
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', role: 'Barista', pin: '1234' },
  { id: 'alex', name: 'Alex Chen', initials: 'AC', role: 'Shift lead', pin: '2468' },
  { id: 'jordan', name: 'Jordan Diaz', initials: 'JD', role: 'Barista', pin: '1357' },
];

/** Real product photography (Unsplash). Same catalogue as db/seed.sql. */
const IMG = 'https://images.unsplash.com/photo-';
const IMG_Q = '?w=600&q=75&auto=format&fit=crop';
const img = (id: string): string => IMG + id + IMG_Q;

/**
 * An in-store EAN-13 (the `20` prefix is kept for a shop's own codes) with its
 * check digit: what the demo's packaged items carry for the scanner.
 */
export function ean13(body: string): string {
  const digits = body.padStart(12, '0').slice(-12);
  const sum = [...digits].reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return digits + String((10 - (sum % 10)) % 10);
}

/** The demo's packaged goods: bakery and cold drinks go through the scanner. */
export const BARCODES: Record<string, string> = {
  croissant: ean13('200000000101'),
  almond: ean13('200000000102'),
  banana: ean13('200000000103'),
  muffin: ean13('200000000104'),
  cinnamon: ean13('200000000105'),
  oj: ean13('200000000201'),
  sparkling: ean13('200000000202'),
  lemonade: ean13('200000000203'),
};

export const MENU: MenuItem[] = [
  { id: 'espresso', name: 'Espresso', price: 3.2, cat: 'coffee', icon: 'coffee', image: img('1510707577719-ae7c14805e3a') },
  { id: 'flatwhite', name: 'Flat White', price: 4.5, cat: 'coffee', icon: 'coffee', image: img('1509042239860-f550ce710b93') },
  { id: 'cappuccino', name: 'Cappuccino', price: 4.2, cat: 'coffee', icon: 'coffee', image: img('1541167760496-1628856ab772') },
  { id: 'latte', name: 'Latte', price: 4.8, cat: 'coffee', icon: 'coffee', image: img('1541167760496-1628856ab772') },
  { id: 'americano', name: 'Americano', price: 3.6, cat: 'coffee', icon: 'coffee', image: img('1510707577719-ae7c14805e3a') },
  { id: 'mocha', name: 'Mocha', price: 5.2, cat: 'coffee', icon: 'coffee', image: img('1509042239860-f550ce710b93') },
  { id: 'chai', name: 'Chai Latte', price: 4.6, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574') },
  { id: 'earlgrey', name: 'Earl Grey', price: 3.4, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574') },
  { id: 'greentea', name: 'Green Tea', price: 3.4, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574') },
  { id: 'matcha', name: 'Matcha Latte', price: 5.4, cat: 'tea', icon: 'cup-soda', image: img('1536256263959-770b48d82b0a') },
  { id: 'avotoast', name: 'Avocado Toast', price: 9.5, cat: 'food', icon: 'sandwich', image: img('1541519227354-08fa5d50c44d') },
  { id: 'bowl', name: 'Breakfast Bowl', price: 12.0, cat: 'food', icon: 'salad', image: img('1512621776951-a57141f2eefd') },
  { id: 'wrap', name: 'Halloumi Wrap', price: 10.5, cat: 'food', icon: 'sandwich', image: img('1528735602780-2552fd46c7af') },
  { id: 'soup', name: 'Soup of the Day', price: 7.5, cat: 'food', icon: 'soup', image: img('1547592166-23ac45744acd') },
  { id: 'quiche', name: 'Quiche Lorraine', price: 8.5, cat: 'food', icon: 'egg', image: img('1525351484163-7529414344d8') },
  { id: 'croissant', name: 'Croissant', price: 3.8, cat: 'bakery', icon: 'croissant', image: img('1555507036-ab1f4038808a') },
  { id: 'almond', name: 'Almond Croissant', price: 4.6, cat: 'bakery', icon: 'croissant', image: img('1555507036-ab1f4038808a'), available: false },
  { id: 'banana', name: 'Banana Bread', price: 4.2, cat: 'bakery', icon: 'cake-slice', image: img('1509440159596-0249088772ff') },
  { id: 'muffin', name: 'Blueberry Muffin', price: 3.9, cat: 'bakery', icon: 'cookie', image: img('1607958996333-41aef7caefaa') },
  { id: 'cinnamon', name: 'Cinnamon Roll', price: 4.4, cat: 'bakery', icon: 'cookie', image: img('1558961363-fa8fdf82db35') },
  { id: 'coldbrew', name: 'Cold Brew', price: 5.0, cat: 'cold', icon: 'glass-water', image: img('1461023058943-07fcbe16d735') },
  { id: 'icedlatte', name: 'Iced Latte', price: 5.2, cat: 'cold', icon: 'glass-water', image: img('1517701550927-30cf4ba1dba5') },
  { id: 'oj', name: 'Fresh OJ', price: 5.5, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859') },
  { id: 'sparkling', name: 'Sparkling Water', price: 3.0, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859') },
  { id: 'lemonade', name: 'Lemonade', price: 4.5, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859') },
].map((item) => (BARCODES[item.id] === undefined ? item : { ...item, barcode: BARCODES[item.id]! }));

/**
 * Which of the till's option sets each item takes — demo data only. The
 * connected till reads each item's own groups from the menu tables (menu v1);
 * these three sets are how the demo and the sample data spell the same.
 */
export type SchemeName = 'coffee' | 'tea' | 'cold';
export const SCHEME_OF: Record<string, SchemeName> = {
  espresso: 'coffee',
  flatwhite: 'coffee',
  cappuccino: 'coffee',
  latte: 'coffee',
  americano: 'coffee',
  mocha: 'coffee',
  chai: 'tea',
  earlgrey: 'tea',
  greentea: 'tea',
  matcha: 'tea',
  coldbrew: 'cold',
  icedlatte: 'cold',
  lemonade: 'cold',
};

export const CATS: Category[] = [
  { slug: 'all', name: 'All', icon: 'grid-2x2', tint: null },
  { slug: 'coffee', name: 'Coffee', icon: 'coffee', tint: '#9a6a3c' },
  { slug: 'tea', name: 'Tea', icon: 'cup-soda', tint: '#3f8054' },
  { slug: 'food', name: 'Food', icon: 'utensils', tint: '#c2683a' },
  { slug: 'bakery', name: 'Bakery', icon: 'croissant', tint: '#c19a3e' },
  { slug: 'cold', name: 'Cold Drinks', icon: 'glass-water', tint: '#3a72c2' },
];

/**
 * `note` holds a *message key*, not a sentence: the attention flags are UI
 * status text, so they have to translate with the rest of the chrome, and only
 * this file knows which table says what. The Floor screen resolves it with the
 * table's own `since` in hand for the ones that quote a time.
 */
/** A moment `m` minutes before the demo opened. */
const ago = (m: number): number => Date.now() - m * 60000;

export const TABLES: TableInfo[] = [
  { zone: 'Window', label: 'W1', seats: 2, status: 'occupied', since: ago(12), server: 'SR' },
  { zone: 'Window', label: 'W2', seats: 4, status: 'attention', since: ago(38), server: 'AC', note: 'floor.noteBillRequested' },
  { zone: 'Window', label: 'W3', seats: 2, status: 'open' },
  { zone: 'Patio', label: 'P1', seats: 4, status: 'occupied', since: ago(9), server: 'JD' },
  { zone: 'Patio', label: 'P2', seats: 4, status: 'open' },
  { zone: 'Patio', label: 'P3', seats: 6, status: 'occupied', since: ago(25), server: 'SR' },
  { zone: 'Bar', label: 'B1', seats: 1, status: 'occupied', since: ago(6), server: 'AC' },
  { zone: 'Bar', label: 'B2', seats: 1, status: 'open' },
  { zone: 'Bar', label: 'B3', seats: 1, status: 'open' },
  { zone: 'Bar', label: 'B4', seats: 1, status: 'attention', since: ago(31), server: 'JD', note: 'floor.noteSentAgo' },
  { zone: 'Main', label: 'T10', seats: 4, status: 'open' },
  { zone: 'Main', label: 'T11', seats: 2, status: 'open' },
  { zone: 'Main', label: 'T12', seats: 4, status: 'occupied', since: ago(19), server: 'SR' },
  { zone: 'Main', label: 'T14', seats: 6, status: 'occupied', since: ago(44), server: 'AC' },
  { zone: 'Main', label: 'T15', seats: 2, status: 'open' },
  { zone: 'Main', label: 'T16', seats: 4, status: 'open' },
];

export const ZONE_ORDER = ['Window', 'Patio', 'Bar', 'Main'];

export type DemoSize = 'S' | 'M' | 'L';
export const SIZES: { v: DemoSize; label: string }[] = [
  { v: 'S', label: 'S' },
  { v: 'M', label: 'M' },
  { v: 'L', label: 'L' },
];

/**
 * Milk choices and what each one adds to the cup.
 *
 * The set used to be authored twice and the two copies already disagreed: this
 * list offered Skim, while the pricing rule in calc.ts charged 60¢ for
 * "Oat | Almond | Soy" — a milk nobody could order. One list now, so the sheet
 * cannot show an option the till does not know how to price.
 */
export const MILKS: { v: string; delta: number }[] = [
  { v: 'Whole', delta: 0 },
  { v: 'Oat', delta: 0.6 },
  { v: 'Almond', delta: 0.6 },
  { v: 'Skim', delta: 0 },
];

export const EXTRAS: Extra[] = [
  { v: 'Extra shot', icon: 'plus-circle' },
  { v: 'Vanilla', icon: 'droplet' },
  { v: 'Caramel', icon: 'droplet' },
  { v: 'Hazelnut', icon: 'droplet' },
  { v: 'Decaf', icon: 'moon' },
];

/** Favourites strip on the register (ids in display order). */
export const FAVOURITES = ['flatwhite', 'coldbrew', 'croissant', 'avotoast', 'espresso', 'banana'];

// ---- Seed factories (timestamps computed at call time) ----

/**
 * Build a seeded line, deriving its `key` with the real key function.
 *
 * The keys used to be hand-written string literals and five of the eight had
 * drifted a field (`'croissant||||'` where `keyOf` produces `'croissant|||||'`),
 * so tapping Croissant on the register never merged into the seeded Croissant
 * line — it appended a second one at qty 1.
 */
function line(
  id: string,
  qty: number,
  sent: boolean,
  mods: { size?: DemoSize | null; milk?: string | null; extras?: string[]; note?: string; seat?: number } = {},
): LineItem {
  const { note = '', seat = 0 } = mods;
  const selection = demoSelection(id, mods);
  return { key: keyOf(id, selection, note, seat), id, qty, selection, note, seat, sent };
}

export function seedTicket(): Ticket {
  return {
    number: 1042,
    table: 'T12',
    seats: 4,
    openedAt: Date.now() - 19 * 60000,
    items: [
      line('flatwhite', 2, true, { size: 'M', milk: 'Oat', seat: 1 }),
      line('avotoast', 1, true, { note: 'No chili flakes', seat: 1 }),
      line('coldbrew', 1, false, { size: 'L', extras: ['Extra shot'], seat: 2 }),
      line('croissant', 2, false),
    ],
  };
}

/**
 * The tickets open at the other tables — every occupied table on the floor has
 * one, as it does at a connected till, so tapping it opens ITS ticket (§0.6).
 * The kitchen's cards (below) are three of them.
 */
export function seedHeld(): HeldTicket[] {
  const held = (number: number, table: string, minutes: number, seats: number, items: LineItem[]): HeldTicket => ({
    number,
    table,
    at: Date.now() - minutes * 60000,
    seats,
    items,
  });
  return [
    held(1034, 'W1', 12, 2, [line('flatwhite', 1, true, { size: 'M', milk: 'Whole' }), line('banana', 1, true)]),
    held(1038, 'W2', 38, 4, [line('wrap', 1, true, { note: 'No onion' }), line('soup', 1, true), line('croissant', 2, true), line('americano', 2, true, { size: 'M' })]),
    held(1040, 'P1', 9, 4, [line('bowl', 1, true), line('coldbrew', 2, true, { size: 'M', note: 'Extra ice' })]),
    held(1039, 'P3', 25, 6, [line('latte', 1, true, { size: 'M', milk: 'Oat' }), line('bowl', 1, true), line('oj', 2, true), line('avotoast', 2, true), line('quiche', 1, true)]),
    held(1037, 'B1', 6, 1, [line('latte', 1, true, { size: 'M', milk: 'Almond' }), line('muffin', 1, true)]),
    held(1041, 'B4', 31, 1, [line('cappuccino', 1, true, { size: 'M', milk: 'Whole' }), line('croissant', 1, true)]),
    held(1032, 'T14', 44, 6, [line('bowl', 2, true), line('avotoast', 1, true), line('matcha', 2, true, { size: 'M', milk: 'Oat' }), line('oj', 1, true)]),
  ];
}

export function seedKds(): KdsOrder[] {
  return [
    { number: 1042, table: 'T12', at: Date.now() - 1 * 60000, status: 'new', items: [{ n: 'Flat White', q: 2, m: 'Oat milk' }, { n: 'Avocado Toast', q: 1, m: 'No chili flakes' }] },
    { number: 1040, table: 'P1', at: Date.now() - 4 * 60000, status: 'cooking', items: [{ n: 'Breakfast Bowl', q: 1, m: '' }, { n: 'Cold Brew', q: 2, m: 'Extra ice' }] },
    { number: 1038, table: 'W2', at: Date.now() - 8 * 60000, status: 'cooking', items: [{ n: 'Halloumi Wrap', q: 1, m: 'No onion' }, { n: 'Soup of the Day', q: 1, m: '' }, { n: 'Croissant', q: 2, m: '' }] },
    { number: 1037, table: 'B1', at: Date.now() - 11 * 60000, status: 'ready', items: [{ n: 'Latte', q: 1, m: 'Almond milk' }, { n: 'Blueberry Muffin', q: 1, m: '' }] },
  ];
}

/** Who is clocked in: everyone but Jordan, who went home at lunch. */
/** The comp's pickup queue (COMP state `pickup`), as orders on this till's numbers. */
export function seedPickups(): PickupOrder[] {
  const at = (minutesAgo: number) => Date.now() - minutesAgo * 60000;
  const order = (number: number, name: string, channel: PickupOrder['channel'], items: string[], placed: number, stage: PickupOrder['stage']): PickupOrder => ({
    rid: `pk-${String(number)}`,
    number,
    name,
    mobile: '+1 415 555 01' + String(number).slice(-2),
    channel,
    stage,
    placedAt: at(placed),
    readyAt: stage === 'ready' ? at(1) : null,
    notifiedAt: null,
    items,
  });
  return [
    order(1051, 'Priya S.', 'app', ['2× Flat White', 'Croissant'], 8, 'ready'),
    order(1052, 'Marcus L.', 'web', ['Cold Brew', 'Avocado Toast'], 5, 'making'),
    order(1053, 'Wei Z.', 'app', ['Matcha Latte'], 3, 'making'),
    order(1054, 'Tomas R.', 'phone', ['Breakfast Bowl', 'Fresh OJ'], 1, 'queued'),
  ];
}

export function seedClock(): ClockEntry[] {
  return [
    { staffId: 'sam', since: SHIFT_START - 5 * 60000 },
    { staffId: 'alex', since: SHIFT_START - 2 * 60000 },
  ];
}

/**
 * Today's paid tickets — what Refund lists before this till has closed one.
 * Priced by the demo menu's own rule (item price + chosen options), taxed at
 * the demo rate; the numbers sit below the open tickets' (1037–1042).
 */
export function seedSales(): PastSale[] {
  const groups = demoGroups();
  const sale = (number: number, table: string | null, minutesAgo: number, method: PayMethod, lines: LineItem[]): PastSale => {
    const priced = lines.map((li) => {
      const item = MENU.find((m) => m.id === li.id)!;
      const chosen = groups.filter((g) => g.itemId === li.id).flatMap((g) => g.options.filter((o) => (li.selection[g.id] ?? []).includes(o.id)));
      const unit = Math.round((item.price + chosen.reduce((sum, o) => sum + o.delta, 0)) * 100) / 100;
      return { name: item.name, qty: li.qty, unit, line: Math.round(unit * li.qty * 100) / 100, mod: chosen.map((o) => o.name).join(' · '), refunded: 0 };
    });
    const subtotal = Math.round(priced.reduce((sum, l) => sum + l.line, 0) * 100) / 100;
    const tax = Math.round(subtotal * TAX * 100) / 100;
    return { number, table, closedAt: Date.now() - minutesAgo * 60000, method, lines: priced, subtotal, discount: 0, tax, total: Math.round((subtotal + tax) * 100) / 100, refunded: 0 };
  };
  return [
    sale(1036, 'W1', 14, 'card', [line('flatwhite', 1, true, { size: 'M', milk: 'Whole' }), line('banana', 1, true)]),
    sale(1035, 'P3', 26, 'card', [line('bowl', 2, true), line('oj', 2, true), line('latte', 1, true, { size: 'L', milk: 'Oat' })]),
    sale(1033, null, 48, 'cash', [line('coldbrew', 1, true, { size: 'M' }), line('croissant', 1, true)]),
    sale(1030, 'T11', 95, 'qr', [line('avotoast', 1, true), line('cappuccino', 2, true, { size: 'M', milk: 'Whole' })]),
  ];
}

// ---- menu v1, bookings (read by the store once the till is open) ----

/** The venue's booking rules — the same as the sample data an operator adds. */
export const BOOKING_RULES: BookingRules = {
  opens: '17:00',
  closes: '21:00',
  slotMinutes: 30,
  coversPerSlot: 12,
  daysAhead: 5,
  maxParty: 8,
  holdMinutes: 15,
  cancelHours: 2,
  occasions: ['birthday', 'anniversary', 'business', 'date'],
};

const SETS: Record<SchemeName, ('size' | 'milk' | 'extras')[]> = {
  coffee: ['size', 'milk', 'extras'],
  tea: ['size', 'milk'],
  cold: ['size', 'extras'],
};
const sizeDeltaOf = (v: DemoSize): number => (v === 'S' ? -0.4 : v === 'L' ? 0.7 : 0);
const extraDeltaOf = (v: string): number => (v === 'Extra shot' ? 0.9 : v === 'Decaf' ? 0 : 0.5);
const slug = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A demo group's id, and one of its options' — what a selection names. */
export const demoGroupId = (itemId: string, group: 'size' | 'milk' | 'extras'): string => `${itemId}:${group}`;
// The sample data's own option slugs (seeds/pos.sample.json): s/m/l, whole, extra-shot.
const demoOptionId = (itemId: string, group: 'size' | 'milk' | 'extras', key: string): string => `${itemId}:${group}:${slug(key)}`;

/**
 * Each item's groups of options, from the fixed sizes, milks and extras.
 *
 * Group titles, the size words and the "… milk" frame are the till's own
 * chrome, so they come from its bundles in the reader's language; the milk and
 * extra names themselves are the café's catalogue and pass through as typed.
 */
export function demoGroups(): ModifierGroup[] {
  const out: ModifierGroup[] = [];
  for (const item of MENU) {
    const scheme = SCHEME_OF[item.id];
    if (scheme === undefined) continue;
    for (const group of SETS[scheme]) {
      const options =
        group === 'size'
          ? SIZES.map((o) => ({ key: o.v, name: t(o.v === 'S' ? 'size.small' : o.v === 'L' ? 'size.large' : 'size.medium'), delta: sizeDeltaOf(o.v) }))
          : group === 'milk'
            ? MILKS.map((o) => ({ key: o.v, name: t('mod.milkSuffix', { milk: o.v }), delta: o.delta }))
            : EXTRAS.map((o) => ({ key: o.v, name: o.v, delta: extraDeltaOf(o.v) }));
      out.push({
        id: demoGroupId(item.id, group),
        itemId: item.id,
        slug: group,
        name: t(`sheet.${group}`),
        kind: group === 'extras' ? 'check' : 'radio',
        min: group === 'extras' ? 0 : 1,
        max: group === 'extras' ? EXTRAS.length : 1,
        options: options.map((o) => ({
          id: demoOptionId(item.id, group, o.key),
          slug: slug(o.key),
          name: o.name,
          delta: o.delta,
          available: true,
        })),
      });
    }
  }
  return out;
}

/** A demo line's selection, spelled the old way: a size, a milk, the extras. */
export function demoSelection(itemId: string, choice: { size?: DemoSize | null; milk?: string | null; extras?: string[] }): Selection {
  const out: Selection = {};
  if (choice.size) out[demoGroupId(itemId, 'size')] = [demoOptionId(itemId, 'size', choice.size)];
  if (choice.milk) out[demoGroupId(itemId, 'milk')] = [demoOptionId(itemId, 'milk', choice.milk)];
  if (choice.extras !== undefined && choice.extras.length > 0) {
    out[demoGroupId(itemId, 'extras')] = choice.extras.map((x) => demoOptionId(itemId, 'extras', x));
  }
  return out;
}

/**
 * The demo's bookings: tonight's, one party already seated and one that never
 * came, and two for tomorrow. MR-4829 is the booking "Manage my booking" finds.
 */
export function seedReservations(): Reservation[] {
  const at = (hours: number, minutes: number, days = 0): number => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  };
  const r = (fields: Partial<Reservation> & Pick<Reservation, 'id' | 'code' | 'name' | 'mobile' | 'partySize' | 'startsAt'>): Reservation => ({
    email: null,
    status: 'confirmed',
    channel: 'online',
    tableId: null,
    occasion: null,
    request: null,
    note: null,
    ...fields,
  });
  return [
    r({ id: 'r1', code: 'MR-7Q2K', name: 'Iris Moreau', mobile: '+1 415 555 0123', email: 'iris.m@example.com', partySize: 2, startsAt: at(17, 0), status: 'seated', tableId: 'W1', note: 'Regular — likes the window' }),
    r({ id: 'r2', code: 'MR-3HFD', name: 'Tomás Alves', mobile: '+1 415 555 0111', partySize: 4, startsAt: at(17, 30), status: 'no_show', channel: 'phone' }),
    r({ id: 'r3', code: 'MR-9WXT', name: 'Priya Anand', mobile: '+1 415 555 0112', email: 'priya.a@example.com', partySize: 6, startsAt: at(18, 0), occasion: 'birthday', request: 'Bringing our own cake' }),
    r({ id: 'r4', code: 'MR-4829', name: 'Mara Rossi', mobile: '+1 415 555 0166', email: 'mara.rossi@example.com', partySize: 2, startsAt: at(19, 0), occasion: 'anniversary', request: 'A quiet table, if possible' }),
    r({ id: 'r5', code: 'MR-K2PM', name: 'Kenji Watanabe', mobile: '+1 415 555 0114', partySize: 3, startsAt: at(19, 30), channel: 'phone', request: 'Allergy: shellfish' }),
    r({ id: 'r6', code: 'MR-B7NQ', name: 'Lena Fischer', mobile: '+1 415 555 0104', email: 'lena.f@example.com', partySize: 2, startsAt: at(18, 0, 1), occasion: 'date' }),
    r({ id: 'r7', code: 'MR-D3VW', name: 'Nora Bennett', mobile: '+1 415 555 0150', partySize: 8, startsAt: at(19, 30, 1), channel: 'phone', occasion: 'business', request: 'Needs one long table' }),
  ];
}

