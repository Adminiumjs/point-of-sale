/**
 * NEW GIFT CARDS WAITING TO BE PRINTED.
 *
 * Offers & gift cards answers the save that makes a card with the card's whole
 * code — once — and beside it a print ticket: a random name that lets the
 * person who made the card have it drawn, once, whatever their role reads.
 *
 * The till keeps the TICKET and never the code. The code is dropped where the
 * reply is read (`data/desk.ts`); what is kept here is which card, its last
 * four, what it was sold for and the ticket — in this tab's session storage,
 * so a reload between the sale and the print loses nothing. An entry goes when
 * the card is printed, when its line or its ticket is voided, and when the
 * server would no longer honour the ticket (ten minutes after the card was
 * made — after that a manager prints the card from Offers).
 */

export interface CardPrint {
  /** The card's key in Offers. */
  cardId: string;
  /** The print ticket the save handed over; it names nothing. */
  print: string;
  last4: string;
  amount: number;
  /** When the card was made. */
  at: number;
  /** The ticket that sold it is paid: there is money on the card, so it can be printed. */
  paid: boolean;
}

const KEY = 'pos.cardPrints';
/** How long the server honours a print ticket. */
export const PRINT_LIFE_MS = 10 * 60_000;

/** This tab's session storage, or nothing where there is none (a test, a locked-down browser). */
function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

let memory: CardPrint[] = [];

const valid = (one: unknown): one is CardPrint => {
  const e = (one ?? {}) as Record<string, unknown>;
  return typeof e['cardId'] === 'string' && typeof e['print'] === 'string' && e['print'] !== '' && typeof e['at'] === 'number';
};

function read(): CardPrint[] {
  const kept = store();
  if (kept === null) return memory;
  try {
    const parsed: unknown = JSON.parse(kept.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(valid).map((one) => ({ cardId: one.cardId, print: one.print, last4: String(one.last4 ?? ''), amount: Number(one.amount ?? 0), at: one.at, paid: one.paid === true }))
      : [];
  } catch {
    return [];
  }
}

function write(list: CardPrint[]): void {
  memory = list;
  const kept = store();
  if (kept === null) return;
  try {
    if (list.length === 0) kept.removeItem(KEY);
    else kept.setItem(KEY, JSON.stringify(list));
  } catch {
    /* Full or refused: the entries stay in memory for this page. */
  }
}

/** The cards still waiting, oldest first; one whose ticket has run out is dropped here. */
export function cardPrints(now: number = Date.now()): CardPrint[] {
  const all = read();
  const live = all.filter((one) => now - one.at < PRINT_LIFE_MS);
  if (live.length !== all.length) write(live);
  return live;
}

export function keepCardPrint(entry: Omit<CardPrint, 'at' | 'paid'>, now: number = Date.now()): void {
  write([...cardPrints(now).filter((one) => one.cardId !== entry.cardId), { ...entry, at: now, paid: false }]);
}

/** The ticket that sold these cards is paid. */
export function markCardsPaid(cardIds: readonly string[]): void {
  if (cardIds.length === 0) return;
  write(cardPrints().map((one) => (cardIds.includes(one.cardId) ? { ...one, paid: true } : one)));
}

/** Printed, or its line or ticket voided: the entry is gone. */
export function dropCardPrint(cardId: string): void {
  const all = read();
  if (all.some((one) => one.cardId === cardId)) write(all.filter((one) => one.cardId !== cardId));
}
