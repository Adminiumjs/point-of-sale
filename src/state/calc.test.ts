import { describe, expect, it } from 'vitest';
import { BRAND, BRAND_INITIAL, MILKS, TAX, TIP_PRESETS, seedTicket } from '../data/demo';
import { keyOf } from '../data/key';
import type { Discount, LineItem, Size, Split } from '../data/types';
import {
  chargeTarget,
  discountAmt,
  extraDelta,
  itemsSub,
  lineTotal,
  lineUnit,
  linesTotal,
  milkDelta,
  modLabel,
  money,
  netSub,
  paid,
  regTotal,
  remaining,
  round2,
  sizeDelta,
  subtotal,
  tableName,
  tax,
  taxLabel,
  tipAmt,
  tipFor,
  total,
} from './calc';
import type { PricingState } from './calc';

// ---- helpers ----

const line = (
  id: string,
  qty = 1,
  mods: { size?: Size | null; milk?: string | null; extras?: string[]; note?: string; seat?: number } = {},
): LineItem => {
  const { size = null, milk = null, extras = [], note = '', seat = 0 } = mods;
  return { key: keyOf(id, size, milk, extras, note, seat), id, qty, size, milk, extras, note, seat, sent: false };
};

const state = (over: Partial<PricingState> & { items?: LineItem[] } = {}): PricingState => ({
  ticket: { items: over.items || [], table: 'T12', seats: 4 },
  discount: null,
  tip: 0,
  tipCustom: '',
  splits: [],
  splitMode: 'none',
  splitN: 0,
  splitCustom: '',
  ...over,
});

/** Parse a rendered "$1,234.56" back into a number, so assertions can be made
 * against exactly what the screen prints rather than the float behind it. */
const read = (s: string): number => Number(s.replace(/[$,]/g, ''));

// ---- unit prices ----

describe('modifier deltas', () => {
  it('sizes', () => {
    expect(sizeDelta('S')).toBe(-0.4);
    expect(sizeDelta('M')).toBe(0);
    expect(sizeDelta('L')).toBe(0.7);
    expect(sizeDelta(null)).toBe(0);
    expect(sizeDelta()).toBe(0);
  });

  it('milks — only the alternatives cost extra', () => {
    expect(milkDelta('Whole')).toBe(0);
    expect(milkDelta('Skim')).toBe(0);
    expect(milkDelta('Oat')).toBe(0.6);
    expect(milkDelta('Almond')).toBe(0.6);
    expect(milkDelta(null)).toBe(0);
  });

  it('extras — an extra shot costs more, decaf is free, the syrups are flat', () => {
    expect(extraDelta('Extra shot')).toBe(0.9);
    expect(extraDelta('Decaf')).toBe(0);
    expect(extraDelta('Vanilla')).toBe(0.5);
    expect(extraDelta('Caramel')).toBe(0.5);
  });
});

describe('lineUnit', () => {
  it('is the base price with no modifiers', () => {
    expect(lineUnit(line('espresso'))).toBe(3.2);
  });

  it('adds size, milk and every extra', () => {
    expect(lineUnit(line('coldbrew', 1, { size: 'L', extras: ['Extra shot'] }))).toBeCloseTo(6.6, 10);
    expect(lineUnit(line('flatwhite', 1, { size: 'M', milk: 'Oat' }))).toBeCloseTo(5.1, 10);
    expect(lineUnit(line('latte', 1, { size: 'S', milk: 'Almond', extras: ['Vanilla', 'Decaf'] }))).toBeCloseTo(
      4.8 - 0.4 + 0.6 + 0.5 + 0,
      10,
    );
  });

  /*
   * A line whose menu item no longer exists prices at zero rather than NaN.
   * Worth pinning: it means a delisted product is given away rather than
   * crashing the till, and any fix has to make that a deliberate choice.
   */
  it('prices an unknown item at zero', () => {
    expect(lineUnit(line('no-such-item'))).toBe(0);
  });

  it('lineTotal multiplies by quantity', () => {
    expect(lineTotal(line('espresso', 3))).toBeCloseTo(9.6, 10);
  });
});

// ---- ticket money ----

describe('the seeded ticket', () => {
  const s = state({ items: seedTicket().items });

  it('subtotals to 33.90', () => {
    expect(subtotal(s)).toBe(33.9);
    expect(itemsSub(seedTicket().items)).toBeCloseTo(33.9, 10);
  });

  it('taxes the goods and totals', () => {
    expect(tax(s)).toBe(2.8);
    expect(regTotal(s)).toBe(36.7);
  });
});

describe('discounts', () => {
  const items = seedTicket().items; // 33.90

  it('a percentage comes off the goods', () => {
    const s = state({ items, discount: { kind: 'pct', value: 15, label: '15% off' } });
    expect(subtotal(s)).toBe(33.9);
    expect(discountAmt(s)).toBe(5.09); // 5.085, rounded to the cent
    expect(netSub(s)).toBeCloseTo(28.815, 10);
  });

  it('a fixed amount comes off the goods', () => {
    const s = state({ items, discount: { kind: 'amt', value: 5, label: '$5 off' } });
    expect(discountAmt(s)).toBe(5);
    expect(netSub(s)).toBeCloseTo(28.9, 10);
  });

  it('a comp zeroes the ticket', () => {
    const s = state({ items, discount: { kind: 'comp', value: 0, label: 'On the house' } });
    expect(discountAmt(s)).toBe(33.9);
    expect(netSub(s)).toBe(0);
    expect(tax(s)).toBe(0);
    expect(total(s)).toBe(0);
  });

  it('never bills a negative amount, however large the discount', () => {
    const over: Discount[] = [
      { kind: 'amt', value: 1000, label: 'oops' },
      { kind: 'pct', value: 150, label: 'oops' },
    ];
    over.forEach((d) => {
      const s = state({ items, discount: d });
      expect(netSub(s)).toBe(0);
      expect(total(s)).toBe(0);
      expect(discountAmt(s)).toBeLessThanOrEqual(subtotal(s));
    });
  });

  it('tax is assessed after the discount, not before', () => {
    const plain = state({ items });
    const cut = state({ items, discount: { kind: 'pct', value: 50, label: 'half' } });
    expect(tax(cut)).toBeLessThan(tax(plain));
    expect(tax(cut)).toBe(round2((33.9 / 2) * TAX));
  });
});

describe('tips', () => {
  const items = seedTicket().items;

  it('the preset buttons quote exactly what the total will charge', () => {
    const disc = { kind: 'pct', value: 15, label: '15% off' } as const;
    [0, 1, 2, 3].forEach((i) => {
      const s = state({ items, discount: disc, tip: i });
      expect(tipFor(s, i)).toBe(tipAmt(s));
    });
  });

  /*
   * The regression this pins: the preset buttons used to preview
   * `subtotal * rate` while the Tip row charged `netSub * rate`, so a
   * discounted ticket showed one number on the button and another two inches
   * below it.
   */
  it('a tip is a share of the discounted goods, not the gross', () => {
    const s = state({ items, discount: { kind: 'pct', value: 50, label: 'half' }, tip: 3 });
    expect(tipFor(s, 3)).toBe(round2((33.9 / 2) * 0.2));
    expect(tipFor(s, 3)).not.toBe(round2(33.9 * 0.2));
  });

  it('no tip is zero', () => {
    expect(tipAmt(state({ items, tip: 0 }))).toBe(0);
    expect(TIP_PRESETS[0]).toBe(0);
  });

  it('a custom tip is never negative', () => {
    expect(tipAmt(state({ items, tip: 'c', tipCustom: '-40' }))).toBe(0);
    expect(tipAmt(state({ items, tip: 'c', tipCustom: '' }))).toBe(0);
    expect(tipAmt(state({ items, tip: 'c', tipCustom: 'abc' }))).toBe(0);
    expect(tipAmt(state({ items, tip: 'c', tipCustom: '4.5' }))).toBe(4.5);
  });
});

// ---- the headline invariant ----

describe('the figures on screen add up', () => {
  /*
   * Every row a customer can read is rounded to the cent independently by
   * `money()`. If the total is derived from unrounded floats it can disagree
   * with the sum of the rows printed above it by a cent — the customer is
   * billed something other than the arithmetic they were shown.
   */
  const baskets: { name: string; items: LineItem[]; discount: Discount | null; tip: number }[] = [
    { name: 'seeded ticket, no discount, 15% tip', items: seedTicket().items, discount: null, tip: 2 },
    {
      name: 'seeded ticket, 15% off, 15% tip',
      items: seedTicket().items,
      discount: { kind: 'pct', value: 15, label: '15% off' },
      tip: 2,
    },
    {
      name: 'awkward thirds',
      items: [line('espresso', 3), line('chai', 1, { size: 'S' })],
      discount: { kind: 'pct', value: 33, label: '33% off' },
      tip: 3,
    },
    {
      name: 'single item, 7% off, 10% tip',
      items: [line('bowl', 1)],
      discount: { kind: 'pct', value: 7, label: '7% off' },
      tip: 1,
    },
    { name: 'large mixed basket', items: [line('mocha', 7, { size: 'L', milk: 'Oat', extras: ['Extra shot'] }), line('quiche', 3)], discount: { kind: 'pct', value: 12, label: '12% off' }, tip: 3 },
  ];

  it.each(baskets.map((b) => [b.name, b] as const))('%s', (_name, b) => {
    const s = state({ items: b.items, discount: b.discount, tip: b.tip });

    // Read the figures back out of the rendered strings, exactly as printed.
    const sub = read(money(subtotal(s)));
    const disc = read(money(discountAmt(s)));
    const t = read(money(tax(s)));
    const tip = read(money(tipAmt(s)));
    const grand = read(money(total(s)));

    expect(round2(sub - disc + t + tip)).toBe(grand);
    // and the register's pre-tip total is the same sum without the tip
    expect(round2(sub - disc + t)).toBe(read(money(regTotal(s))));
  });

  it('the printed line totals sum to the printed subtotal', () => {
    const items = seedTicket().items;
    const s = state({ items });
    const rows = items.reduce((n, li) => round2(n + read(money(lineTotal(li)))), 0);
    expect(rows).toBe(read(money(subtotal(s))));
  });

  it('every figure that reaches a screen is a whole number of cents', () => {
    const s = state({
      items: seedTicket().items,
      discount: { kind: 'pct', value: 13, label: '13% off' },
      tip: 2,
    });
    [subtotal, discountAmt, tax, tipAmt, regTotal, total].forEach((f) => {
      const v = f(s);
      expect(round2(v)).toBe(v);
    });
  });
});

describe('the held tray and the register agree', () => {
  /*
   * The held tray and the move sheet each re-wrote the grand-total rule inline
   * as `itemsSub(items) * (1 + TAX)`, unrounded — a third and fourth spelling
   * of the same arithmetic.
   */
  it('linesTotal matches regTotal for an undiscounted ticket', () => {
    const cases = [
      seedTicket().items,
      [line('espresso', 3), line('chai', 1, { size: 'S' })],
      [line('mocha', 7, { size: 'L', milk: 'Oat', extras: ['Extra shot'] })],
      [],
    ];
    cases.forEach((items) => {
      expect(linesTotal(items)).toBe(regTotal(state({ items })));
    });
  });
});

describe('the milk list is the pricing rule', () => {
  it('every milk the sheet offers has a price the till knows', () => {
    MILKS.forEach((m) => {
      expect(milkDelta(m.v)).toBe(m.delta);
    });
  });

  /* The rule used to charge for "Soy", which the sheet has never offered. */
  it('a milk that is not offered costs nothing rather than silently charging', () => {
    expect(MILKS.some((m) => m.v === 'Soy')).toBe(false);
    expect(milkDelta('Soy')).toBe(0);
  });
});

describe('the brand is written once', () => {
  it('the mark is the first letter of the name', () => {
    expect(BRAND_INITIAL).toBe(BRAND.charAt(0));
    expect(BRAND).toBe('Daybreak Coffee');
  });
});

describe('round2', () => {
  it('rounds to the cent', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68); // the classic float case
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-0.001)).toBe(-0);
  });
});

// ---- splits ----

describe('splits', () => {
  const items = seedTicket().items; // total 36.70 with no tip

  it('paid sums the recorded splits and remaining never goes negative', () => {
    const splits: Split[] = [{ method: 'cash', amount: 20 }, { method: 'card', amount: 30 }];
    const s = state({ items, splits });
    expect(paid(s)).toBe(50);
    expect(remaining(s)).toBe(0);
  });

  it('with no split mode the charge is the whole remaining balance', () => {
    const s = state({ items });
    expect(chargeTarget(s)).toBe(total(s));
  });

  /*
   * The important property of an even split: the shares must sum to exactly the
   * total. Rounding each share to the cent leaves a remainder, which the last
   * payer has to absorb — otherwise the ticket can never close.
   */
  it.each([2, 3, 4, 5, 6, 7])('an even %i-way split collects exactly the total', (n) => {
    let s = state({ items, tip: 2, splitMode: 'even', splitN: n });
    const grand = total(s);
    const collected: number[] = [];
    for (let i = 0; i < n; i++) {
      const amt = chargeTarget(s);
      expect(amt).toBeGreaterThan(0);
      collected.push(amt);
      s = { ...s, splits: s.splits.concat([{ method: 'card', amount: amt }]) };
    }
    expect(round2(collected.reduce((a, b) => a + b, 0))).toBe(grand);
    expect(remaining(s)).toBe(0);
  });

  it('charging by amount takes the requested share, capped at the balance', () => {
    const s = state({ items, splitMode: 'amount', splitCustom: '10' });
    expect(chargeTarget(s)).toBe(10);
    const over = state({ items, splitMode: 'amount', splitCustom: '9999' });
    expect(chargeTarget(over)).toBe(total(over));
  });

  it('an empty or unparseable custom amount falls back to the whole balance', () => {
    expect(chargeTarget(state({ items, splitMode: 'amount', splitCustom: '' }))).toBe(total(state({ items })));
    expect(chargeTarget(state({ items, splitMode: 'amount', splitCustom: 'abc' }))).toBe(total(state({ items })));
  });

  it('a comped ticket has nothing left to charge', () => {
    const s = state({ items, discount: { kind: 'comp', value: 0, label: 'comp' }, splitMode: 'even', splitN: 3 });
    expect(total(s)).toBe(0);
    expect(remaining(s)).toBe(0);
    expect(chargeTarget(s)).toBe(0);
  });
});

// ---- labels ----

describe('labels', () => {
  it('money formats to two decimals with a thousands separator', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money(3.456)).toBe('$3.46');
  });

  it('the tax label is derived from the rate', () => {
    // No provider is mounted here, so the ambient bridge serves en-US.
    expect(taxLabel()).toBe('Tax · 8.25%');
    expect(taxLabel()).toContain(String(round2(TAX * 100)));
  });

  it('table names expand the zone prefix', () => {
    expect(tableName('T12', 'restaurant')).toBe('Table 12');
    expect(tableName('W2', 'restaurant')).toBe('Window 2');
    expect(tableName('P1', 'restaurant')).toBe('Patio 1');
    expect(tableName('B4', 'restaurant')).toBe('Bar 4');
  });

  it('an unprefixed label passes through', () => {
    expect(tableName('Counter', 'restaurant')).toBe('Counter');
  });

  it('an empty table reads differently in each service mode', () => {
    expect(tableName(null, 'restaurant')).toBe('New ticket');
    expect(tableName('—', 'retail')).toBe('Walk-in sale');
  });

  it('modLabel spells out the configuration and omits the defaults', () => {
    expect(modLabel(line('flatwhite', 1, { size: 'M', milk: 'Whole' }))).toBe('Medium');
    expect(modLabel(line('flatwhite', 1, { size: 'L', milk: 'Oat', extras: ['Vanilla'] }))).toBe(
      'Large · Oat milk · Vanilla',
    );
    expect(modLabel(line('croissant'))).toBe('');
  });
});
