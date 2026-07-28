import { describe, expect, it } from 'vitest';
import { keyOf } from './key';
import { seedHeld, seedTicket } from './demo';

describe('keyOf', () => {
  it('is stable for the same configuration', () => {
    expect(keyOf('latte', 'M', 'Oat', ['Vanilla'], 'hot', 2)).toBe(
      keyOf('latte', 'M', 'Oat', ['Vanilla'], 'hot', 2),
    );
  });

  it('treats the same extras chosen in a different order as one line', () => {
    expect(keyOf('latte', 'M', null, ['Vanilla', 'Decaf'])).toBe(keyOf('latte', 'M', null, ['Decaf', 'Vanilla']));
  });

  it('does not mutate the caller’s extras array while sorting', () => {
    const extras = ['Vanilla', 'Decaf'];
    keyOf('latte', 'M', null, extras);
    expect(extras).toEqual(['Vanilla', 'Decaf']);
  });

  it('separates on every axis', () => {
    const base = keyOf('latte', 'M', 'Whole', [], '', 0);
    expect(keyOf('latte', 'L', 'Whole', [], '', 0)).not.toBe(base);
    expect(keyOf('latte', 'M', 'Oat', [], '', 0)).not.toBe(base);
    expect(keyOf('latte', 'M', 'Whole', ['Decaf'], '', 0)).not.toBe(base);
    expect(keyOf('latte', 'M', 'Whole', [], 'hot', 0)).not.toBe(base);
    expect(keyOf('latte', 'M', 'Whole', [], '', 3)).not.toBe(base);
  });

  it('treats a null/empty size the same as an absent one', () => {
    expect(keyOf('croissant', null)).toBe(keyOf('croissant', undefined));
  });

  it('seat 0 (shared) and no seat are the same line', () => {
    expect(keyOf('croissant', null, null, [], '', 0)).toBe(keyOf('croissant'));
  });

  /*
   * A note is free text typed by staff. Every field is delimited, so a note
   * that happens to contain the delimiter cannot make two different lines
   * collide into one.
   */
  it('a note containing the field delimiter does not collide with a seat', () => {
    expect(keyOf('croissant', null, null, [], 'x|s2')).not.toBe(keyOf('croissant', null, null, [], 'x', 2));
  });

  it('a note that looks like the note prefix does not collide', () => {
    expect(keyOf('croissant', null, null, [], 'n:hot')).not.toBe(keyOf('croissant', null, null, [], 'hot'));
  });
});

/*
 * The seeds used to hand-write these strings and five of the eight had drifted
 * a field, so the register could never merge into a seeded line.
 */
describe('seed data derives its keys from keyOf', () => {
  const lines = [...seedTicket().items, ...seedHeld().flatMap((h) => h.items)];

  it('has lines to check', () => {
    expect(lines.length).toBe(9);
  });

  it.each(lines.map((li) => [li.id + ' / ' + li.key, li] as const))('%s', (_label, li) => {
    expect(li.key).toBe(keyOf(li.id, li.size, li.milk, li.extras, li.note, li.seat));
  });

  it('no ticket carries two lines with the same key', () => {
    const keys = seedTicket().items.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    seedHeld().forEach((h) => {
      const hk = h.items.map((x) => x.key);
      expect(new Set(hk).size).toBe(hk.length);
    });
  });
});
