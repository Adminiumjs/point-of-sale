/**
 * `npm run sample` — write everything generated from the manifest and the
 * sample builder:
 *
 *   seeds/pos.sample.json   the bundle an operator adds from Adminium
 *   db/schema.sql           the stand-alone stack's tables (from manifest.json)
 *   db/seed.sql             the stand-alone stack's demo rows (from the bundle)
 *
 * src/data/sample-drift.test.ts fails when any of the three is out of date, so
 * run this after changing demo.ts, sample.ts, sample-names.ts or the manifest.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSample } from '../src/data/sample';
import { schemaSql, seedSql, type ManifestTables } from '../src/data/sample-sql';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as ManifestTables;
const bundle = buildSample();

mkdirSync(join(root, 'seeds'), { recursive: true });
writeFileSync(join(root, 'seeds', 'pos.sample.json'), `${JSON.stringify(bundle, null, 2)}\n`);
writeFileSync(join(root, 'db', 'schema.sql'), schemaSql(manifest));
writeFileSync(join(root, 'db', 'seed.sql'), seedSql(bundle, manifest));

const rows = bundle.tables.reduce((sum, table) => sum + table.rows.length, 0);
console.info(`wrote seeds/pos.sample.json (${String(bundle.tables.length)} tables, ${String(rows)} rows), db/schema.sql and db/seed.sql`);
