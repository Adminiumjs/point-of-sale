/**
 * The till's doors to the payments Adminium takes: a card reader, a ticket's
 * pay link. Like the desk (`desk.ts`) none of them is ever queued — a card on
 * a reader is now or not at all — and none is answered from the till's own
 * memory: without a connection they are refused here and the screen says so.
 *
 *   sessionPayDesk   Adminium's payment routes, as the signed-in staff member
 *   null             the demo and the tests: there is no reader to reach
 *
 * Every call names the ticket by its key; the reader charge and the pay link
 * name it as Adminium does (the connection, the table's id, the row's key),
 * which this works out from the session.
 */
import type { SessionTransport } from './sessionSource';
import { asSinkError, dbKey, type RowId } from './sink';
import { chargeOf, payLinkOf, readerOf, type ChargeView, type PayLink, type TillReader } from './payments';

export interface PayDesk {
  /** The readers paired in Adminium. */
  readers(): Promise<TillReader[]>;
  /**
   * Put a ticket's amount on a reader: what is due, or less (`amount`, a part
   * of it). The reader asks the guest for a tip. A charge already on its way
   * for the ticket (a reloaded till) is answered again, never sent twice.
   */
  charge(ticket: RowId, readerId: string, amount: string | null): Promise<ChargeView>;
  /** Where a charge stands. */
  charged(attemptId: string): Promise<ChargeView>;
  /** Take the amount off the reader; a card already taken stays a payment. */
  cancel(attemptId: string): Promise<ChargeView>;
  /** The ticket's pay link: the one already current, else a new one. */
  payLink(ticket: RowId): Promise<PayLink>;
  /** Close a pay link: nobody can pay with it any more. */
  closeLink(linkId: string): Promise<void>;
}

let current: PayDesk | null = null;
/** The payment doors, or null where there is no server (the demo, the tests). */
export const payDesk = (): PayDesk | null => current;
export function setPayDesk(next: PayDesk | null): void {
  current = next;
}

export function sessionPayDesk(transport: SessionTransport, ticketsTable: string): PayDesk {
  const call = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      // The session is found first (the connection, and the token every write carries), whichever door is asked first.
      await transport.connection();
      return await run();
    } catch (error) {
      if ((error as { code?: string }).code !== 'CSRF_FAILED') throw asSinkError(error);
      await transport.refresh().catch(() => undefined);
      try {
        return await run();
      } catch (again) {
        throw asSinkError(again);
      }
    }
  };
  /** The ticket as Adminium names a record. */
  const record = async (ticket: RowId) => ({ connectionId: await transport.connection(), table: await transport.tableId(ticketsTable), recordId: String(dbKey(ticket)) });
  const payable = async (ticket: RowId) => {
    const r = await record(ticket);
    return { kind: 'profile', connectionId: r.connectionId, tableName: r.table, rowKey: r.recordId };
  };
  return {
    async readers() {
      const answer = await call(() => transport.get<{ data?: unknown[] }>('/api/v1/payments/terminal/readers'));
      return (answer.data ?? []).flatMap((one) => {
        const reader = readerOf(one);
        return reader === null ? [] : [reader];
      });
    },
    async charge(ticket, readerId, amount) {
      const body = { ...(await record(ticket)), readerId, amount, tipping: true };
      const answer = await call(() => transport.mutate<{ data?: unknown }>('/api/v1/payments/terminal/charge', 'POST', body));
      return chargeOf(answer.data);
    },
    async charged(attemptId) {
      return chargeOf((await call(() => transport.get<{ data?: unknown }>(`/api/v1/payments/terminal/charges/${encodeURIComponent(attemptId)}`))).data);
    },
    async cancel(attemptId) {
      return chargeOf((await call(() => transport.mutate<{ data?: unknown }>(`/api/v1/payments/terminal/charges/${encodeURIComponent(attemptId)}/cancel`, 'POST', {}))).data);
    },
    async payLink(ticket) {
      const body = await payable(ticket);
      const kept = payLinkOf((await call(() => transport.mutate<{ data?: unknown }>('/api/v1/payments/links/current', 'POST', body))).data);
      if (kept !== null) return kept;
      const made = await call(() => transport.mutate<{ data?: { link?: unknown } }>('/api/v1/payments/links', 'POST', body));
      const link = payLinkOf(made.data?.link);
      if (link === null) throw asSinkError(new Error('no pay link came back'));
      return link;
    },
    async closeLink(linkId) {
      await call(() => transport.mutate<unknown>(`/api/v1/payments/links/${encodeURIComponent(linkId)}/revoke`, 'POST', {}));
    },
  };
}
