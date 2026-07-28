// Pure money/label math, ported 1:1 from the design comp. Split and cent
// rounding is deliberately identical to the comp — do not "simplify" the
// epsilons (0.005) or the last-payer remainder logic; the ledger depends on it.

import { CATS, MENU, MILKS, TAX, TIP_PRESETS, seedTicket } from '../data/demo';
import type { Discount, LineItem, MenuItem, Sale, Size, Split, ServiceMode } from '../data/types';

/** The slice of store state the pricing helpers read. */
export interface PricingState {
  ticket: { items: LineItem[]; table: string | null; seats: number };
  discount: Discount | null;
  tip: number | 'c';
  tipCustom: string;
  splits: Split[];
  splitMode: 'none' | 'even' | 'amount';
  splitN: number;
  splitCustom: string;
}

export const money = (n: number): string =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const hexToRgba = (hex: string, a: number): string => {
  let h = (hex || '#4f46e5').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};

export const itemById = (id: string): MenuItem | undefined => MENU.find((m) => m.id === id);

export const catTint = (slug: string): string => {
  const c = CATS.find((x) => x.slug === slug);
  return c && c.tint ? c.tint : 'var(--accent)';
};

export const tintOf = (id: string): string => {
  const m = itemById(id);
  return m ? catTint(m.cat) : 'var(--accent)';
};

// ---- Time labels ----
export const mins = (ts: number): number => Math.max(0, Math.round((Date.now() - ts) / 60000));
export const agoLabel = (ts: number): string => {
  const m = mins(ts);
  return m < 1 ? 'just now' : m + 'm ago';
};
export const dur = (ms: number): string => {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return (h ? h + 'h ' : '') + (m % 60) + 'm';
};

export const tableName = (l: string | null | undefined, mode: ServiceMode): string => {
  if (!l || l === '—') return mode === 'retail' ? 'Walk-in sale' : 'New ticket';
  const map: Record<string, string> = { T: 'Table ', W: 'Window ', P: 'Patio ', B: 'Bar ' };
  const pre = map[l[0]];
  return pre ? pre + l.slice(1) : l;
};

// ---- Pricing deltas ----
export const sizeDelta = (s?: Size | null): number => (s === 'S' ? -0.4 : s === 'L' ? 0.7 : 0);
export const milkDelta = (m?: string | null): number => MILKS.find((x) => x.v === m)?.delta ?? 0;
export const extraDelta = (x: string): number => (x === 'Extra shot' ? 0.9 : x === 'Decaf' ? 0 : 0.5);

export const lineUnit = (li: LineItem): number => {
  const m = itemById(li.id);
  if (!m) return 0;
  let p = m.price;
  if (li.size) p += sizeDelta(li.size);
  if (li.milk) p += milkDelta(li.milk);
  (li.extras || []).forEach((x) => {
    p += extraDelta(x);
  });
  return p;
};
export const lineTotal = (li: LineItem): number => lineUnit(li) * li.qty;
export const itemsSub = (items: LineItem[]): number => (items || []).reduce((s, li) => s + lineTotal(li), 0);

/**
 * Round to whole cents.
 *
 * `money()` formats to two decimals, which rounds each figure independently at
 * render time. If the underlying numbers keep their binary-float residue, the
 * rows a customer reads can fail to add up to the total printed beneath them —
 * the receipt says 12.34 + 1.02 and then prints 13.37. Every figure that leaves
 * this module for a screen is rounded here first, and the totals are derived
 * from the rounded parts so the arithmetic on screen is the arithmetic done.
 */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Ticket-level money (depends on discount / tip / splits) ----

// Raw (unrounded) goods figures. Internal: they are the base the percentages
// are assessed on, not something a screen ever prints.
const rawSub = (s: PricingState): number => itemsSub(s.ticket.items);
const rawDisc = (s: PricingState): number => {
  const d = s.discount;
  if (!d) return 0;
  const sub = rawSub(s);
  const off = d.kind === 'pct' ? (sub * d.value) / 100 : d.kind === 'comp' ? sub : d.value || 0;
  /*
   * Clamp every kind, not just the fixed amount.
   *
   * `amt` was already capped at the subtotal but `pct` was not, so a rate over
   * 100 produced a discount larger than the goods: `netSub` still floored the
   * bill at zero, but the register printed "Subtotal $33.90 / −$50.85" above a
   * Total of $0.00 — rows that contradicted their own total. No preset in
   * DiscountModal exceeds 100%, but this is a template people fork.
   */
  return Math.min(Math.max(0, off), sub);
};

export const subtotal = (s: PricingState): number => round2(rawSub(s));
export const discountAmt = (s: PricingState): number => round2(rawDisc(s));
/** The taxable/tippable base — deliberately unrounded. */
export const netSub = (s: PricingState): number => Math.max(0, rawSub(s) - rawDisc(s));
export const tax = (s: PricingState): number => round2(netSub(s) * TAX);

/** What tip preset `i` is worth on this ticket — the one authority for the
 * amount, so the preset buttons cannot quote a figure the total disagrees with. */
export const tipFor = (s: PricingState, i: number): number => round2(netSub(s) * (TIP_PRESETS[i] || 0));

export const tipAmt = (s: PricingState): number => {
  if (s.tip === 'c') return Math.max(0, round2(parseFloat(s.tipCustom || '0') || 0));
  return tipFor(s, s.tip);
};

/** Goods + tax, no tip — what the register shows before the payment screen. */
export const regTotal = (s: PricingState): number =>
  round2(Math.max(0, subtotal(s) - discountAmt(s)) + tax(s));

/**
 * Goods + tax for a bare list of lines — the held tray and the move sheet,
 * which show parked tickets and have no discount of their own.
 *
 * Both of those screens used to write `itemsSub(items) * (1 + TAX)` inline: a
 * third and fourth spelling of the grand-total rule, unrounded, so a parked
 * ticket could be quoted a cent away from what the register charged for it.
 * Equal to `regTotal` for an undiscounted ticket, which is asserted in the
 * tests.
 */
export const linesTotal = (items: LineItem[]): number => {
  const raw = itemsSub(items);
  return round2(round2(raw) + round2(raw * TAX));
};
export const total = (s: PricingState): number => round2(regTotal(s) + tipAmt(s));
export const paid = (s: PricingState): number => s.splits.reduce((a, x) => a + x.amount, 0);
export const remaining = (s: PricingState): number => Math.max(0, total(s) - paid(s));

// Even-split with last-payer remainder absorption; fraction split absorbs to
// the remaining balance. Ported exactly from the comp's chargeTarget().
export const chargeTarget = (s: PricingState): number => {
  const t = total(s);
  const rem = remaining(s);
  const paidv = paid(s);
  if (s.splitMode === 'even' && s.splitN > 0) {
    const base = Math.round((t / s.splitN) * 100) / 100;
    const done = Math.round(paidv / (base || 1));
    return done >= s.splitN - 1 ? rem : Math.min(base, rem);
  }
  if (s.splitMode === 'amount') {
    const c = Math.min(parseFloat(s.splitCustom || '0') || 0, rem);
    return c > 0 ? c : rem;
  }
  return rem;
};

export const modLabel = (li: LineItem): string => {
  const parts: string[] = [];
  if (li.size) parts.push(li.size === 'S' ? 'Small' : li.size === 'L' ? 'Large' : 'Medium');
  if (li.milk && li.milk !== 'Whole') parts.push(li.milk + ' milk');
  (li.extras || []).forEach((x) => parts.push(x));
  return parts.join(' · ');
};

// Synthetic sale for the Receipt view when no real sale has been finalised yet
// (e.g. opening it straight from the dock). Mirrors the comp's demoSale().
export const demoSale = (ticket: { items: LineItem[]; number: number; table: string | null }, staffName: string): Sale => {
  const items = ticket.items.length ? ticket.items : seedTicket().items;
  const sub = round2(itemsSub(items));
  const t = round2(itemsSub(items) * TAX);
  // The 15% preset, not a second hand-written 0.15.
  const tip = round2(itemsSub(items) * TIP_PRESETS[2]);
  const grand = round2(sub + t + tip);
  return {
    number: ticket.number || 1042,
    table: ticket.table || 'T12',
    items: items.map((x) => ({ name: itemById(x.id)?.name ?? x.id, qty: x.qty, unit: lineUnit(x), line: lineTotal(x), mod: modLabel(x), note: x.note })),
    subtotal: sub,
    discount: 0,
    discountLabel: '',
    tax: t,
    tip,
    total: grand,
    splits: [{ method: 'card', amount: grand }],
    change: 0,
    at: Date.now(),
    staff: staffName,
  };
};

// Re-exported so existing callers keep importing it from here; the definition
// lives in data/key.ts so the seed data can derive its keys from the same code.
export { keyOf } from '../data/key';
