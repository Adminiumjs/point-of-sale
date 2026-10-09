/**
 * The till's direct doors: what it asks Adminium and needs the answer to NOW.
 *
 * The outbox (`state/outbox.ts`) is for changes that may wait for a
 * connection. These may not: a figure the screen is about to show, a try
 * before a save (a dry run), a gift card paying, a code being looked up. None
 * of them is ever answered from the till's own memory, and none is queued —
 * without a connection they are refused here and the screen says so.
 *
 *   sessionDesk   Adminium's data API, as the signed-in staff member
 *   null          the demo and the tests: there is no server to ask, so the
 *                 till shows its own estimate and calls nothing
 *
 * Tables are named as the outbox names them (`tickets`, `ticket_codes`); an
 * add-on's by its key and short name (`offers:reasons`), which the staff
 * config maps to the name it is stored under.
 *
 * A refusal throws the sink's own `SinkError`, with the server's `details`.
 */
import type { ListCondition } from './snapshotPort';
import type { SessionTransport } from './sessionSource';
import { asSinkError, dbKey, SinkError, type ChildRows, type RowId, type SinkRow } from './sink';

/** One reduction of a ticket, as Adminium worked it out. */
export interface WireApplied {
  line?: unknown;
  name: unknown;
  kind: string;
  amount: number | string;
  typed?: boolean;
}

/** A save's whole answer: the row, and what the rules said beside it. */
export interface DeskReply {
  data: SinkRow;
  /** The reductions on the ticket after this write (Offers). */
  applied?: WireApplied[];
  /** Things worth saying that refused nothing (`better-offer-applied`). */
  told?: { note: string; name?: unknown }[];
  /** A gift card payment: what the card covers, and what is then left to pay. */
  payment?: { amount: number | string; due: number | string };
  /** Values shown this once and never read back: a new card's whole code. */
  once?: { column: string; value: string; print?: unknown }[];
  /** A refund's limits: what each payment took and can still give back. */
  refund?: {
    refundable?: number | string;
    taxRefundable?: number | string;
    payments?: { key: string; took: number | string; givenBack?: number | string; max: number | string }[];
  };
}

/** What Offers knows of a typed or scanned value; never the value back. */
export interface LookUp {
  found: boolean;
  kind?: 'gift-card' | 'voucher' | 'pack' | 'code';
  last4?: string;
  record?: Record<string, unknown>;
}

/** A menu item's stock word (Inventory). */
export interface StockWord {
  id: string;
  state: 'in' | 'low' | 'out';
  exact?: number | string;
  after?: number | string;
}

export interface OneByOneReply {
  results: { id?: unknown; ok: boolean; error?: { code: string; reason?: string } }[];
  notRun: number;
}

export interface Desk {
  /** One row by its key. */
  one(ref: string, id: RowId): Promise<SinkRow>;
  /** Every row a condition matches, a page at a time (at most `max`). */
  rows(ref: string, where?: ListCondition, max?: number): Promise<SinkRow[]>;
  /** A save, sent now. */
  create(ref: string, values: SinkRow, children?: ChildRows[]): Promise<DeskReply>;
  patch(ref: string, id: RowId, values: SinkRow): Promise<DeskReply>;
  /** What a save would answer, with nothing written. */
  dryCreate(ref: string, values: SinkRow, children?: ChildRows[]): Promise<DeskReply>;
  dryUpdate(ref: string, id: RowId, values: SinkRow): Promise<DeskReply>;
  /** The same change to each row, each a save of its own. */
  oneByOne(ref: string, ids: unknown[], values: SinkRow): Promise<OneByOneReply>;
  /** Offers' look-up of a typed or scanned value. */
  lookUp(value: string): Promise<LookUp>;
  /** Inventory's stock words for menu items, at most 60 a call. */
  stockWords(ids: string[]): Promise<StockWord[]>;
}

let current: Desk | null = null;
/** The desk, or null where there is no server to ask (the demo, the tests). */
export const desk = (): Desk | null => current;
export function setDesk(next: Desk | null): void {
  current = next;
}

/** An add-on's table, by key and short name, as the staff config stores it. */
export function addOnTables(addOns: Readonly<Record<string, { tables?: Readonly<Record<string, string>> }>> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, addOn] of Object.entries(addOns ?? {})) {
    for (const [short, stored] of Object.entries(addOn.tables ?? {})) out[`${key}:${short}`] = stored;
  }
  return out;
}

const PAGE = 200;
const WORDS_MAX = 60;

export function sessionDesk(transport: SessionTransport, tableOfRef: Readonly<Record<string, string>>): Desk {
  const tableOf = (ref: string): string => {
    const table = tableOfRef[ref];
    if (table !== undefined) return table;
    // An add-on's table the config did not list is stored under its key and short name.
    const at = ref.indexOf(':');
    if (at > 0) return `${ref.slice(0, at).replace(/-/g, '_')}_${ref.slice(at + 1)}`;
    throw new SinkError(`unknown ref "${ref}"`, 'refused', 400, 'UNKNOWN_REF');
  };
  const base = async (ref: string): Promise<string> => `/api/v1/data/${encodeURIComponent(await transport.connection())}/${encodeURIComponent(tableOf(ref))}`;
  const read = async <T>(path: string): Promise<T> => {
    try {
      return await transport.get<T>(path);
    } catch (error) {
      throw asSinkError(error);
    }
  };
  /** One retry with a fresh token when the session's has rotated — as the sink does. */
  const send = async <T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> => {
    try {
      return await transport.mutate<T>(path, method, body);
    } catch (error) {
      if ((error as { code?: string }).code !== 'CSRF_FAILED') throw asSinkError(error);
      await transport.refresh().catch(() => undefined);
      try {
        return await transport.mutate<T>(path, method, body);
      } catch (again) {
        throw asSinkError(again);
      }
    }
  };
  const tree = async (values: SinkRow, children?: ChildRows[]): Promise<{ values: SinkRow; children?: Record<string, { values: SinkRow }[]> }> => {
    if (children === undefined || children.length === 0) return { values };
    const linked: Record<string, { values: SinkRow }[]> = {};
    for (const child of children) linked[await transport.relation(tableOf(child.ref), child.via)] = child.rows.map((row) => ({ values: row }));
    return { values, children: linked };
  };
  const reply = (body: Partial<DeskReply> | null | undefined): DeskReply => ({ ...(body ?? {}), data: body?.data ?? {} });

  return {
    async one(ref, id) {
      return (await read<{ data?: SinkRow }>(`${await base(ref)}/${encodeURIComponent(String(dbKey(id)))}`)).data ?? {};
    },
    async rows(ref, where, max = 10_000) {
      const out: SinkRow[] = [];
      const filter = where === undefined ? '' : `&where=${encodeURIComponent(JSON.stringify(where))}`;
      for (let offset = 0; offset < max; offset += PAGE) {
        const page = (await read<{ data?: SinkRow[] }>(`${await base(ref)}?limit=${String(PAGE)}&offset=${String(offset)}${filter}`)).data ?? [];
        out.push(...page);
        if (page.length < PAGE) break;
      }
      return out;
    },
    async create(ref, values, children) {
      return reply(await send<DeskReply>(await base(ref), 'POST', await tree(values, children)));
    },
    async patch(ref, id, values) {
      return reply(await send<DeskReply>(`${await base(ref)}/${encodeURIComponent(String(dbKey(id)))}`, 'PATCH', { values }));
    },
    async dryCreate(ref, values, children) {
      return reply(await send<DeskReply>(`${await base(ref)}/dry-run`, 'POST', await tree(values, children)));
    },
    async dryUpdate(ref, id, values) {
      return reply(await send<DeskReply>(`${await base(ref)}/${encodeURIComponent(String(dbKey(id)))}/dry-run`, 'POST', { values }));
    },
    async oneByOne(ref, ids, values) {
      const answer = await send<Partial<OneByOneReply>>(`${await base(ref)}/one-by-one`, 'POST', { ids, values });
      return { results: answer.results ?? [], notRun: answer.notRun ?? 0 };
    },
    async lookUp(value) {
      const answer = await send<Partial<LookUp> & { data?: Partial<LookUp> }>('/api/v1/add-ons/offers/look-up', 'POST', { value });
      const found = answer.data ?? answer;
      return { ...found, found: found.found === true };
    },
    async stockWords(ids) {
      const out: StockWord[] = [];
      for (let at = 0; at < ids.length; at += WORDS_MAX) {
        const chunk = ids.slice(at, at + WORDS_MAX);
        const answer = await read<{ data?: StockWord[] }>(`/api/v1/words/inventory/stock?table=${encodeURIComponent('pos:menu_items')}&ids=${chunk.map(encodeURIComponent).join(',')}`);
        out.push(...(answer.data ?? []).map((word) => ({ ...word, id: String(word.id) })));
      }
      return out;
    },
  };
}
