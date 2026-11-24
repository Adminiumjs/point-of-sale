/**
 * What the till asks Adminium about texts — the seam beside `sink.ts`.
 *
 *   sessionTextLog   the hosted till, through the signed-in staff member's
 *                    session: whether texts are set up (`GET /texts/ready`),
 *                    where a person stands (`GET /texts/consent`), a yes or no
 *                    they gave at the counter (`POST /texts/consent`), and how
 *                    a text the till asked for ended (its outbox row)
 *   memoryTextLog    the demo and the tests: no Adminium and no provider, so
 *                    the demo café answers from memory, in Adminium's words
 *                    and codes, a moment after a row is written
 *
 * The till writes the outbox row through the outbox (`writes.ts`) either way;
 * only the answers differ. The demo sends nothing to anyone.
 */
import type { SnapshotPort } from './snapshotPort';
import type { SessionTransport } from './sessionSource';
import { seedReservations, DEMO_TEXTS_AGREED } from './demo';
import { isMainlandChina, readablePhone, samePhone, maskPhone, type TextRow } from '../state/texts';
import { DEMO } from '../surface';

/** What the till knew when it asked: the number on file, or null with nobody to text. */
export interface TextFacts {
  phone: string | null;
}

/** Whose standing: a member (`customers`) or a booking's guest (`reservations`), and the number the till holds for them. */
export interface TextPerson {
  table: 'customers' | 'reservations';
  row: string;
  /** The number as the till has it: the demo decides on it; Adminium reads its own row. */
  phone: string | null;
}

/** Where a person stands on the shop's service texts, as Adminium says it. */
export interface TextStanding {
  state: 'yes' | 'no' | 'not-asked' | 'stopped' | 'no-phone';
  /** `••• 0166`, or Adminium's own mask (`+1 ••• 166`); null with no number. */
  masked: string | null;
  /** Who may lift a stop: the person by START, the business, or nobody. */
  liftBy: 'start' | 'business' | 'never' | null;
}

/** An answer the guest gave at the counter, in the words they were shown. */
export interface TextAnswer {
  state: 'yes' | 'no';
  how: 'in-person' | 'phone';
  wording: { text: string; version: string };
}

export interface TextLog {
  /** Whether a text can go at all: a provider and a sender, and texts not switched off. */
  ready(): Promise<boolean>;
  /** Where this person stands; null when it cannot be read. */
  standing(person: TextPerson): Promise<TextStanding | null>;
  /** Record what they said at the counter; false when it was not recorded. */
  record(person: TextPerson, answer: TextAnswer): Promise<boolean>;
  /** A row was queued with these facts. */
  queued(id: string, facts: TextFacts): void;
  /** The row as it is now; null while it cannot be read. */
  read(id: string): Promise<TextRow | null>;
}

/** The demo café's text log: its own yes list, and the result its own rules give, after a moment, in Adminium's words and codes. */
export function memoryTextLog(opts: { after?: number; now?: () => number; agreed?: readonly string[]; ready?: boolean } = {}): TextLog & {
  rows: Map<string, { row: TextRow; at: number }>;
  agreed: string[];
  /** A guest's own tick on the booking page (the demo's), for that number. */
  formYes(phone: string): void;
} {
  const after = opts.after ?? 1200;
  const now = opts.now ?? Date.now;
  const rows = new Map<string, { row: TextRow; at: number }>();
  const agreed = [...(opts.agreed ?? [])];
  const said = (phone: string | null) => phone !== null && agreed.some((one) => samePhone(one, phone));
  const formYes = (phone: string) => {
    if (!said(phone)) agreed.push(phone);
  };
  const decide = (facts: TextFacts): TextRow => {
    if (opts.ready === false) return { status: 'skipped', error: 'No text provider is connected', reason: 'not-set-up' };
    if (facts.phone === null || facts.phone.trim() === '') return { status: 'skipped', error: 'No mobile number on file', reason: 'no-number' };
    if (isMainlandChina(facts.phone)) return { status: 'skipped', error: 'Not sent: no texts go to this country', reason: 'country-blocked-cn' };
    if (!readablePhone(facts.phone)) return { status: 'skipped', error: 'Not sent: the mobile number cannot be read', reason: 'unreadable-phone' };
    if (!said(facts.phone)) return { status: 'skipped', error: 'Not sent: this person has not agreed to texts', reason: 'no-consent' };
    return { status: 'sent', error: null, reason: 'sent' };
  };
  return {
    rows,
    agreed,
    formYes,
    async ready() {
      return opts.ready ?? true;
    },
    async standing(person) {
      const phone = person.phone;
      if (phone === null || !readablePhone(phone)) return { state: 'no-phone', masked: null, liftBy: null };
      return { state: said(phone) ? 'yes' : 'not-asked', masked: maskPhone(phone), liftBy: null };
    },
    async record(person, answer) {
      if (person.phone === null || !readablePhone(person.phone)) return false;
      if (answer.state === 'yes') formYes(person.phone);
      else agreed.splice(0, agreed.length, ...agreed.filter((one) => !samePhone(one, person.phone)));
      return true;
    },
    queued(id, facts) {
      rows.set(id, { row: decide(facts), at: now() + after });
    },
    async read(id) {
      const held = rows.get(id);
      if (held === undefined) return null;
      return now() < held.at ? { status: 'queued', error: null, reason: 'queued' } : { ...held.row };
    },
  };
}

/** The hosted till's: Adminium's own answers, through the staff member's session. */
export function sessionTextLog(transport: Pick<SessionTransport, 'get' | 'mutate' | 'connection'> & { port: Pick<SnapshotPort, 'list'> }, tables: Readonly<Record<string, string>>): TextLog {
  const record = async (person: TextPerson) => ({ connection: await transport.connection(), table: tables[person.table] ?? person.table, row: person.row, column: 'mobile' });
  const standingOf = (data: { masked?: string | null; service?: { state?: string }; stopped?: { liftBy?: string } | null } | undefined): TextStanding | null => {
    const state = data?.service?.state;
    if (state !== 'yes' && state !== 'no' && state !== 'not-asked' && state !== 'stopped' && state !== 'no-phone') return null;
    const lift = data?.stopped?.liftBy;
    return { state, masked: data?.masked ?? null, liftBy: lift === 'start' || lift === 'business' || lift === 'never' ? lift : null };
  };
  return {
    async ready() {
      const reply = await transport.get<{ data?: { ready?: boolean } }>('/api/v1/texts/ready').catch(() => null);
      return reply?.data?.ready === true;
    },
    async standing(person) {
      const query = new URLSearchParams(await record(person));
      const reply = await transport.get<{ data?: Parameters<typeof standingOf>[0] }>(`/api/v1/texts/consent?${query.toString()}`).catch(() => null);
      return standingOf(reply?.data);
    },
    async record(person, answer) {
      const reply = await transport.mutate<{ data?: unknown }>('/api/v1/texts/consent', 'POST', { ...(await record(person)), ...answer }).catch(() => null);
      return reply !== null;
    },
    queued() {},
    async read(id) {
      const reply = await transport.port.list<{ status: string; error: string | null; text_reason?: string | null }>('messages', { limit: 1, offset: 0, where: { column: 'id', op: 'eq', value: id } });
      const row = reply.data[0];
      return row === undefined ? null : { status: String(row.status), error: row.error ?? null, reason: row.text_reason ?? null };
    },
  };
}

/**
 * A build with no session to ask through (a standalone one on a publishable
 * key): its writes never reach the outbox, so nothing is sent and no box is drawn.
 */
const NOT_CONNECTED: TextLog = {
  ready: async () => false,
  standing: async () => null,
  record: async () => false,
  queued() {},
  read: async () => ({ status: 'skipped', error: 'No text provider is connected', reason: 'not-set-up' }),
};

/** The demo café's own yes list: the numbers it holds a yes for, and the bookings whose guests ticked the box. */
export const demoTextLog = () => memoryTextLog({ agreed: [...DEMO_TEXTS_AGREED, ...seedReservations().flatMap((r) => (r.textsOk === true && r.mobile !== null ? [r.mobile] : []))] });

let log: TextLog = DEMO ? demoTextLog() : NOT_CONNECTED;

export const textLog = (): TextLog => log;

/** Ask another log from now on (the hosted till's session; a test's). */
export function setTextLog(next: TextLog): void {
  log = next;
}
