/**
 * TEXTS (plan 80): what the till knows of a text it asked Adminium to send.
 *
 * The till never sends a text itself and never opens the device's messages.
 * It writes one row in the app's outbox (`messages`, a text kind) and
 * Adminium does the rest — the number on file, the guest's yes, the
 * do-not-text list, the daily limit — then writes how it ended on that row:
 * its `status`, and a fixed sentence in `error`. This file turns that row into
 * the one result a member of staff reads on the card they pressed:
 *
 *   sending      the row is queued (or not saved yet): the button is busy
 *   sent         Adminium handed it to the provider
 *   no-number    nobody on file to text
 *   not-agreed   the guest has not said yes to texts
 *   opted-out    they replied STOP, or opted out with the provider
 *   limit        the business's daily limit is reached
 *   unknown      it may have gone: never send it again from the till
 *   not-set-up   no provider, no sender, or texts switched off
 *   bad-number   the number cannot take a text
 *   no-country   no texts go to that country (mainland China)
 *   not-sent     any other refusal
 *
 * Adminium writes a code beside its sentence (`outbox.columns.textReason`,
 * `messages.text_reason`); the till reads the code, never the English words.
 *
 * It also holds what the till can tell before asking: whether a number reads
 * as one, and whether it is a mainland China number (no texts go there).
 * Whether a person said yes is Adminium's to say (`GET /texts/consent`).
 */

export type TextOutcome =
  | 'sending'
  | 'sent'
  | 'no-number'
  | 'not-agreed'
  | 'opted-out'
  | 'limit'
  | 'unknown'
  | 'not-set-up'
  | 'bad-number'
  | 'no-country'
  | 'not-sent';

/** The outbox row as Adminium left it, or null while the till cannot read it yet. */
export interface TextRow {
  status: string;
  error: string | null;
  /** Adminium's code for the text (`outbox.columns.textReason`): `queued`, `sent`, `no-consent`, … */
  reason?: string | null;
}

/** Adminium's codes, by the result each one is; any other refusal reads `not-sent`. */
const CODES: Readonly<Record<string, TextOutcome>> = {
  queued: 'sending',
  waiting: 'sending',
  sent: 'sent',
  unknown: 'unknown',
  'earlier-send-open': 'unknown',
  'no-number': 'no-number',
  'no-consent': 'not-agreed',
  'unconfirmed-consent': 'not-agreed',
  stopped: 'opted-out',
  'opted-out': 'opted-out',
  'daily-limit': 'limit',
  'not-set-up': 'not-set-up',
  'no-words': 'not-set-up',
  'unreadable-phone': 'bad-number',
  'bad-number': 'bad-number',
  'invalid-number': 'bad-number',
  'cannot-receive-text': 'bad-number',
  'not-mobile': 'bad-number',
  'country-blocked': 'no-country',
  'country-blocked-cn': 'no-country',
};

/** The result a row says, read from its code. A row with none yet says it by its status alone. */
export function outcomeOf(row: TextRow | null): TextOutcome {
  if (row === null || row.status === 'queued' || row.status === 'held') return 'sending';
  const code = (row.reason ?? '').trim();
  if (code !== '') return CODES[code] ?? 'not-sent';
  return row.status === 'sent' ? 'sending' : 'not-sent';
}

/** A result that ends the attempt: anything but `sending`. */
export const settled = (outcome: TextOutcome): boolean => outcome !== 'sending';

/** Pressed again only after a refusal: never while one is going, after one went, or when nobody can tell. */
export const maySendAgain = (outcome: TextOutcome | undefined): boolean => outcome === undefined || !['sending', 'sent', 'unknown'].includes(outcome);

// ---- what the till can tell of a number ----

/** The number without what people type between digits; a leading `00` is a `+`. */
export function compactPhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().\- ]/g, '');
  return compact.startsWith('00') ? '+' + compact.slice(2) : compact;
}

/** A mainland China number (+86): no text goes there. Hong Kong (+852) and Taiwan (+886) are not refused. */
export const isMainlandChina = (raw: string): boolean => compactPhone(raw).startsWith('+86');

/** Whether what was typed can be a phone number at all: digits (a `+` first), 7 to 15 of them. */
export function readablePhone(raw: string): boolean {
  const compact = compactPhone(raw);
  if (!/^\+?\d+$/.test(compact)) return false;
  const digits = compact.replace('+', '').length;
  return digits >= 7 && digits <= 15;
}

/** The digits two writings of one number share: `+1 415 555 0123` and `(415) 555-0123` are one number. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const x = a.replace(/\D+/g, '');
  const y = b.replace(/\D+/g, '');
  if (x.length < 7 || y.length < 7) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** `••• 0123`: enough for a guest to know it is theirs, on a screen others can see. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  return digits.length < 4 ? '•••' : '••• ' + digits.slice(-4);
}

/** The version of the words beside every box for texts (the booking form's and the till's): raise it when they change. */
export const TEXT_WORDING_VERSION = 1;

/** The words a box for texts records: its label and the line under it, as one sentence pair. */
export const wordingOf = (label: string, sub: string, tag: string): string => (tag.startsWith('zh') ? `${label}。${sub}` : `${label}. ${sub}`);

/** Whether the till shows a box for this number: one that can be read, outside mainland China. */
export const boxFor = (raw: string): 'box' | 'china' | 'unreadable' | 'none' =>
  raw.trim() === '' ? 'none' : isMainlandChina(raw) ? 'china' : readablePhone(raw) ? 'box' : 'unreadable';

// ---- following one row until it settles ----

/**
 * How long the till waits between reads, in milliseconds. A text the customer
 * is waiting for goes at once, so it settles in a few seconds; after the last
 * wait the till stops asking and calls it unknown, because it may still go.
 */
let pace: readonly number[] = [700, 900, 1200, 1500, 2000, 2000, 3000, 3000, 4000, 5000, 6000, 8000, 10000, 12000];
/** A `sent` row is read once more before the till believes it: a provider that refuses at once turns it `failed`. */
let confirmAfter = 1500;

/** Test seam: how long each wait is. */
export function setTextPace(next: readonly number[], confirm = 0): void {
  pace = next;
  confirmAfter = confirm;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Read the row until it settles; `unknown` if it never does while the till is asking. */
export async function follow(read: () => Promise<TextRow | null>): Promise<TextOutcome> {
  for (const ms of pace) {
    await wait(ms);
    const outcome = outcomeOf(await read().catch(() => null));
    if (outcome === 'sending') continue;
    if (outcome !== 'sent') return outcome;
    await wait(confirmAfter);
    const again = outcomeOf(await read().catch(() => null));
    return again === 'sending' ? 'sent' : again;
  }
  return 'unknown';
}
