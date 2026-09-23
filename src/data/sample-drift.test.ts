/**
 * THE SAMPLE DATA, THE STAND-ALONE SQL AND THE TILL AGREE.
 *
 * `seeds/pos.sample.json`, `db/schema.sql` and `db/seed.sql` are all written by
 * `npm run sample` from demo.ts, the manifest and sample.ts. This holds the
 * committed files to a fresh build, so an edit to any source without
 * regenerating is a red suite rather than a demo that quietly disagrees with
 * the till. (It replaces the row-count-only seed-drift check and the two price
 * checks seed-contract used to make against a hand-written seed.sql.)
 *
 * It also puts the bundle through the validator Adminium runs when an operator
 * adds it — vendored with the rest of the manifest checks — so a bundle the
 * product would refuse never ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { LOCALE_TAGS } from '../i18n/locales';
import { itemsSub, round2 } from '../state/calc';
import { sampleBundleIssues, sampleBundleSchema } from '../testing/manifest/sample.ts';
import { validateManifest } from '../testing/manifest/index.ts';
import { MENU, STAFF, TABLES, demoGroups, seedTicket } from './demo';
import { buildSample } from './sample';
import { schemaSql, seedSql, type ManifestTables } from './sample-sql';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const bundle = buildSample();
const rowsOf = (ref: string) => bundle.tables.find((t) => t.ref === ref)?.rows ?? [];

describe('the committed files are what `npm run sample` writes today', () => {
  it('seeds/pos.sample.json', () => {
    expect(read('../../seeds/pos.sample.json')).toBe(`${JSON.stringify(bundle, null, 2)}\n`);
  });

  it('db/schema.sql, from the manifest', () => {
    expect(read('../../db/schema.sql')).toBe(schemaSql(manifest as unknown as ManifestTables));
  });

  it('db/seed.sql, from the bundle', () => {
    expect(read('../../db/seed.sql')).toBe(seedSql(bundle, manifest as unknown as ManifestTables));
  });
});

describe('the bundle is one Adminium will add', () => {
  it('names it in the manifest', () => {
    expect(manifest.sampleData).toEqual({ file: 'seeds/pos.sample.json' });
  });

  it('passes the product’s own checks against this manifest', () => {
    const parsed = sampleBundleSchema.safeParse(bundle);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    const checked = validateManifest(manifest);
    expect(checked.ok).toBe(true);
    if (!checked.ok || !parsed.success) return;
    expect(sampleBundleIssues(parsed.data, checked.manifest)).toEqual([]);
  });

  it('names everything a reader sees in all eight languages', () => {
    const missing: string[] = [];
    const visit = (value: unknown, at: string) => {
      if (typeof value !== 'object' || value === null) return;
      const record = value as Record<string, unknown>;
      if (record['@t'] !== undefined) {
        const texts = record['@t'] as Record<string, string>;
        for (const tag of LOCALE_TAGS) if (!texts[tag]) missing.push(`${at} ${tag}`);
        return;
      }
      for (const [key, child] of Object.entries(record)) visit(child, `${at}.${key}`);
    };
    visit(bundle.tables, 'tables');
    expect(missing).toEqual([]);
  });
});

describe('the sample is the till’s own café', () => {
  it('carries the whole menu, floor and staff', () => {
    expect(rowsOf('menu_items')).toHaveLength(MENU.length);
    expect(rowsOf('restaurant_tables')).toHaveLength(TABLES.length);
    expect(rowsOf('staff')).toHaveLength(STAFF.length);
  });

  it('offers and prices every option exactly as the demo till does', () => {
    // The sample's `mod:<item>:<group>:<slug>` is the demo's option id `<item>:<group>:<slug>`.
    const sample = new Map(rowsOf('modifiers').map((row) => [String(row['@label']).slice('mod:'.length), Number(row['price_delta'])]));
    const demo = new Map(demoGroups().flatMap((group) => group.options.map((option) => [option.id, round2(option.delta)] as const)));
    expect(sample).toEqual(demo);
  });

  it('totals ticket 1042 as the till does, leaving its voided line out', () => {
    const ticket = rowsOf('tickets').find((row) => row['number'] === 'S-1042')!;
    expect(Number(ticket['subtotal'])).toBe(round2(itemsSub(seedTicket().items)));
    const voided = rowsOf('ticket_items').filter((row) => row['voided_at'] !== undefined);
    expect(voided).toHaveLength(1);
  });

  it('adds every ticket up from its lines, and pays every paid one in full', () => {
    const lines = rowsOf('ticket_items');
    const payments = rowsOf('payments');
    for (const ticket of rowsOf('tickets')) {
      const own = lines.filter((line) => (line['ticket_id'] as { '@ref': string })['@ref'] === ticket['@label'] && line['voided_at'] === undefined);
      const subtotal = round2(own.reduce((sum, line) => sum + Number(line['unit_price']) * Number(line['qty']), 0));
      expect(Number(ticket['subtotal']), String(ticket['number'])).toBe(subtotal);
      expect(Number(ticket['total']), String(ticket['number'])).toBe(round2(Number(ticket['subtotal']) + Number(ticket['tax'])));
      const paid = payments.filter((p) => (p['ticket_id'] as { '@ref': string })['@ref'] === ticket['@label']);
      expect(paid.length, String(ticket['number'])).toBe(ticket['status'] === 'paid' ? 1 : 0);
      if (paid[0] !== undefined) expect(Number(paid[0]['amount'])).toBe(Number(ticket['total']));
    }
  });

  it('has the booking “Manage my booking” finds', () => {
    const booking = rowsOf('reservations').find((row) => row['code'] === 'MR-4829');
    expect(booking?.['mobile']).toBe('+1 415 555 0166');
  });
});
