/**
 * The outbox: every change the till makes, saved in order, even through a
 * dropped connection.
 *
 * ─── Queues ─────────────────────────────────────────────────────────────────
 *
 * One ordered queue per ticket (and one for the shift): a line is never saved
 * before its ticket, a quantity change never before the line. Different
 * tickets save independently, so one stuck ticket holds up nobody else.
 *
 * ─── Keys that do not exist yet ─────────────────────────────────────────────
 *
 * A row the till has just made has no key until the server answers, so it is
 * given a temporary one (`tmp:7`) and the screen carries on with that. Any
 * later write that names it — the line's `ticket_id`, a PATCH on the ticket —
 * waits for the real key and is sent with it. Once known, `resolve()` answers
 * with it.
 *
 * ─── When a write fails ─────────────────────────────────────────────────────
 *
 * By the sink's `kind`:
 *
 *   saved        it is already there (a retried payment): done
 *   refused      it never will be: dropped, its `onRefused` undoes it on
 *                screen, and every later write that depended on its key is
 *                dropped with it
 *   offline      kept at the head of its queue and retried with a growing
 *                pause (1 s, 2 s, 4 s … 30 s)
 *   signed-out   everything stops until `resume()`, after the person signs in
 *                again — nothing is lost
 *
 * The state (`pending`, `retrying`, `signedOut`) is what the till's offline
 * chip and its sign-in notice show.
 */
import { SinkError, type ChildRows, type DataSink, type RowId, type SinkRow } from '../data/sink';

export interface OutboxState {
  /** Writes not yet saved. */
  pending: number;
  /** A write failed for want of a connection and is waiting to try again. */
  retrying: boolean;
  /** The session ended: nothing is saved until the person signs in again. */
  signedOut: boolean;
}

interface Callbacks {
  onSaved?: (row: SinkRow) => void;
  onRefused?: (error: SinkError) => void;
}

type Op =
  | ({ kind: 'insert'; ref: string; temp: string | null; values: SinkRow; children?: ChildRows[] } & Callbacks)
  | ({ kind: 'update'; ref: string; id: RowId; patch: SinkRow } & Callbacks)
  | ({ kind: 'remove'; ref: string; id: RowId } & Callbacks);

interface Queued {
  op: Op;
  settle: (row: SinkRow | null) => void;
}

export interface Outbox {
  /** A key for a row not saved yet. */
  temp(): string;
  /** Resolves with the saved row, or null when the write was refused. */
  insert(queue: string, ref: string, values: SinkRow, opts?: { temp?: string; children?: ChildRows[] } & Callbacks): Promise<SinkRow | null>;
  update(queue: string, ref: string, id: RowId, patch: SinkRow, opts?: Callbacks): Promise<SinkRow | null>;
  remove(queue: string, ref: string, id: RowId, opts?: Callbacks): Promise<SinkRow | null>;
  /** The real key for a temporary one, once saved; any other key as it is. */
  resolve(id: RowId): RowId | undefined;
  /**
   * Whether a row this till is adding to `ref` has not been answered yet — so
   * the server may announce it before the till knows its key.
   */
  unanswered(ref: string): boolean;
  state(): OutboxState;
  subscribe(listener: (state: OutboxState) => void): () => void;
  /** Start again after signing in. */
  resume(): void;
  /** Settles when the queue (or every queue) has nothing left to send. */
  idle(queue?: string): Promise<void>;
}

export interface OutboxOptions {
  /** How long to wait before the Nth retry. */
  backoff?: (attempt: number) => number;
  /** Test seam: a timer. */
  wait?: (ms: number) => Promise<void>;
}

const TEMP = /^tmp:\d+$/;
export const isTemp = (id: unknown): id is string => typeof id === 'string' && TEMP.test(id);

export function createOutbox(sink: DataSink, opts: OutboxOptions = {}): Outbox {
  const backoff = opts.backoff ?? ((attempt: number) => Math.min(30_000, 1000 * 2 ** attempt));
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const queues = new Map<string, Queued[]>();
  const running = new Set<string>();
  const keys = new Map<string, RowId>();
  const waiting = new Map<string, (() => void)[]>();
  const dead = new Map<string, SinkError>();
  const listeners = new Set<(state: OutboxState) => void>();
  const idleWaiters = new Map<string, (() => void)[]>();
  let tempNo = 0;
  /** Writes sitting out a pause before their next try. */
  let backingOff = 0;
  let signedOut = false;
  /** Every queue stopped by a signed-out answer, waiting for `resume()`. */
  const paused: (() => void)[] = [];

  const pending = () => [...queues.values()].reduce((sum, list) => sum + list.length, 0);
  const snapshot = (): OutboxState => ({ pending: pending(), retrying: backingOff > 0, signedOut });
  const emit = () => {
    const now = snapshot();
    for (const listener of listeners) listener(now);
  };

  const known = (temp: string) =>
    new Promise<void>((resolve) => {
      if (keys.has(temp) || dead.has(temp)) {
        resolve();
        return;
      }
      waiting.set(temp, [...(waiting.get(temp) ?? []), resolve]);
    });
  const settleTemp = (temp: string) => {
    for (const resolve of waiting.get(temp) ?? []) resolve();
    waiting.delete(temp);
  };

  /** Every temporary key a write names. */
  const tempsIn = (op: Op): string[] => {
    const out: string[] = [];
    const scan = (row: SinkRow) => {
      for (const value of Object.values(row)) if (isTemp(value)) out.push(value);
    };
    if (op.kind === 'insert') {
      scan(op.values);
      for (const child of op.children ?? []) for (const row of child.rows) scan(row);
    } else {
      if (isTemp(op.id)) out.push(op.id);
      if (op.kind === 'update') scan(op.patch);
    }
    return out;
  };
  const swap = (row: SinkRow): SinkRow =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, isTemp(value) ? keys.get(value) : value]));

  async function attempt(op: Op): Promise<SinkRow> {
    switch (op.kind) {
      case 'insert':
        return sink.insert(
          op.ref,
          swap(op.values),
          op.children?.map((child) => ({ ...child, rows: child.rows.map(swap) })),
        );
      case 'update':
        return sink.update(op.ref, isTemp(op.id) ? keys.get(op.id)! : op.id, swap(op.patch));
      case 'remove':
        await sink.remove(op.ref, isTemp(op.id) ? keys.get(op.id)! : op.id);
        return {};
    }
  }

  async function run(queue: string): Promise<void> {
    if (running.has(queue)) return;
    running.add(queue);
    try {
      for (;;) {
        const list = queues.get(queue) ?? [];
        const head = list[0];
        if (head === undefined) break;
        const { op } = head;
        const temps = tempsIn(op);
        await Promise.all(temps.map(known));
        const blocked = temps.map((temp) => dead.get(temp)).find((error) => error !== undefined);
        let row: SinkRow | null = null;
        if (blocked !== undefined) {
          // What it depended on was refused: so is this.
          if (op.kind === 'insert' && op.temp !== null) dead.set(op.temp, blocked);
          op.onRefused?.(blocked);
        } else {
          let tries = 0;
          for (;;) {
            try {
              row = await attempt(op);
              break;
            } catch (raw) {
              const error = raw instanceof SinkError ? raw : new SinkError(String(raw), 'offline', 0, 'NETWORK');
              if (error.kind === 'saved') {
                row = op.kind === 'insert' ? { ...op.values } : {};
                break;
              }
              if (error.kind === 'refused') {
                if (op.kind === 'insert' && op.temp !== null) dead.set(op.temp, error);
                op.onRefused?.(error);
                row = null;
                break;
              }
              if (error.kind === 'signed-out') {
                signedOut = true;
                emit();
                await new Promise<void>((resolve) => paused.push(resolve));
                continue;
              }
              backingOff += 1;
              emit();
              try {
                await wait(backoff(tries));
              } finally {
                backingOff -= 1;
              }
              tries += 1;
            }
          }
        }
        if (row !== null) {
          if (op.kind === 'insert' && op.temp !== null && row['id'] !== undefined) keys.set(op.temp, row['id'] as RowId);
          op.onSaved?.(row);
        }
        if (op.kind === 'insert' && op.temp !== null) settleTemp(op.temp);
        list.shift();
        head.settle(row);
        emit();
      }
    } finally {
      running.delete(queue);
      if ((queues.get(queue)?.length ?? 0) === 0) {
        queues.delete(queue);
        for (const resolve of idleWaiters.get(queue) ?? []) resolve();
        idleWaiters.delete(queue);
      }
      if (queues.size === 0) {
        for (const resolve of idleWaiters.get('*') ?? []) resolve();
        idleWaiters.delete('*');
      }
      emit();
    }
  }

  function push(queue: string, op: Op): Promise<SinkRow | null> {
    return new Promise((settle) => {
      const list = queues.get(queue) ?? [];
      list.push({ op, settle });
      queues.set(queue, list);
      emit();
      void run(queue);
    });
  }

  return {
    temp: () => `tmp:${String(++tempNo)}`,
    insert: (queue, ref, values, o = {}) =>
      push(queue, {
        kind: 'insert',
        ref,
        values,
        temp: o.temp ?? null,
        ...(o.children === undefined ? {} : { children: o.children }),
        ...(o.onSaved === undefined ? {} : { onSaved: o.onSaved }),
        ...(o.onRefused === undefined ? {} : { onRefused: o.onRefused }),
      }),
    update: (queue, ref, id, patch, o = {}) => push(queue, { kind: 'update', ref, id, patch, ...o }),
    remove: (queue, ref, id, o = {}) => push(queue, { kind: 'remove', ref, id, ...o }),
    resolve: (id) => (isTemp(id) ? keys.get(id) : id),
    unanswered: (ref) =>
      [...queues.values()].some((list) =>
        list.some(({ op }) => op.kind === 'insert' && (op.ref === ref || (op.children ?? []).some((child) => child.ref === ref))),
      ),
    state: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resume() {
      if (!signedOut) return;
      signedOut = false;
      for (const go of paused.splice(0)) go();
      emit();
    },
    idle(queue = '*') {
      if (queue === '*' ? queues.size === 0 : (queues.get(queue)?.length ?? 0) === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.set(queue, [...(idleWaiters.get(queue) ?? []), resolve]));
    },
  };
}
