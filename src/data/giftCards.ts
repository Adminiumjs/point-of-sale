/**
 * Gift cards and their history — read when the Gift cards screen asks, never
 * at boot (wave 2, 55-T70).
 *
 * A card is found by its code (typed, or scanned into the field), and its
 * balance is Adminium's: a rollup of the card's history (`manifest.json`), so a
 * card spent at another till reads true the next time it is looked up. Writes
 * — a new card, a load, a payment from it, a refund onto it — go through the
 * outbox like every other write.
 *
 *   demoGiftCards   the demo's card, as the comp draws it
 *   portGiftCards   Adminium's tables, as the signed-in staff member
 */
import { DEMO } from '../surface';
import type { SnapshotPort } from './snapshotPort';
import type { GiftCard, GiftCardEntry } from './types';
import { instant } from './venueTime';

export interface GiftCardBook {
  /** The card with this code, whatever way it was typed; null when there is none. */
  byCode(code: string): Promise<GiftCard | null>;
  /** Its latest history, newest first. */
  activity(cardId: string): Promise<GiftCardEntry[]>;
}

/**
 * A code as Adminium writes it: upper case, Crockford's reading of the letters
 * a person mistypes (O → 0, I and L → 1), and its dash back in after the prefix.
 */
export function normaliseCode(typed: string): string {
  const bare = typed
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const body = bare.startsWith('GC') ? bare.slice(2) : bare;
  return body === '' ? '' : `GC-${body}`;
}

/* ------------------------------------------------------------------ demo */

const DAY = 86_400_000;

/** The comp's card (COMP 2021-2023): $38.50 left after a load and a purchase. */
export function demoCards(): GiftCard[] {
  return [{ id: 'gc-1', code: 'GC-48219930', status: 'active', balance: 38.5, issuedAt: Date.now() - 40 * DAY }];
}

function demoActivity(cardId: string): GiftCardEntry[] {
  if (cardId !== 'gc-1') return [];
  const now = Date.now();
  return [
    { id: 'gc-1-3', kind: 'redeem', amount: -11.5, at: now - 2 * DAY },
    { id: 'gc-1-2', kind: 'reload', amount: 25, at: now - 9 * DAY },
    { id: 'gc-1-1', kind: 'issue', amount: 25, at: now - 40 * DAY },
  ];
}

export const demoGiftCards: GiftCardBook = {
  byCode: async (code) => demoCards().find((c) => c.code === normaliseCode(code)) ?? null,
  activity: async (cardId) => demoActivity(cardId),
};

/** Before the hosted till sets its reader: no cards to find (the demo has its own). */
const noCards: GiftCardBook = { byCode: async () => null, activity: async () => [] };
let current: GiftCardBook = DEMO ? demoCardsFor() : noCards;
function demoCardsFor(): GiftCardBook {
  return demoGiftCards;
}
export const giftCards = (): GiftCardBook => current;
/** Read from Adminium from now on (the hosted till). */
export function setGiftCards(next: GiftCardBook): void {
  current = next;
}

/* ------------------------------------------------------------------ port */

type Num = number | string;
type Key = number | string;

interface WireCard {
  id: Key;
  code: string | null;
  status: GiftCard['status'];
  balance: Num | null;
  issued_at: string | null;
}
interface WireEntry {
  id: Key;
  kind: GiftCardEntry['kind'];
  amount: Num;
  at: string;
}

const n = (value: Num | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

export function cardOf(row: WireCard): GiftCard {
  return {
    id: String(row.id),
    code: row.code ?? '',
    status: row.status,
    balance: n(row.balance),
    issuedAt: row.issued_at === null ? null : instant(row.issued_at),
  };
}

export function portGiftCards(port: SnapshotPort): GiftCardBook {
  return {
    async byCode(code) {
      const wanted = normaliseCode(code);
      if (wanted === '') return null;
      const res = await port.list<WireCard>('giftCards', { limit: 1, offset: 0, where: { column: 'code', op: 'eq', value: wanted } });
      const row = res.data[0];
      return row === undefined ? null : cardOf(row);
    },
    async activity(cardId) {
      const res = await port.list<WireEntry>('giftCardLedger', {
        limit: 20,
        offset: 0,
        where: { column: 'card_id', op: 'eq', value: Number.isNaN(Number(cardId)) ? cardId : Number(cardId) },
        order: 'at.desc',
      });
      return res.data.map((row) => ({ id: String(row.id), kind: row.kind, amount: n(row.amount), at: instant(row.at) }));
    },
  };
}
