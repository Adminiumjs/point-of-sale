/**
 * The till's write seam: the one outbox every store action saves through.
 *
 * It starts on a memory sink, so the demo and the tests run the same writes
 * the real till makes and simply keep them in memory. The hosted staff build
 * swaps in the session sink (main.tsx), and from then on every action lands in
 * Adminium's tables.
 *
 * Writes name tables by the manifest's short names (`tickets`,
 * `ticket_items`); `WRITE_TABLES` is how they reach the real ones an install
 * made (`pos_tickets`).
 */
import { memorySink, type DataSink } from '../data/sink';
import { createOutbox, type Outbox, type OutboxState } from './outbox';

/** Every table the till writes, short name → the name an install gives it. */
export const WRITE_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'tickets',
    'ticket_items',
    'ticket_item_modifiers',
    'payments',
    'refunds',
    'refund_items',
    'shifts',
    'reservations',
    'time_clock',
    'menu_items',
    'staff',
    'customers',
    'loyalty_ledger',
    'gift_cards',
    'gift_card_ledger',
  ].map((short) => [short, `pos_${short}`]),
);

let box: Outbox = createOutbox(memorySink());
const watchers = new Set<(state: OutboxState) => void>();
let unwatch: () => void = box.subscribe((state) => watchers.forEach((watch) => watch(state)));

export const outbox = (): Outbox => box;

/** Save through another sink from now on (the hosted till's session). */
export function setSink(sink: DataSink): void {
  unwatch();
  box = createOutbox(sink);
  unwatch = box.subscribe((state) => watchers.forEach((watch) => watch(state)));
  const now = box.state();
  watchers.forEach((watch) => watch(now));
}

/** Follow the outbox's state, across a sink swap. */
export function watchOutbox(watch: (state: OutboxState) => void): () => void {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

/** A key made on the device: a payment keeps its own, so a retry is the same payment. */
export const deviceKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
