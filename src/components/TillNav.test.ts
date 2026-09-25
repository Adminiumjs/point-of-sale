/**
 * WHERE THE TILL OFFERS SHELF LABELS: in retail, with Barcode Labels attached.
 */
import { describe, expect, it } from 'vitest';

import { NO_FEATURES } from '../features';
import { receiptChoices } from '../screens/CustomerDisplay';
import { toolsFor } from './TillNav';

const labels = (retail: boolean, on: boolean) => toolsFor(retail, { ...NO_FEATURES, 'shelf-labels': on }).some((x) => x.v === 'labels');

describe('the till’s tools', () => {
  it('offers shelf labels only in retail, and only while Barcode Labels is attached', () => {
    expect(labels(true, true)).toBe(true);
    expect(labels(true, false)).toBe(false);
    expect(labels(false, true)).toBe(false);
    expect(labels(false, false)).toBe(false);
  });

  it('keeps every other tool either way', () => {
    expect(toolsFor(false, NO_FEATURES).map((x) => x.v)).toContain('menu86');
    expect(toolsFor(true, { ...NO_FEATURES, 'shelf-labels': true }).length).toBe(toolsFor(false, NO_FEATURES).length + 1);
  });
});

describe('the receipt choices on the customer display', () => {
  it('offers email only while the till can send one', () => {
    expect(receiptChoices(true).map((o) => o.via)).toEqual(['email', 'text', 'print', 'none']);
    expect(receiptChoices(false).map((o) => o.via)).toEqual(['text', 'print', 'none']);
  });
});
