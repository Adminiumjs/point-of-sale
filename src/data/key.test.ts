import { describe, expect, it } from 'vitest';
import { keyOf, selectionKey } from './key';
import { seedHeld, seedTicket } from './demo';

const M = { size: ['latte:size:medium'] };

describe('keyOf', () => {
  it('is stable for the same configuration', () => {
    const selection = { size: ['s:m'], milk: ['m:oat'], extras: ['x:vanilla'] };
    expect(keyOf('latte', selection, 'hot', 2)).toBe(keyOf('latte', { ...selection }, 'hot', 2));
  });

  it('treats the same options chosen in a different order as one line', () => {
    expect(keyOf('latte', { extras: ['x:vanilla', 'x:decaf'], size: ['s:m'] })).toBe(keyOf('latte', { size: ['s:m'], extras: ['x:decaf', 'x:vanilla'] }));
  });

  it('does not mutate the caller’s option lists while sorting', () => {
    const extras = ['x:vanilla', 'x:decaf'];
    keyOf('latte', { extras });
    expect(extras).toEqual(['x:vanilla', 'x:decaf']);
  });

  it('separates on every axis', () => {
    const base = keyOf('latte', M, '', 0);
    expect(keyOf('latte', { size: ['latte:size:large'] }, '', 0)).not.toBe(base);
    expect(keyOf('latte', { ...M, milk: ['latte:milk:oat'] }, '', 0)).not.toBe(base);
    expect(keyOf('mocha', M, '', 0)).not.toBe(base);
    expect(keyOf('latte', M, 'hot', 0)).not.toBe(base);
    expect(keyOf('latte', M, '', 3)).not.toBe(base);
  });

  it('an empty group is no choice at all', () => {
    expect(selectionKey({ extras: [] })).toBe(selectionKey({}));
    expect(keyOf('croissant', { extras: [] })).toBe(keyOf('croissant'));
  });

  it('seat 0 (shared) and no seat are the same line', () => {
    expect(keyOf('croissant', {}, '', 0)).toBe(keyOf('croissant'));
  });

  /*
   * A note is free text typed by staff. Every field is delimited, so a note
   * that happens to contain the delimiter cannot make two different lines
   * collide into one.
   */
  it('a note containing the field delimiter does not collide with a seat', () => {
    expect(keyOf('croissant', {}, 'x|s2')).not.toBe(keyOf('croissant', {}, 'x', 2));
  });

  it('a note that looks like the note prefix does not collide', () => {
    expect(keyOf('croissant', {}, 'n:hot')).not.toBe(keyOf('croissant', {}, 'hot'));
  });
});

/*
 * The seeds used to hand-write these strings and five of the eight had drifted
 * a field, so the register could never merge into a seeded line.
 */
describe('seed data derives its keys from keyOf', () => {
  const lines = [...seedTicket().items, ...seedHeld().flatMap((h) => h.items)];

  it('has lines to check', () => {
    // The register's four, and the tickets on the demo's seven occupied tables.
    expect(lines.length).toBe(25);
  });

  it.each(lines.map((li) => [li.id + ' / ' + li.key, li] as const))('%s', (_label, li) => {
    expect(li.key).toBe(keyOf(li.id, li.selection, li.note, li.seat));
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
