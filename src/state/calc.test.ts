import { describe, expect, it } from 'vitest';
import { BRAND, BRAND_INITIAL, TAX, TIP_PRESETS, demoGroupId, demoGroups, demoSelection, seedTicket, type DemoSize } from '../data/demo';
import { keyOf } from '../data/key';
import type { Discount, LineItem, Split } from '../data/types';
import {
  chargeTarget,
  discountAmt,
  hexToRgba,
  itemsSub,
  lineTotal,
  lineUnit,
  linesTotal,
  modLabel,
  money,
  netSub,
  paid,
  regTotal,
  remaining,
  round2,
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
  mods: { size?: DemoSize | null; milk?: string | null; extras?: string[]; note?: string; seat?: number } = {},
): LineItem => {
  const { note = '', seat = 0 } = mods;
  const selection = demoSelection(id, mods);
  return { key: keyOf(id, selection, note, seat), id, qty, selection, note, seat, sent: false };
};

/** A demo group's option deltas by the option's own name. */
const deltas = (itemId: string, group: 'size' | 'milk' | 'extras'): Record<string, number> =>
  Object.fromEntries(demoGroups().find((g) => g.id === demoGroupId(itemId, group))!.options.map((o) => [o.slug, o.delta]));

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

describe('the demo menu’s option groups (menu v1)', () => {
  it('sizes', () => {
    expect(deltas('latte', 'size')).toEqual({ s: -0.4, m: 0, l: 0.7 });
  });

  it('milks — only the alternatives cost extra', () => {
    expect(deltas('latte', 'milk')).toEqual({ whole: 0, oat: 0.6, almond: 0.6, skim: 0 });
  });

  it('extras — an extra shot costs more, decaf is free, the syrups are flat', () => {
    expect(deltas('latte', 'extras')).toEqual({ 'extra-shot': 0.9, vanilla: 0.5, caramel: 0.5, hazelnut: 0.5, decaf: 0 });
  });

  it('gives each item only its own sets: tea has no extras, cold drinks no milk, food nothing', () => {
    const slugs = (itemId: string) => demoGroups().filter((g) => g.itemId === itemId).map((g) => g.slug);
    expect(slugs('flatwhite')).toEqual(['size', 'milk', 'extras']);
    expect(slugs('chai')).toEqual(['size', 'milk']);
    expect(slugs('coldbrew')).toEqual(['size', 'extras']);
    expect(slugs('croissant')).toEqual([]);
  });

  it('a size and a milk are a required single choice; extras are optional, several at once', () => {
    const [size, milk, extras] = demoGroups().filter((g) => g.itemId === 'latte');
    expect([size!.kind, size!.min, size!.max]).toEqual(['radio', 1, 1]);
    expect([milk!.kind, milk!.min, milk!.max]).toEqual(['radio', 1, 1]);
    expect([extras!.kind, extras!.min, extras!.max]).toEqual(['check', 0, 5]);
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

describe('a line prices only what it chose', () => {
  /* The old rule charged for "Soy", which the sheet never offered. An option is now priced by its own row. */
  it('an option id the item does not offer adds nothing', () => {
    const li = line('flatwhite');
    li.selection = { [demoGroupId('flatwhite', 'milk')]: ['flatwhite:milk:soy'] };
    expect(lineUnit(li)).toBe(line('flatwhite').qty * lineUnit(line('flatwhite')));
  });

  it('another item’s option is not this item’s', () => {
    const li = line('flatwhite');
    li.selection = demoSelection('latte', { milk: 'Oat' });
    expect(lineUnit(li)).toBe(lineUnit(line('flatwhite')));
  });
});

describe('the brand is written once', () => {
  it('the mark is the first letter of the name', () => {
    expect(BRAND_INITIAL).toBe(BRAND.charAt(0));
    expect(BRAND).toBe('Daybreak Coffee');
  });
});

describe('hexToRgba', () => {
  it('converts a hex tint, short or long, with or without the hash', () => {
    expect(hexToRgba('#9a6a3c', 0.24)).toBe('rgba(154,106,60,0.24)');
    expect(hexToRgba('fff', 0.5)).toBe('rgba(255,255,255,0.5)');
    // No tint at all keeps its documented default.
    expect(hexToRgba('', 1)).toBe('rgba(79,70,229,1)');
  });

  it('mixes a design token instead of parsing it as black', () => {
    // `catTint` answers `var(--accent)` for a category with no tint — every
    // category over a real database. Parsed as hex it was NaN, so `rgba(0,0,0,…)`.
    expect(hexToRgba('var(--accent)', 0.24)).toBe('color-mix(in srgb, var(--accent) 24%, transparent)');
    expect(hexToRgba('var(--accent)', 0.58)).toBe('color-mix(in srgb, var(--accent) 58%, transparent)');
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

  it('modLabel names every chosen option, in the order the groups list them', () => {
    expect(modLabel(line('flatwhite', 1, { size: 'M', milk: 'Whole' }))).toBe('Medium · Whole milk');
    expect(modLabel(line('flatwhite', 1, { extras: ['Vanilla'], milk: 'Oat', size: 'L' }))).toBe('Large · Oat milk · Vanilla');
    expect(modLabel(line('flatwhite', 1, { size: 'L', milk: 'Oat', extras: ['Vanilla'] }))).toBe(
      'Large · Oat milk · Vanilla',
    );
    expect(modLabel(line('croissant'))).toBe('');
  });
});
