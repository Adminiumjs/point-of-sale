// Built-in demo data — ported verbatim from the design comp. In production this
// is where the DataSource (see source.ts) would hand back live data from an
// Adminium instance; today it's a fixed in-memory catalogue so the example runs
// with zero backend.

import { keyOf } from './key';
import type {
  Category,
  Extra,
  HeldTicket,
  KdsOrder,
  LineItem,
  MenuItem,
  Size,
  Staff,
  ShiftTotals,
  TableInfo,
  Ticket,
} from './types';

/** The demo venue. Authored once: the top bar's brand mark still read "M", a
 * leftover from before the rebrand, while every other surface said this. */
export const BRAND = 'Daybreak Coffee';
export const BRAND_INITIAL = BRAND.charAt(0);

export const TAX = 0.0825;

/** The tax row's label. Derived from TAX so the two cannot drift — it used to
 * be the literal "Tax · 8.25%", written out in both the register pane and the
 * payment summary. */
export const TAX_LABEL = 'Tax · ' + String(Math.round(TAX * 10000) / 100) + '%';

/** Tip presets as fractions, indexed 0..3 → No tip / 10% / 15% / 20%. */
export const TIP_PRESETS = [0, 0.1, 0.15, 0.2];

export const SHIFT_START = Date.now() - 192 * 60000;

export const SHIFT: ShiftTotals = {
  orders: 47,
  gross: 842.6,
  card: 611.4,
  cash: 168.2,
  qr: 63.0,
  tips: 92.5,
  refunds: 12.0,
  comps: 18.5,
};

export const STAFF: Staff[] = [
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', role: 'Barista', pin: '1234' },
  { id: 'alex', name: 'Alex Chen', initials: 'AC', role: 'Shift lead', pin: '2468' },
  { id: 'jordan', name: 'Jordan Diaz', initials: 'JD', role: 'Barista', pin: '1357' },
];

/** Real product photography (Unsplash). Same catalogue as db/seed.sql. */
const IMG = 'https://images.unsplash.com/photo-';
const IMG_Q = '?w=600&q=75&auto=format&fit=crop';
const img = (id: string): string => IMG + id + IMG_Q;

export const MENU: MenuItem[] = [
  { id: 'espresso', name: 'Espresso', price: 3.2, cat: 'coffee', icon: 'coffee', image: img('1510707577719-ae7c14805e3a'), mods: 'coffee' },
  { id: 'flatwhite', name: 'Flat White', price: 4.5, cat: 'coffee', icon: 'coffee', image: img('1509042239860-f550ce710b93'), mods: 'coffee' },
  { id: 'cappuccino', name: 'Cappuccino', price: 4.2, cat: 'coffee', icon: 'coffee', image: img('1541167760496-1628856ab772'), mods: 'coffee' },
  { id: 'latte', name: 'Latte', price: 4.8, cat: 'coffee', icon: 'coffee', image: img('1541167760496-1628856ab772'), mods: 'coffee' },
  { id: 'americano', name: 'Americano', price: 3.6, cat: 'coffee', icon: 'coffee', image: img('1510707577719-ae7c14805e3a'), mods: 'coffee' },
  { id: 'mocha', name: 'Mocha', price: 5.2, cat: 'coffee', icon: 'coffee', image: img('1509042239860-f550ce710b93'), mods: 'coffee' },
  { id: 'chai', name: 'Chai Latte', price: 4.6, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574'), mods: 'tea' },
  { id: 'earlgrey', name: 'Earl Grey', price: 3.4, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574'), mods: 'tea' },
  { id: 'greentea', name: 'Green Tea', price: 3.4, cat: 'tea', icon: 'cup-soda', image: img('1544787219-7f47ccb76574'), mods: 'tea' },
  { id: 'matcha', name: 'Matcha Latte', price: 5.4, cat: 'tea', icon: 'cup-soda', image: img('1536256263959-770b48d82b0a'), mods: 'tea' },
  { id: 'avotoast', name: 'Avocado Toast', price: 9.5, cat: 'food', icon: 'sandwich', image: img('1541519227354-08fa5d50c44d'), mods: null },
  { id: 'bowl', name: 'Breakfast Bowl', price: 12.0, cat: 'food', icon: 'salad', image: img('1512621776951-a57141f2eefd'), mods: null },
  { id: 'wrap', name: 'Halloumi Wrap', price: 10.5, cat: 'food', icon: 'sandwich', image: img('1528735602780-2552fd46c7af'), mods: null },
  { id: 'soup', name: 'Soup of the Day', price: 7.5, cat: 'food', icon: 'soup', image: img('1547592166-23ac45744acd'), mods: null },
  { id: 'quiche', name: 'Quiche Lorraine', price: 8.5, cat: 'food', icon: 'egg', image: img('1525351484163-7529414344d8'), mods: null },
  { id: 'croissant', name: 'Croissant', price: 3.8, cat: 'bakery', icon: 'croissant', image: img('1555507036-ab1f4038808a'), mods: null },
  { id: 'almond', name: 'Almond Croissant', price: 4.6, cat: 'bakery', icon: 'croissant', image: img('1555507036-ab1f4038808a'), available: false, mods: null },
  { id: 'banana', name: 'Banana Bread', price: 4.2, cat: 'bakery', icon: 'cake-slice', image: img('1509440159596-0249088772ff'), mods: null },
  { id: 'muffin', name: 'Blueberry Muffin', price: 3.9, cat: 'bakery', icon: 'cookie', image: img('1607958996333-41aef7caefaa'), mods: null },
  { id: 'cinnamon', name: 'Cinnamon Roll', price: 4.4, cat: 'bakery', icon: 'cookie', image: img('1558961363-fa8fdf82db35'), mods: null },
  { id: 'coldbrew', name: 'Cold Brew', price: 5.0, cat: 'cold', icon: 'glass-water', image: img('1461023058943-07fcbe16d735'), mods: 'cold' },
  { id: 'icedlatte', name: 'Iced Latte', price: 5.2, cat: 'cold', icon: 'glass-water', image: img('1517701550927-30cf4ba1dba5'), mods: 'cold' },
  { id: 'oj', name: 'Fresh OJ', price: 5.5, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859'), mods: null },
  { id: 'sparkling', name: 'Sparkling Water', price: 3.0, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859'), mods: null },
  { id: 'lemonade', name: 'Lemonade', price: 4.5, cat: 'cold', icon: 'glass-water', image: img('1621263764928-df1444c5e859'), mods: 'cold' },
];

export const CATS: Category[] = [
  { slug: 'all', name: 'All', icon: 'grid-2x2', tint: null },
  { slug: 'coffee', name: 'Coffee', icon: 'coffee', tint: '#9a6a3c' },
  { slug: 'tea', name: 'Tea', icon: 'cup-soda', tint: '#3f8054' },
  { slug: 'food', name: 'Food', icon: 'utensils', tint: '#c2683a' },
  { slug: 'bakery', name: 'Bakery', icon: 'croissant', tint: '#c19a3e' },
  { slug: 'cold', name: 'Cold Drinks', icon: 'glass-water', tint: '#3a72c2' },
];

export const TABLES: TableInfo[] = [
  { zone: 'Window', label: 'W1', seats: 2, status: 'occupied', total: 18.4, since: 12, server: 'SR' },
  { zone: 'Window', label: 'W2', seats: 4, status: 'attention', total: 52.0, since: 38, server: 'AC', note: 'Bill requested' },
  { zone: 'Window', label: 'W3', seats: 2, status: 'open' },
  { zone: 'Patio', label: 'P1', seats: 4, status: 'occupied', total: 34.2, since: 9, server: 'JD' },
  { zone: 'Patio', label: 'P2', seats: 4, status: 'open' },
  { zone: 'Patio', label: 'P3', seats: 6, status: 'occupied', total: 96.5, since: 25, server: 'SR' },
  { zone: 'Bar', label: 'B1', seats: 1, status: 'occupied', total: 12.8, since: 6, server: 'AC' },
  { zone: 'Bar', label: 'B2', seats: 1, status: 'open' },
  { zone: 'Bar', label: 'B3', seats: 1, status: 'open' },
  { zone: 'Bar', label: 'B4', seats: 1, status: 'attention', total: 9.2, since: 31, server: 'JD', note: 'Sent 31m ago' },
  { zone: 'Main', label: 'T10', seats: 4, status: 'open' },
  { zone: 'Main', label: 'T11', seats: 2, status: 'open' },
  { zone: 'Main', label: 'T12', seats: 4, status: 'occupied', since: 19, server: 'SR' },
  { zone: 'Main', label: 'T14', seats: 6, status: 'occupied', total: 61.0, since: 44, server: 'AC' },
  { zone: 'Main', label: 'T15', seats: 2, status: 'open' },
  { zone: 'Main', label: 'T16', seats: 4, status: 'open' },
];

export const ZONE_ORDER = ['Window', 'Patio', 'Bar', 'Main'];

export const SIZES: { v: Size; label: string }[] = [
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
  mods: { size?: Size | null; milk?: string | null; extras?: string[]; note?: string; seat?: number } = {},
): LineItem {
  const { size = null, milk = null, extras = [], note = '', seat = 0 } = mods;
  return { key: keyOf(id, size, milk, extras, note, seat), id, qty, size, milk, extras, note, seat, sent };
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

export function seedHeld(): HeldTicket[] {
  return [
    {
      number: 1039,
      table: 'T4',
      at: Date.now() - 6 * 60000,
      seats: 2,
      items: [
        line('latte', 1, true, { size: 'M', milk: 'Oat' }),
        line('bowl', 1, true),
        line('oj', 2, true),
      ],
    },
    {
      number: 1041,
      table: 'B2',
      at: Date.now() - 2 * 60000,
      seats: 1,
      items: [line('cappuccino', 1, false, { size: 'M' }), line('croissant', 1, false)],
    },
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
