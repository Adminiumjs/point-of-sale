/**
 * WHO IS AT THE TILL, when Adminium hosts it.
 *
 * ── Why the till has to ask ──────────────────────────────────────────────────
 *
 * The demo opens on a PIN pad over a three-person roster, and that roster is
 * seed fiction: `db/schema.sql` has no staff table and no PIN column (WS-I G-1,
 * see `adminiumSource.ts`). A real database has nobody to pick and nothing to
 * check a PIN against, which is why a STANDALONE build cannot open a till at
 * all.
 *
 * A HOSTED staff surface differs in the one way that matters. The browser is on
 * Adminium's own origin and already carries the operator's session — the same
 * session the dashboard trusts to read and edit every ticket and payment in
 * this database. That session is the sign-in, so the till opens on it, and the
 * name on the top bar and on the receipt is the name Adminium signed in rather
 * than one the app made up.
 *
 * ── Why a separate read, and not a field on the transport ────────────────────
 *
 * `sessionSource.ts` already fetches `/api/v1/bootstrap`, but it is synced
 * byte-identically across the fleet and no other app needs the principal's
 * name. Teaching the shared file one app's need would fork it; one more GET at
 * boot, in the hosted build only, does not.
 */

import type { Staff } from './types';

/**
 * `GET /api/v1/bootstrap`, reduced to what this reads. The envelope is the one
 * `sessionSource.ts` documents from a live server: everything under `data`.
 */
interface BootstrapReply {
  data?: { user?: { name?: unknown; email?: unknown } };
}

/** The roster id of the signed-in operator. Never a seeded staff id. */
export const SESSION_STAFF_ID = 'session';

/**
 * "Sam Rivera" → "SR"; a single word keeps its first two letters.
 *
 * `Array.from` rather than indexing, so a name outside the Basic Multilingual
 * Plane is split into characters and not into halves of one.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  const head = (word: string): string => Array.from(word)[0] ?? '';
  if (words.length === 0) return '';
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join('').toUpperCase();
  return (head(words[0]!) + head(words[words.length - 1]!)).toUpperCase();
}

/**
 * The signed-in operator as a roster entry, or null when the session names
 * nobody (no session, an unexpected reply, a network failure).
 *
 * The PIN is EMPTY on purpose. The PIN pad compares a four-digit entry against
 * it, which can never match, so the pad cannot open this till — the session
 * already did, and a PIN nobody set is not a credential anyone should be asked
 * for.
 */
export async function readSessionOperator(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Staff | null> {
  try {
    const res = await fetchImpl('/api/v1/bootstrap', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as BootstrapReply | null;
    const user = body?.data?.user;
    const name = typeof user?.name === 'string' ? user.name.trim() : '';
    // `name` is required on the account, but nothing stops it being blank. The
    // mailbox part of the address is still the operator's own word for
    // themselves; anything past that would be a guess.
    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    const display = name !== '' ? name : (email.split('@')[0] ?? '');
    if (display === '') return null;
    return { id: SESSION_STAFF_ID, name: display, initials: initialsOf(display), role: '', pin: '' };
  } catch {
    // A proxy's HTML error page throws in `json()`; so does a dropped socket.
    return null;
  }
}
