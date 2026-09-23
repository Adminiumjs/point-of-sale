/**
 * Closed sales, read when Refund asks — never at boot.
 *
 * Refund starts from "Today's tickets" and can find an older sale by its
 * number. Neither belongs in the boot read set (a busy day is hundreds of
 * tickets nobody refunds), so they are read on demand, through the same port
 * the snapshot uses, and only for the ticket being looked at: its lines, their
 * options (for the line's description), how it was paid, and what earlier
 * refunds already gave back.
 *
 *   demoHistory   the demo's seeded sales
 *   portHistory   Adminium's tables, as the signed-in staff member
 *
 * The till adds the sales it closes itself (the store keeps them), so a sale
 * rung up a minute ago is on the list before any read.
 */
import { DEMO } from '../surface';
import { seedSales } from './demo';
import { listAll, listIn } from './listing';
import type { ListCondition, SnapshotPort } from './snapshotPort';
import type { PastLine, PastSale, PayMethod } from './types';
import { instant, venueDay, venueMidnight } from './venueTime';

export interface SalesHistory {
  /** Today's paid tickets, newest first. */
  today(): Promise<PastSale[]>;
  /** Paid tickets with this number, whenever they closed. */
  find(number: string): Promise<PastSale[]>;
}

export const demoHistory: SalesHistory = {
  today: async () => seedSales(),
  find: async (number) => seedSales().filter((sale) => String(sale.number) === digits(number)),
};

/** Before the hosted till sets its reader: nothing to list (the demo lists its own). */
const noHistory: SalesHistory = { today: async () => [], find: async () => [] };
let current: SalesHistory = DEMO ? demoHistoryFor() : noHistory;
function demoHistoryFor(): SalesHistory {
  return demoHistory;
}
export const history = (): SalesHistory => current;
/** Read from Adminium from now on (the hosted till). */
export function setHistory(next: SalesHistory): void {
  current = next;
}

const digits = (value: string): string => value.replace(/\D+/g, '');

type Num = number | string;
type Key = number | string;
interface WireTicket {
  id: Key;
  number: string | null;
  table_id: Key | null;
  subtotal: Num;
  tax: Num;
  total: Num;
  closed_at: string | null;
  customer_id: Key | null;
}
interface WireLine {
  id: Key;
  ticket_id: Key;
  name: string;
  qty: Num;
  unit_price: Num;
  voided_at: string | null;
  gift_card_id: Key | null;
}
interface WireOption {
  ticket_item_id: Key;
  modifier_id: Key | null;
}
interface WirePayment {
  ticket_id: Key;
  method: PayMethod;
  reference: string | null;
  paid_at: string;
}
interface WireRefund {
  id: Key;
  ticket_id: Key;
  amount: Num;
}
interface WireRefundItem {
  refund_id: Key;
  ticket_item_id: Key;
  qty: Num;
}

/** The gift card that paid, when one did: a refund can go back onto it. */
const giftCodeOf = (paid: WirePayment[]): string | undefined => paid.find((p) => p.method === 'gift_card' && p.reference !== null)?.reference ?? undefined;

const n = (value: Num | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));
const key = (value: Key): string => String(value);
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Sales read through the port. `optionName` names a chosen option (menu v1, the
 * snapshot's groups); `tableLabel` a table id.
 */
export function portHistory(
  port: SnapshotPort,
  deps: { timeZone?: string; optionName: (id: string) => string | null; tableLabel: (id: string) => string | null },
): SalesHistory {
  const read = async (where: ListCondition): Promise<PastSale[]> => {
    const tickets = await listAll<WireTicket>(port, 'tickets', { size: 100, max: 200, where, order: 'closed_at.desc' });
    if (tickets.length === 0) return [];
    const ids = tickets.map((row) => row.id);
    const [lines, payments, refunds] = await Promise.all([
      listIn<WireLine>(port, 'ticketItems', 'ticket_id', ids, 200),
      listIn<WirePayment>(port, 'payments', 'ticket_id', ids, 200),
      listIn<WireRefund>(port, 'refunds', 'ticket_id', ids, 200),
    ]);
    const kept = lines.filter((row) => row.voided_at === null);
    const [options, refundItems] = await Promise.all([
      listIn<WireOption>(port, 'ticketItemModifiers', 'ticket_item_id', kept.map((row) => row.id), 200),
      listIn<WireRefundItem>(port, 'refundItems', 'refund_id', refunds.map((row) => row.id), 200),
    ]);
    const given = new Map<string, number>();
    for (const row of refundItems) given.set(key(row.ticket_item_id), (given.get(key(row.ticket_item_id)) ?? 0) + n(row.qty));
    return tickets.map((ticket) => {
      const own = kept.filter((row) => key(row.ticket_id) === key(ticket.id));
      const pastLines: PastLine[] = own.map((row) => ({
        rid: key(row.id),
        name: row.name,
        qty: n(row.qty),
        unit: n(row.unit_price),
        line: round2(n(row.unit_price) * n(row.qty)),
        mod: options
          .filter((o) => key(o.ticket_item_id) === key(row.id) && o.modifier_id !== null)
          .map((o) => deps.optionName(key(o.modifier_id!)))
          .filter((name): name is string => name !== null)
          .join(' · '),
        refunded: given.get(key(row.id)) ?? 0,
        ...(row.gift_card_id === null || row.gift_card_id === undefined ? {} : { giftCard: true as const }),
      }));
      const paid = payments.filter((p) => key(p.ticket_id) === key(ticket.id)).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
      const subtotal = n(ticket.subtotal);
      const tax = n(ticket.tax);
      const total = n(ticket.total);
      return {
        rid: key(ticket.id),
        number: Number(/(\d+)/.exec(ticket.number ?? '')?.[1] ?? ticket.id),
        table: ticket.table_id === null ? null : deps.tableLabel(key(ticket.table_id)),
        closedAt: ticket.closed_at === null ? 0 : instant(ticket.closed_at),
        method: paid[0]?.method ?? 'card',
        lines: pastLines,
        subtotal,
        // Total = goods after the discount + tax, so what is left over is the discount.
        discount: Math.max(0, round2(subtotal + tax - total)),
        tax,
        total,
        refunded: round2(refunds.filter((r) => key(r.ticket_id) === key(ticket.id)).reduce((sum, r) => sum + n(r.amount), 0)),
        ...(ticket.customer_id === null || ticket.customer_id === undefined ? {} : { customerId: key(ticket.customer_id) }),
        ...(giftCodeOf(paid) === undefined ? {} : { giftCardCode: giftCodeOf(paid)! }),
      };
    });
  };
  return {
    today: () =>
      read({
        and: [
          { column: 'status', op: 'eq', value: 'paid' },
          { column: 'closed_at', op: 'gte', value: venueMidnight(venueDay(Date.now(), deps.timeZone), deps.timeZone) },
        ],
      }),
    find: (number) => {
      const typed = number.trim();
      const bare = digits(typed);
      if (bare === '') return Promise.resolve([]);
      /*
       * Adminium numbers a ticket with its digits alone ("1043"); the sample
       * data's history is spelled "S-1042", padded to four ("S-0990"). All are
       * asked for, and whatever the cashier typed.
       */
      const spellings = [...new Set([typed, bare, `S-${bare}`, `S-${bare.padStart(4, '0')}`])];
      return read({ and: [{ column: 'status', op: 'eq', value: 'paid' }, { column: 'number', op: 'in', value: spellings }] });
    },
  };
}
