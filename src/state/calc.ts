// Pure money/label math, ported 1:1 from the design comp. Split and cent
// rounding is deliberately identical to the comp — do not "simplify" the
// epsilons (0.005) or the last-payer remainder logic; the ledger depends on it.

import { CATS, MENU, TAX, TIP_PRESETS, seedTicket } from '../data/demo';
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

// Layered procedural tile background from a category tint (comp's phBg/phIco).
export const phBg = (tint: string, dark: boolean): string => {
  const hi = dark
    ? 'radial-gradient(120% 82% at 50% 0%, rgba(255,255,255,.06), transparent 55%)'
    : 'radial-gradient(120% 82% at 50% 0%, rgba(255,255,255,.6), transparent 58%)';
  const ped = 'radial-gradient(52% 22% at 50% 82%, ' + hexToRgba(tint, dark ? 0.34 : 0.22) + ', transparent 72%)';
  const b = dark
    ? 'linear-gradient(158deg, ' + hexToRgba(tint, 0.34) + ', ' + hexToRgba(tint, 0.15) + ')'
    : 'linear-gradient(158deg, ' + hexToRgba(tint, 0.2) + ', ' + hexToRgba(tint, 0.08) + ')';
  return hi + ', ' + ped + ', ' + b;
};

export const phIco = (tint: string, dark: boolean): string => hexToRgba(tint, dark ? 0.7 : 0.58);

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
export const milkDelta = (m?: string | null): number => (m === 'Oat' || m === 'Almond' || m === 'Soy' ? 0.6 : 0);
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

// ---- Ticket-level money (depends on discount / tip / splits) ----
export const subtotal = (s: PricingState): number => itemsSub(s.ticket.items);
export const discountAmt = (s: PricingState): number => {
  const d = s.discount;
  if (!d) return 0;
  const sub = subtotal(s);
  if (d.kind === 'pct') return (sub * d.value) / 100;
  if (d.kind === 'comp') return sub;
  return Math.min(d.value || 0, sub);
};
export const netSub = (s: PricingState): number => Math.max(0, subtotal(s) - discountAmt(s));
export const tax = (s: PricingState): number => netSub(s) * TAX;
export const regTotal = (s: PricingState): number => netSub(s) + tax(s);
export const tipAmt = (s: PricingState): number => {
  if (s.tip === 'c') return parseFloat(s.tipCustom || '0') || 0;
  const p = TIP_PRESETS[s.tip] || 0;
  return netSub(s) * p;
};
export const total = (s: PricingState): number => netSub(s) + tax(s) + tipAmt(s);
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
  const sub = itemsSub(items);
  const t = sub * TAX;
  const tip = sub * 0.15;
  return {
    number: ticket.number || 1042,
    table: ticket.table || 'T12',
    items: items.map((x) => ({ name: itemById(x.id)?.name ?? x.id, qty: x.qty, unit: lineUnit(x), line: lineTotal(x), mod: modLabel(x), note: x.note })),
    subtotal: sub,
    tax: t,
    tip,
    total: sub + t + tip,
    splits: [{ method: 'card', amount: sub + t + tip }],
    change: 0,
    at: Date.now(),
    staff: staffName,
  };
};

export const keyOf = (
  id: string,
  size?: Size | null,
  milk?: string | null,
  extras?: string[],
  note?: string,
  seat?: number,
): string =>
  [
    id,
    size || '',
    milk || '',
    (extras || []).slice().sort().join('+'),
    note ? 'n:' + note : '',
    seat ? 's' + seat : '',
  ].join('|');
