/**
 * ONE SCHEMA, THREE COPIES — AND THEY MUST AGREE.
 *
 * This app's tables are written down three times:
 *
 *   db/schema.sql         what a compose install creates,
 *   manifest.json         what Adminium creates when the app is installed from
 *                         Studio — tables and columns named EXACTLY as each
 *                         `ref` says, keys only where `role: "pk"` says,
 *   adminiumSource.ts     what the till reads (`REQUIRED`, through
 *                         `tableOfRef.ts`).
 *
 * They had drifted, and nothing noticed. The manifest said `menuitems`,
 * `tables`, `imageurl` and `openedat`, with foreign keys named `tables` and
 * `tickets` and no primary key anywhere, while the SQL and the till said
 * `menu_items`, `restaurant_tables`, `image_url`, `opened_at` and `table_id`.
 * The till was proven live against a database built from the SQL, so it
 * worked; installed from Studio, the same till would have met tables it cannot
 * read — if the install had got that far, since a foreign key to a column with
 * no primary key is refused outright.
 *
 * So this reads all three and holds them to each other: table names, column
 * names, types, nullability, keys, foreign-key targets and enum values.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { REQUIRED } from './adminiumSource';
import { TABLE_OF_REF } from './tableOfRef';

interface SqlColumn {
  name: string;
  /** Lowercased, parameters dropped: `numeric(10, 2)` → `numeric`. */
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  references: string | null;
  /** Values of a `CHECK (col IN (…))`, or null. */
  checkIn: string[] | null;
}

/** Split on `sep` outside parentheses — a CHECK list holds commas of its own. */
function splitTopLevel(body: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

const TABLE_CONSTRAINT = /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b/i;

/** Every `CREATE TABLE` in a schema file, column by column. */
function parseSchema(sql: string): Map<string, SqlColumn[]> {
  const text = sql.replace(/--[^\n]*/g, '');
  const tables = new Map<string, SqlColumn[]>();
  const open = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  for (let match = open.exec(text); match !== null; match = open.exec(text)) {
    let depth = 1;
    let end = open.lastIndex;
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')') depth -= 1;
      end += 1;
    }
    const columns = splitTopLevel(text.slice(open.lastIndex, end - 1), ',')
      .filter((item) => !TABLE_CONSTRAINT.test(item))
      .map((item): SqlColumn => {
        const head = /^"?([a-z_][a-z0-9_]*)"?\s+([a-z]+)/i.exec(item);
        if (head === null) throw new Error(`cannot read the column definition "${item}"`);
        const check = /\bCHECK\s*\(\s*"?\w+"?\s+IN\s*\(([^)]*)\)\s*\)/i.exec(item);
        return {
          name: head[1]!,
          type: head[2]!.toLowerCase(),
          notNull: /\bNOT\s+NULL\b/i.test(item),
          primaryKey: /\bPRIMARY\s+KEY\b/i.test(item),
          references: /\bREFERENCES\s+"?([a-z_][a-z0-9_]*)"?/i.exec(item)?.[1] ?? null,
          checkIn:
            check === null
              ? null
              : check[1]!.split(',').map((value) => value.trim().replace(/^'|'$/g, '')),
        };
      });
    tables.set(match[1]!, columns);
    open.lastIndex = end;
  }
  return tables;
}

/** The manifest type a SQL column must be declared as. */
function manifestTypeOf(column: SqlColumn): string {
  if (column.references !== null) return 'fk';
  if (column.checkIn !== null) return 'enum';
  switch (column.type) {
    case 'serial':
    case 'int':
    case 'integer':
      return 'int';
    case 'text':
    case 'varchar':
      return 'text';
    // Every numeric column in this schema is an amount of money.
    case 'numeric':
    case 'decimal':
      return 'money';
    case 'boolean':
    case 'bool':
      return 'bool';
    case 'timestamptz':
      return 'timestamptz';
    default:
      throw new Error(`no manifest type is mapped for SQL type "${column.type}" (${column.name})`);
  }
}

interface ManifestColumn {
  ref: string;
  type: string;
  role?: string;
  nullable?: boolean;
  references?: string;
  enum?: string[];
}

const sql = parseSchema(
  readFileSync(fileURLToPath(new URL('../../db/schema.sql', import.meta.url)), 'utf8'),
);
const declared = new Map<string, ManifestColumn[]>(
  (manifest.requiredSchema.tables as { ref: string; columns: ManifestColumn[] }[]).map((table) => [
    table.ref,
    table.columns,
  ]),
);

describe('manifest.json installs the tables db/schema.sql creates', () => {
  it('declares exactly the tables the SQL creates', () => {
    // The parser is the first suspect when this fails, so it proves it read
    // something before the comparison means anything.
    expect(sql.size).toBeGreaterThan(0);
    expect([...declared.keys()].sort()).toEqual([...sql.keys()].sort());
  });

  it.each([...sql.keys()])('%s: same columns, types, nullability and keys', (table) => {
    const want = sql.get(table)!;
    const have = declared.get(table) ?? [];
    expect(have.map((column) => column.ref)).toEqual(want.map((column) => column.name));

    for (const column of want) {
      const entry = have.find((candidate) => candidate.ref === column.name)!;
      const at = `${table}.${column.name}`;
      expect(entry.type, `${at} type`).toBe(manifestTypeOf(column));
      // The installer makes a column NOT NULL unless the manifest says
      // `nullable: true`, and a primary key is never nullable.
      const nullable = !column.notNull && !column.primaryKey;
      expect(entry.nullable === true, `${at} nullable`).toBe(nullable);
      // A key only exists where `role: "pk"` says — and without one, no foreign
      // key can point at the table at all.
      expect(entry.role === 'pk', `${at} primary key`).toBe(column.primaryKey);
      expect(entry.references ?? null, `${at} references`).toBe(column.references);
      if (column.checkIn !== null) {
        expect(entry.enum, `${at} enum values`).toEqual(column.checkIn);
      }
    }
  });
});

describe('the till reads only what the manifest installs', () => {
  it.each(Object.entries(REQUIRED))('%s', (ref, columns) => {
    const table = TABLE_OF_REF[ref as keyof typeof TABLE_OF_REF];
    const installed = declared.get(table);
    expect(installed, `${ref} reads "${table}", which the manifest does not install`).toBeDefined();
    const names = new Set(installed!.map((column) => column.ref));
    expect(columns.filter((column) => !names.has(column))).toEqual([]);
  });
});
