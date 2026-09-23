/**
 * Where the till's writes go — the other half of the data seam (reads are
 * `source.ts`).
 *
 *   sessionSink   Adminium's data API, as the signed-in staff member: the rows
 *                 land in the real tables, under their RBAC and audit trail,
 *                 with the rules Adminium keeps (a ticket's number, its
 *                 subtotal, a line's price) applied on the way in.
 *   memorySink    the demo and the tests: the same calls, answered in memory
 *                 with made-up keys, so the demo runs the code the real till
 *                 runs rather than a second path that could drift.
 *
 * Three operations, nothing else. A write that fails throws a `SinkError`
 * whose `kind` says what the caller should DO, because that is the only thing
 * the outbox decides on:
 *
 *   signed-out   401 — sign in again; nothing more can be saved until then
 *   saved        409 — it is already there (a retried payment the first try
 *                saved): done, not an error. Not the booking guard's 409
 *                (`CAPACITY_…`: the slot is full, or too late to change),
 *                which is a refusal like any other
 *   refused      422 and other 4xx — this change will never be accepted:
 *                undo it on screen and say why
 *   offline      no answer, or 5xx — keep it and try again later
 */
import type { SessionTransport, TableOfRef } from './sessionSource';

export type RowId = string | number;
export type SinkRow = Record<string, unknown>;

/** Rows written with their parent in one transaction, e.g. a line's options. */
export interface ChildRows {
  /** The child table's ref. */
  ref: string;
  /** The child's column pointing at the parent. */
  via: string;
  rows: SinkRow[];
}

export interface DataSink {
  insert(ref: string, values: SinkRow, children?: ChildRows[]): Promise<SinkRow>;
  update(ref: string, id: RowId, patch: SinkRow): Promise<SinkRow>;
  remove(ref: string, id: RowId): Promise<void>;
}

export type SinkErrorKind = 'signed-out' | 'saved' | 'refused' | 'offline';

export class SinkError extends Error {
  readonly kind: SinkErrorKind;
  readonly status: number;
  readonly code: string;
  /** The column the server refused, when it named one. */
  readonly field: string | null;

  constructor(message: string, kind: SinkErrorKind, status: number, code: string, field: string | null = null) {
    super(message);
    this.name = 'SinkError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function kindOfStatus(status: number, code = ''): SinkErrorKind {
  if (status === 401) return 'signed-out';
  if (status === 409) return code.startsWith('CAPACITY_') ? 'refused' : 'saved';
  if (status === 0 || status >= 500) return 'offline';
  return 'refused';
}

/** A key the till holds as text (`String(row.id)`), as the database wants it. */
export const dbKey = (id: RowId): RowId => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id);

interface Mutation {
  data?: SinkRow;
}

interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

/**
 * The first column a refused write names. The data API answers a 422 with
 * `details: { fields: { <column>: issue } }`.
 */
function fieldOf(error: ErrorLike): string | null {
  const fields = (error.details as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (typeof fields !== 'object' || fields === null) return null;
  return Object.keys(fields)[0] ?? null;
}

function asSinkError(error: unknown): SinkError {
  if (error instanceof SinkError) return error;
  const e = (error ?? {}) as ErrorLike;
  // fetch() rejects with a TypeError when there was no answer at all.
  const status = typeof e.status === 'number' ? e.status : 0;
  return new SinkError(e.message ?? 'The change could not be saved.', kindOfStatus(status, e.code), status, e.code ?? 'NETWORK', fieldOf(e));
}

export function sessionSink(transport: SessionTransport, tableOfRef: TableOfRef): DataSink {
  const tableOf = (ref: string): string => {
    const table = tableOfRef[ref];
    if (table === undefined) throw new SinkError(`unknown ref "${ref}"`, 'refused', 400, 'UNKNOWN_REF');
    return table;
  };
  const path = async (ref: string, id?: RowId): Promise<string> => {
    const conn = await transport.connection();
    const base = `/api/v1/data/${encodeURIComponent(conn)}/${encodeURIComponent(tableOf(ref))}`;
    return id === undefined ? base : `${base}/${encodeURIComponent(String(id))}`;
  };
  /** One retry with a fresh token when the session's has rotated. */
  const send = async <T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> => {
    try {
      return await transport.mutate<T>(url, method, body);
    } catch (error) {
      if ((error as ErrorLike).code !== 'CSRF_FAILED') throw asSinkError(error);
      await transport.refresh().catch(() => undefined);
      try {
        return await transport.mutate<T>(url, method, body);
      } catch (again) {
        throw asSinkError(again);
      }
    }
  };

  return {
    async insert(ref, values, children) {
      let body: { values: SinkRow; children?: Record<string, { values: SinkRow }[]> } = { values };
      if (children !== undefined && children.length > 0) {
        const linked: Record<string, { values: SinkRow }[]> = {};
        for (const child of children) {
          linked[await transport.relation(tableOf(child.ref), child.via)] = child.rows.map((row) => ({ values: row }));
        }
        body = { ...body, children: linked };
      }
      const reply = await send<Mutation>(await path(ref), 'POST', body);
      return reply.data ?? {};
    },
    async update(ref, id, patch) {
      const reply = await send<Mutation>(await path(ref, dbKey(id)), 'PATCH', { values: patch });
      return reply.data ?? {};
    },
    async remove(ref, id) {
      await send<unknown>(`${await path(ref, dbKey(id))}?confirm=true`, 'DELETE');
    },
  };
}

/** What a memory sink has been asked to do, in order — the tests read it. */
export interface MemoryCall {
  op: 'insert' | 'update' | 'remove';
  ref: string;
  id?: RowId;
  values?: SinkRow;
  children?: ChildRows[];
}

export interface MemorySink extends DataSink {
  calls: MemoryCall[];
  /** The rows as they stand, by ref. */
  rows: Map<string, SinkRow[]>;
  /** Make the next writes fail, for tests. */
  failNext: (error: SinkError, times?: number) => void;
}

/**
 * The demo's sink: keys are counted per table, and a row written with its own
 * key (a payment's uuid) keeps it. It numbers tickets only when asked
 * (`firstNumber`): in the demo the till's own numbering stands, the way the
 * server's sequence numbers them in a real install.
 */
export function memorySink(opts: { firstNumber?: number } = {}): MemorySink {
  const calls: MemoryCall[] = [];
  const rows = new Map<string, SinkRow[]>();
  const counters = new Map<string, number>();
  let number = opts.firstNumber ?? 0;
  const failures: SinkError[] = [];
  const table = (ref: string): SinkRow[] => {
    const list = rows.get(ref) ?? [];
    rows.set(ref, list);
    return list;
  };
  const failIfAsked = () => {
    const next = failures.shift();
    if (next !== undefined) throw next;
  };
  const nextKey = (ref: string): number => {
    const n = (counters.get(ref) ?? 0) + 1;
    counters.set(ref, n);
    return n;
  };

  return {
    calls,
    rows,
    failNext: (error, times = 1) => {
      for (let i = 0; i < times; i += 1) failures.push(error);
    },
    async insert(ref, values, children) {
      calls.push({ op: 'insert', ref, values, ...(children === undefined ? {} : { children }) });
      failIfAsked();
      const row: SinkRow = { ...values, id: values['id'] ?? nextKey(ref) };
      if (ref === 'tickets' && row['number'] === undefined && opts.firstNumber !== undefined) row['number'] = String(number++);
      table(ref).push(row);
      for (const child of children ?? []) {
        for (const values of child.rows) table(child.ref).push({ ...values, id: nextKey(child.ref), [child.via]: row['id'] });
      }
      return { ...row };
    },
    async update(ref, id, patch) {
      calls.push({ op: 'update', ref, id, values: patch });
      failIfAsked();
      const list = table(ref);
      const at = list.findIndex((row) => String(row['id']) === String(id));
      /*
       * A row this sink never wrote is one of the demo's seeded rows — the
       * bookings, the menu, the staff it opens with — which a real server would
       * hold already. It is taken as there, so the demo can change it.
       */
      if (at === -1) {
        list.push({ id, ...patch });
        return { id, ...patch };
      }
      list[at] = { ...list[at], ...patch };
      return { ...list[at] };
    },
    async remove(ref, id) {
      calls.push({ op: 'remove', ref, id });
      failIfAsked();
      const list = table(ref);
      const at = list.findIndex((row) => String(row['id']) === String(id));
      if (at !== -1) list.splice(at, 1);
    },
  };
}
