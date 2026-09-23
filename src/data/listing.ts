/**
 * Reading a table a page at a time, and a large `in` list in chunks — shared by
 * the boot read (`adminiumSource.ts`) and Refund's on-demand read
 * (`history.ts`), and kept apart from both so the demo bundle, which uses
 * neither transport, does not carry the public client for them.
 */
import type { ListCondition, SnapshotPort } from './snapshotPort';

type Key = number | string;

/** At most this many values in one `in` (the data API's own limit). */
const IN_MAX = 200;

/** Every row a query matches, a page at a time. */
export async function listAll<T>(
  client: SnapshotPort,
  ref: string,
  opts: { size: number; max: number; where?: ListCondition; order?: string },
): Promise<T[]> {
  const out: T[] = [];
  const page = Math.max(1, Math.min(opts.size, 500));
  for (let offset = 0; offset < opts.max; offset += page) {
    const res = await client.list<T>(ref, {
      limit: page,
      offset,
      ...(opts.where === undefined ? {} : { where: opts.where }),
      ...(opts.order === undefined ? {} : { order: opts.order }),
    });
    out.push(...res.data);
    if (res.data.length < page) return out;
  }
  console.warn(`[adminium] ${ref}: stopped at ${String(opts.max)} rows — the rest were not read.`);
  return out;
}

/** The rows whose `column` is one of `keys`, asked 200 keys at a time. */
export async function listIn<T>(client: SnapshotPort, ref: string, column: string, keys: Key[], size: number): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; at < keys.length; at += IN_MAX) {
    const chunk = keys.slice(at, at + IN_MAX);
    out.push(...(await listAll<T>(client, ref, { size, max: 100_000, where: { column, op: 'in', value: chunk } })));
  }
  return out;
}
