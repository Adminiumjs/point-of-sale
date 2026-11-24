/**
 * Where the till reads how a text ended — the seam beside `sink.ts`.
 *
 *   sessionTextLog   the hosted till: the outbox row itself, read through the
 *                    signed-in staff member's session (`messages`, by its key)
 *   memoryTextLog    the demo and the tests: no Adminium and no provider, so
 *                    the demo café's own rules answer from memory, in
 *                    Adminium's words, a moment after the row is written
 *
 * The till writes the row through the outbox (`writes.ts`) either way; only
 * the answer differs. The demo sends nothing to anyone.
 */
import type { SnapshotPort } from './snapshotPort';
import { isMainlandChina, readablePhone, type TextRow } from '../state/texts';
import { DEMO } from '../surface';

/** What the till knew when it asked: the demo decides on it, Adminium on its own records. */
export interface TextFacts {
  /** The number on file, or null with nobody to text. */
  phone: string | null;
  /** The till saw a yes for that number (the booking form's box). */
  agreed: boolean;
}

export interface TextLog {
  /** A row was queued with these facts. */
  queued(id: string, facts: TextFacts): void;
  /** The row as it is now; null while it cannot be read. */
  read(id: string): Promise<TextRow | null>;
}

/** The demo café's text log: the result its own rules give, after a moment, in Adminium's words. */
export function memoryTextLog(opts: { after?: number; now?: () => number } = {}): TextLog & { rows: Map<string, { row: TextRow; at: number }> } {
  const after = opts.after ?? 1200;
  const now = opts.now ?? Date.now;
  const rows = new Map<string, { row: TextRow; at: number }>();
  return {
    rows,
    queued(id, facts) {
      rows.set(id, { row: decide(facts), at: now() + after });
    },
    async read(id) {
      const held = rows.get(id);
      if (held === undefined) return null;
      return now() < held.at ? { status: 'queued', error: null } : { ...held.row };
    },
  };
}

/** The demo's verdict, in the order Adminium checks: a number, the country, a readable one, a yes. */
function decide(facts: TextFacts): TextRow {
  if (facts.phone === null || facts.phone.trim() === '') return { status: 'skipped', error: 'No mobile number on file' };
  if (isMainlandChina(facts.phone)) return { status: 'skipped', error: 'Not sent: no texts go to this country' };
  if (!readablePhone(facts.phone)) return { status: 'skipped', error: 'Not sent: the mobile number cannot be read' };
  if (!facts.agreed) return { status: 'skipped', error: 'Not sent: this person has not agreed to texts' };
  return { status: 'sent', error: null };
}

/** The hosted till's: the row, read by its key. */
export function sessionTextLog(client: Pick<SnapshotPort, 'list'>): TextLog {
  return {
    queued() {},
    async read(id) {
      const reply = await client.list<{ status: string; error: string | null }>('messages', { limit: 1, offset: 0, where: { column: 'id', op: 'eq', value: id } });
      const row = reply.data[0];
      return row === undefined ? null : { status: String(row.status), error: row.error ?? null };
    },
  };
}

/**
 * A build with no session to read the outbox through (a standalone one on a
 * publishable key): its writes never reach the outbox, so nothing is sent.
 */
const NOT_CONNECTED: TextLog = { queued() {}, read: async () => ({ status: 'skipped', error: 'No text provider is connected' }) };

let log: TextLog = DEMO ? memoryTextLog() : NOT_CONNECTED;

export const textLog = (): TextLog => log;

/** Read from another log from now on (the hosted till's session; a test's). */
export function setTextLog(next: TextLog): void {
  log = next;
}
