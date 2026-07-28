import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU, MILKS, seedTicket } from './demo';
import { itemsSub, round2 } from '../state/calc';

/*
 * db/seed.sql is the Postgres contract for the full-stack compose, and it holds
 * a second copy of the same demo data the SPA ships in memory. The two had
 * already drifted: the SQL recorded a Flat White with oat milk at its base
 * 4.50 and a large Cold Brew with an extra shot at 5.00, ignoring every
 * modifier upcharge, so ticket #1042 was $2.80 cheaper in the database than on
 * the till — exactly the sum of the modifiers.
 *
 * These are cheap guards, not a schema validator: they only check the facts
 * that exist in both places.
 */
const sql = readFileSync(fileURLToPath(new URL('../../db/seed.sql', import.meta.url)), 'utf8');

describe('db/seed.sql agrees with the in-memory demo data', () => {
  it('ticket #1042 totals the same in both', () => {
    const m = sql.match(/\('1042',\s*\d+,\s*'open',\s*([\d.]+),/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(round2(itemsSub(seedTicket().items)));
  });

  it('every ticket header total equals the sum of its line items', () => {
    const headers = [...sql.matchAll(/\('(\d{4})',\s*(?:\d+|NULL),\s*'\w+',\s*([\d.]+),/g)];
    expect(headers.length).toBe(15);

    const block = sql.slice(sql.indexOf('INSERT INTO ticket_items'));
    const lines = [...block.matchAll(/^\s*\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+),/gm)];
    expect(lines.length).toBeGreaterThan(20);

    const sums = new Map<number, number>();
    lines.forEach((l) => {
      const tid = Number(l[1]);
      sums.set(tid, round2((sums.get(tid) || 0) + Number(l[3]) * Number(l[4])));
    });

    headers.forEach((h, i) => {
      expect([h[1], sums.get(i + 1)]).toEqual([h[1], round2(Number(h[2]))]);
    });
  });

  it('a line noted with a premium milk is priced with that milk', () => {
    const premium = MILKS.filter((m) => m.delta > 0);
    expect(premium.length).toBeGreaterThan(0);

    const block = sql.slice(sql.indexOf('INSERT INTO ticket_items'));
    const rows = [...block.matchAll(/^\s*\(\d+,\s*(\d+),\s*\d+,\s*([\d.]+),\s*'([^']+)'\)?,?/gm)];
    const noted = rows.filter((r) => premium.some((m) => r[3].includes(m.v)));
    expect(noted.length).toBeGreaterThan(0);

    noted.forEach((r) => {
      // menu_item_id is 1-based over the same catalogue order as MENU
      const item = MENU[Number(r[1]) - 1];
      const milk = premium.find((m) => r[3].includes(m.v))!;
      expect([r[3], Number(r[2])]).toEqual([r[3], expect.any(Number)]);
      expect(Number(r[2])).toBeGreaterThanOrEqual(round2(item.price + milk.delta));
    });
  });
});
