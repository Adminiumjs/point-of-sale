/**
 * Documents an add-on draws for the till's own rows, asked for by the till.
 *
 * Adminium's staff document route (`POST /api/v1/apps/pos/documents/render`)
 * draws the document the manifest's `documents` names for a kind and a row —
 * or hands back the one already drawn while the row is unchanged — as the
 * signed-in staff member, who must be able to read the row. The till asks for
 * one thing this way: a SHEET OF SHELF LABELS for a menu item, drawn by the
 * Barcode Labels add-on from the item's own `barcode`, `name` and key.
 *
 * Every way it can fail is named, so the screen can say it in words: a label
 * sheet is set in the fourteen standard PDF fonts, which carry plain ASCII
 * only, so an item named with an accent is REFUSED (`LATIN_ONLY`) with the
 * letters that cannot be printed — the add-on never prints a label with holes
 * in it. A number that is not a valid EAN-13 or Code 128 is refused too.
 *
 *   portDocuments   the hosted till, through its session
 *   (none)          the demo and the tests: nothing to draw with
 */
import { APP_KEY } from '../surface-nav';

/** What asking for a label sheet came to. */
export type LabelOutcome =
  | { ok: true; url: string }
  /** The item's name (or number) has letters a label sheet cannot print. */
  | { ok: false; reason: 'latin'; letters: string }
  /** The barcode is not a valid EAN-13 or Code 128 number. */
  | { ok: false; reason: 'code' }
  /** The item has no barcode (or no name) to print. */
  | { ok: false; reason: 'missing' }
  /** Barcode Labels is switched off for the app, or not attached. */
  | { ok: false; reason: 'off' }
  /** The item is gone, or this person may not read it. */
  | { ok: false; reason: 'gone' }
  /** No answer from Adminium. */
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'other'; detail: string };

/** How many labels a sheet may carry, as Barcode Labels bounds it. */
export const MAX_LABELS = 240;

/** A count the till can ask for: a whole number from 1 to 240, or null. */
export function labelCount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_LABELS ? n : null;
}

export interface DocumentsPort {
  /** A sheet of `count` labels for one menu item. */
  labelSheet(itemId: string, count: number): Promise<LabelOutcome>;
}

/** The part of the session transport this needs: a write through the session. */
export interface DocumentTransport {
  mutate: <T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => Promise<T>;
}

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

/**
 * A refusal from the route, as a reason the screen can say.
 *
 * The drawing's own refusal travels in the message of a 422
 * `DOCUMENT_NOT_DRAWN`, as `<CODE>: <detail>[: <what it dropped>]` —
 * `LATIN_ONLY: a label sheet is drawn in the base-14 fonts, which are ASCII
 * only: é` — and an empty required slot as `unmapped or empty: code`.
 */
export function labelOutcomeOf(error: unknown): LabelOutcome {
  const e = (error ?? {}) as ErrorLike;
  const status = typeof e.status === 'number' ? e.status : 0;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  if (status === 0 || (status >= 500 && code !== 'DOCUMENTS_UNAVAILABLE')) return { ok: false, reason: 'offline' };
  if (status === 404) return { ok: false, reason: 'gone' };
  if (status === 409 && code === 'FEATURE_OFF') return { ok: false, reason: 'off' };
  if (status === 422 && code === 'DOCUMENT_NOT_DRAWN') {
    const latin = /LATIN_ONLY:[^:]*:\s*(.+?)\s*$/.exec(message.replace(/\s*\(number [^)]*\)\s*$/, ''));
    if (latin !== null) return { ok: false, reason: 'latin', letters: latin[1]!.split(/\s+/).filter((x) => x !== '').join(' ') };
    if (/\bLATIN_ONLY\b/.test(message)) return { ok: false, reason: 'latin', letters: '' };
    if (/INVALID_SUBJECT:\s*'(code|symbology)'/.test(message)) return { ok: false, reason: 'code' };
    if (/unmapped or empty:|MISSING_SLOT/.test(message)) return { ok: false, reason: 'missing' };
  }
  return { ok: false, reason: 'other', detail: message === '' ? code : message };
}

/** The hosted till's: the staff document route, through the operator's session. */
export function portDocuments(transport: DocumentTransport, appKey: string = APP_KEY): DocumentsPort {
  return {
    async labelSheet(itemId, count) {
      const id = /^\d+$/.test(itemId) ? Number(itemId) : itemId;
      try {
        const reply = await transport.mutate<{ contentUrl?: unknown }>(`/api/v1/apps/${encodeURIComponent(appKey)}/documents/render`, 'POST', {
          kind: 'label-sheet',
          ref: 'menu_items',
          pk: { id },
          // The one slot the manifest lets a request fill (`requestValues`).
          values: { count },
        });
        return typeof reply.contentUrl === 'string' ? { ok: true, url: reply.contentUrl } : { ok: false, reason: 'other', detail: 'no address came back' };
      } catch (error) {
        return labelOutcomeOf(error);
      }
    },
  };
}

/** Before a hosted till sets its port, and in the demo: nothing draws a label. */
const none: DocumentsPort = { labelSheet: async () => ({ ok: false, reason: 'off' }) };

let current: DocumentsPort = none;

export function setDocuments(port: DocumentsPort): void {
  current = port;
}

export const documents = (): DocumentsPort => current;
