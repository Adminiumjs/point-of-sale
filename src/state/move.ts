/**
 * BRINGING THE TILL'S GIFT CARDS INTO OFFERS & GIFT CARDS — the till's half.
 *
 * Until 0.3.0 the till kept gift cards in its own two tables. With Offers &
 * gift cards connected they move, once: every old card is made in Offers under
 * the code it has always had, with every row of its history, and from then on
 * the till's own card tables are closed.
 *
 * Every step is an ordinary save through an ordinary door, so the whole run
 * is safe to press again: a row already moved writes nothing more, and a run
 * that stopped half-way picks up where it stopped.
 *
 *   1. CHECK    no open or held ticket carries a card line or a card payment;
 *   2. LATCH    Offers issues and tops up nothing while the move runs — and
 *               only while it runs does an old row make a card;
 *   3. ROWS     each old row is marked moved, oldest first, one save a row:
 *               that save hands the row (and its card's code) to Offers, which
 *               makes the card on its first row and writes one row of its own;
 *   4. COMPARE  every card holds in Offers exactly what it held here — to the
 *               cent, or the run stops with the latch still on;
 *   5. CLOSE    the new cards are let go, the old ones are marked moved (their
 *               tables are closed by rule from then on), the till remembers
 *               that the move is done, and the latch comes off.
 *
 * Only a Super Admin can write the latch, so only a Super Admin can run this;
 * anyone else is told who to ask and nothing is written.
 *
 * Nothing here touches the network itself: it speaks through a `MoveDoor`, so
 * the till's session and the contract's caller run the very same steps.
 */

export type MoveRow = Record<string, unknown>;

/** The tables the move reads and writes: the till's own, and two of Offers'. */
export type MoveTable = 'tickets' | 'ticket_items' | 'payments' | 'gift_cards' | 'gift_card_ledger' | 'settings' | 'offers:gift_cards' | 'offers:settings';

/** A save the server refused: its status, its code and, where it gave one, its reason. */
export class MoveRefused extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason: string | null;
  constructor(status: number, code: string, reason: string | null = null) {
    super(`${code}${reason === null ? '' : `: ${reason}`}`);
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

export interface OneByOneResult {
  id?: unknown;
  ok: boolean;
  error?: { code: string; reason?: string };
}

export interface MoveDoor {
  /** Every row of a table (all pages). */
  rows(table: MoveTable): Promise<MoveRow[]>;
  /** One change; throws `MoveRefused` when the server refuses it. */
  patch(table: MoveTable, id: unknown, values: MoveRow): Promise<void>;
  /** The same change to each row, each a save of its own, at most 500 a call. */
  oneByOne(table: MoveTable, ids: unknown[], values: MoveRow): Promise<{ results: OneByOneResult[]; notRun: number }>;
}

export type MoveOutcome =
  /** Done (now, or already): how many cards hold how much in Offers. */
  | { state: 'done'; cards: number; rows: number; cents: number; alreadyDone: boolean }
  /** Open or held tickets carry a gift card: finish or void them first. */
  | { state: 'blocked'; tickets: { id: unknown; number: string }[] }
  /** Not a Super Admin: nothing was written. */
  | { state: 'ask-owner' }
  /** A row was refused: the run stopped there, the latch is on, pressing again goes on. */
  | { state: 'row-refused'; card: string; code: string; reason: string | null; moved: number }
  /** A balance differs: the run stopped, the latch is on, the old screens stay in use. */
  | { state: 'mismatch'; cards: { code: string; here: number; inOffers: number | null }[] };

export interface MoveOptions {
  /** The moment the rows are marked with. */
  now?: () => Date;
  /** Why a card cancelled at the till is cancelled in Offers, in the shop's language. */
  voidReason: string;
  /** Told as the run goes: rows moved so far, of how many. */
  onProgress?: (moved: number, of: number) => void;
}

const OLD_TABLE = 'pos:gift_cards';
const CHUNK = 500;
const cents = (value: unknown): number => Math.round(Number(value ?? 0) * 100);
const empty = (value: unknown): boolean => value === null || value === undefined || value === '';
const yes = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true';
const same = (a: unknown, b: unknown): boolean => String(a) === String(b);
const time = (value: unknown): number => {
  const at = Date.parse(String(value ?? ''));
  return Number.isNaN(at) ? 0 : at;
};

/** Which open or held tickets carry a gift card — a card line not voided, or a card payment. */
export function ticketsWithCards(tickets: readonly MoveRow[], lines: readonly MoveRow[], payments: readonly MoveRow[]): { id: unknown; number: string }[] {
  const open = tickets.filter((ticket) => ticket['status'] === 'open' || ticket['status'] === 'sent');
  const carrying = new Set<string>();
  for (const line of lines) if (empty(line['voided_at']) && (!empty(line['gift_card_id']) || !empty(line['card_id']))) carrying.add(String(line['ticket_id']));
  for (const payment of payments) if (payment['method'] === 'gift_card') carrying.add(String(payment['ticket_id']));
  return open.filter((ticket) => carrying.has(String(ticket['id']))).map((ticket) => ({ id: ticket['id'], number: String(ticket['number'] ?? ticket['id']) }));
}

/** What the banner says before the move: how many of the till's cards hold money, and how much in all. */
export function cardsToMove(cards: readonly MoveRow[]): { count: number; cents: number } {
  const live = cards.filter((card) => card['status'] !== 'moved' && cents(card['balance']) !== 0);
  return { count: live.length, cents: live.reduce((sum, card) => sum + cents(card['balance']), 0) };
}

export async function runCardMove(door: MoveDoor, options: MoveOptions): Promise<MoveOutcome> {
  const now = options.now ?? (() => new Date());
  const settings = (await door.rows('settings'))[0];
  let latch: MoveRow | undefined;
  try {
    latch = (await door.rows('offers:settings'))[0];
  } catch (error) {
    // Offers' settings are not a till role's to read: only the owner runs the move.
    if (error instanceof MoveRefused && (error.status === 403 || error.status === 404)) return { state: 'ask-owner' };
    throw error;
  }
  if (settings === undefined || latch === undefined) throw new Error('the till or Offers has no settings row yet');
  const setLatch = async (on: boolean): Promise<boolean> => {
    try {
      await door.patch('offers:settings', latch!['id'], { cards_paused: on });
      return true;
    } catch (error) {
      // The latch is nobody's to write but a Super Admin's.
      if (error instanceof MoveRefused && (error.status === 403 || error.status === 404)) return false;
      throw error;
    }
  };

  const summary = async (alreadyDone: boolean): Promise<MoveOutcome> => {
    const brought = (await door.rows('offers:gift_cards')).filter((card) => card['moved_table'] === OLD_TABLE);
    const rows = (await door.rows('gift_card_ledger')).filter((row) => !empty(row['moved_at'])).length;
    return { state: 'done', cards: brought.length, rows, cents: brought.reduce((sum, card) => sum + cents(card['balance']), 0), alreadyDone };
  };

  // Pressed again after it finished: nothing to do but make sure the latch is off.
  if (yes(settings['cards_moved'])) {
    if (yes(latch['cards_paused']) && !(await setLatch(false))) return { state: 'ask-owner' };
    return summary(true);
  }

  // 1. CHECK
  const blocked = ticketsWithCards(await door.rows('tickets'), await door.rows('ticket_items'), await door.rows('payments'));
  if (blocked.length > 0) return { state: 'blocked', tickets: blocked };

  // 2. LATCH — the first write, and the one only a Super Admin can make.
  if (!(await setLatch(true))) return { state: 'ask-owner' };

  // 3. ROWS — oldest first, card by card (each row carries its card's code to Offers).
  const cards = (await door.rows('gift_cards')).filter((card) => card['status'] !== 'moved');
  const ledger = (await door.rows('gift_card_ledger')).sort((a, b) => time(a['at']) - time(b['at']) || String(a['id']).localeCompare(String(b['id'])));
  const pending = ledger.filter((row) => empty(row['moved_at']));
  let moved = 0;
  for (const card of cards) {
    const mine = pending.filter((row) => same(row['card_id'], card['id']));
    for (let at = 0; at < mine.length; at += CHUNK) {
      let ids = mine.slice(at, at + CHUNK).map((row) => row['id']);
      // A call answers `notRun` for the rows it had no time for: those are sent again.
      for (let round = 0; ids.length > 0 && round < 50; round += 1) {
        const reply = await door.oneByOne('gift_card_ledger', ids, { card_code: card['code'] ?? null, moved_at: now().toISOString() });
        const again: unknown[] = [];
        for (const [index, result] of reply.results.entries()) {
          if (result.ok) {
            moved += 1;
            continue;
          }
          if (result.error?.code === 'NOT_RUN') {
            again.push(result.id ?? ids[index]);
            continue;
          }
          // Refused: stop here, the latch on. What was moved stays moved; pressing again goes on from this row.
          return { state: 'row-refused', card: String(card['code'] ?? card['id']), code: result.error?.code ?? 'REFUSED', reason: result.error?.reason ?? null, moved };
        }
        options.onProgress?.(moved, pending.length);
        ids = again;
      }
    }
  }

  // 4. COMPARE — read again, now: a till that spent an old card while the rows went over has written a row
  // that is not moved yet, and a balance read before the run is not the balance now.
  const cardsNow = (await door.rows('gift_cards')).filter((card) => card['status'] !== 'moved');
  const ledgerNow = await door.rows('gift_card_ledger');
  const late = ledgerNow.filter((row) => empty(row['moved_at']));
  const codeOf = (card: MoveRow | undefined, id: unknown): string => String(card?.['code'] ?? id);
  if (late.length > 0) {
    // Pressing again moves them; until then the latch stays on and nothing is closed.
    const behind = [...new Set(late.map((row) => String(row['card_id'])))];
    return { state: 'mismatch', cards: behind.map((id) => ({ code: codeOf(cardsNow.find((card) => same(card['id'], id)), id), here: cents(cardsNow.find((card) => same(card['id'], id))?.['balance']), inOffers: null })) };
  }
  // Every old card that has a history OR holds anything at all, against the card Offers now keeps for it.
  const inOffers = (await door.rows('offers:gift_cards')).filter((card) => card['moved_table'] === OLD_TABLE);
  const withHistory = cardsNow.filter((card) => ledgerNow.some((row) => same(row['card_id'], card['id'])));
  const counted = cardsNow.filter((card) => withHistory.includes(card) || cents(card['balance']) !== 0);
  const differing: { code: string; here: number; inOffers: number | null }[] = [];
  for (const card of counted) {
    const twin = inOffers.find((one) => same(one['moved_from'], card['id']));
    const here = cents(card['balance']);
    const there = twin === undefined ? null : cents(twin['balance']);
    // A card cancelled at the till holds nothing a customer can spend once it is cancelled in Offers too.
    const settled = twin !== undefined && card['status'] === 'void' && twin['status'] === 'void' && there === 0;
    if (there !== here && !settled) differing.push({ code: codeOf(card, card['id']), here, inOffers: there });
  }
  if (differing.length > 0) return { state: 'mismatch', cards: differing };

  // 5. CLOSE — the old tables first, Offers last.
  for (const card of withHistory) {
    const twin = inOffers.find((one) => same(one['moved_from'], card['id']))!;
    if (card['status'] === 'void' && twin['status'] !== 'void') await door.patch('offers:gift_cards', twin['id'], { status: 'void', void_reason: options.voidReason });
    if (yes(twin['moving'])) await door.patch('offers:gift_cards', twin['id'], { moving: false });
  }
  const open = cardsNow.map((card) => card['id']);
  for (let at = 0; at < open.length; at += CHUNK) {
    const reply = await door.oneByOne('gift_cards', open.slice(at, at + CHUNK), { status: 'moved' });
    const refused = reply.results.find((result) => !result.ok);
    if (refused !== undefined) return { state: 'row-refused', card: String(refused.id ?? ''), code: refused.error?.code ?? 'REFUSED', reason: refused.error?.reason ?? null, moved };
  }
  await door.patch('settings', settings['id'], { cards_moved: true });
  await setLatch(false);
  return summary(false);
}
