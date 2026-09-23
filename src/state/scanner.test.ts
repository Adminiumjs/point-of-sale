/**
 * BARCODE SCANNING (wave 2, 55-T74): a scanner's burst ending in Enter is a
 * scan and adds its item; a person's typing never is.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { BARCODES, ean13 } from '../data/demo';
import { memorySink } from '../data/sink';
import { createScanDetector } from './scanner';
import { usePos } from './store';
import { setSink } from './writes';

const burst = (text: string, start: number, gap: number) => {
  const d = createScanDetector();
  let out: string | null = null;
  [...text, 'Enter'].forEach((key, i) => {
    const code = d.key(key, start + i * gap);
    if (code !== null) out = code;
  });
  return out;
};

describe('telling a scanner from a person', () => {
  it('reads a fast burst that ends in Enter as a code', () => {
    expect(burst('2000000001017', 1000, 8)).toBe('2000000001017');
  });

  it('leaves typing alone: too slow, too short, or broken by another key', () => {
    expect(burst('2000000001017', 1000, 180)).toBeNull();
    expect(burst('12345', 1000, 5)).toBeNull();
    const d = createScanDetector();
    for (const [i, key] of ['2', '0', '0', 'Backspace', '0', '0', '0', '1', 'Enter'].entries()) {
      expect(d.key(key, 100 + i * 5)).toBeNull();
    }
  });

  it('starts over after a pause, so a slow first key is not part of the code', () => {
    const d = createScanDetector();
    d.key('x', 0);
    const keys = [...'4006381333931', 'Enter'];
    const results = keys.map((key, i) => d.key(key, 1000 + i * 6));
    expect(results.at(-1)).toBe('4006381333931');
  });

  it('checks an EAN-13 the demo prints', () => {
    expect(ean13('400638133393')).toBe('4006381333931');
  });
});

describe('a scan at the register', () => {
  const INITIAL = usePos.getState();
  const s = () => usePos.getState();
  beforeEach(() => {
    setSink(memorySink({ firstNumber: 2001 }));
    usePos.setState(INITIAL, true);
    usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, search: '' });
  });

  it('adds the item whose barcode it is, and keeps what the scanner typed out of the search', () => {
    usePos.setState({ search: BARCODES['croissant']! });
    s().scanCode(BARCODES['croissant']!);
    expect(s().ticket.items.map((x) => x.id)).toEqual(['croissant']);
    expect(s().search).toBe('');
  });

  it('says so for a code nothing has, or an item sold out', () => {
    s().scanCode('9999999999999');
    expect(s().toast).toMatchObject({ kind: 'error' });
    s().scanCode(BARCODES['almond']!); // the demo's 86'd item
    expect(s().ticket.items).toEqual([]);
    expect(s().toast?.msg).toContain('Almond Croissant');
  });
});
