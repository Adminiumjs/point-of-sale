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
 * The sentences are Adminium's own (`apps/server/src/outbox/text-words.ts`),
 * fixed words that hold no number; the till reads them, it never shows them.
 *
 * It also holds what the till can tell before asking: whether a number reads
 * as one, whether it is a mainland China number (no texts go there), and
 * whether the guest ticked the booking form's box for that number — the only
 * yes the till can see. Adminium is the judge; the till only decides what to
 * offer.
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
}

/** Adminium's sentences (`outbox/text-words.ts`), by the result each one is. */
const SENTENCES: readonly (readonly [string, TextOutcome])[] = [
  ['No mobile number on file', 'no-number'],
  ['Not sent: this person has not agreed to texts', 'not-agreed'],
  ['Not sent: this person has not confirmed their yes', 'not-agreed'],
  ['Not sent: this person replied STOP', 'opted-out'],
  ['Not sent: this person opted out at the provider', 'opted-out'],
  ['Not sent: the daily text limit is reached', 'limit'],
  ['Unknown: check with the provider before resending', 'unknown'],
  ['An earlier send is still open: check it before resending', 'unknown'],
  ['No text provider is connected', 'not-set-up'],
  ['No sender is set for texts', 'not-set-up'],
  ['Texts are switched off on this server', 'not-set-up'],
  ['The text is switched off, or has no words', 'not-set-up'],
  ['Not sent: the mobile number cannot be read', 'bad-number'],
  ['Not sent: the provider says the number is invalid', 'bad-number'],
  ['Not sent: this number cannot receive a text', 'bad-number'],
  ['Not sent: this number is not a mobile', 'bad-number'],
  ['Not sent: no texts go to this country', 'no-country'],
];

/** The result a row says. A `sent` row with a sentence has not settled as sent: Adminium cannot tell, so neither can the till. */
export function outcomeOf(row: TextRow | null): TextOutcome {
  if (row === null || row.status === 'queued' || row.status === 'held') return 'sending';
  const error = (row.error ?? '').trim();
  if (row.status === 'sent') return error === '' ? 'sent' : (SENTENCES.find(([words]) => error === words)?.[1] ?? 'unknown');
  return SENTENCES.find(([words]) => error === words)?.[1] ?? 'not-sent';
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

/** Whether the till may offer a text to this number: one that reads, not mainland China, and a yes it has seen. */
export function textable(raw: string | null | undefined, agreed: (phone: string) => boolean): raw is string {
  return raw !== null && raw !== undefined && raw.trim() !== '' && readablePhone(raw) && !isMainlandChina(raw) && agreed(raw);
}

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
