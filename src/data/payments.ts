/**
 * THE PAYMENTS ADMINIUM TAKES FOR A TICKET: a card reader at the counter, a
 * pay link the guest scans, and what a standalone terminal leaves behind.
 *
 * Adminium writes every payment it takes into the till's own `payments`
 * table, as `online`, with its reference (`payment_ref`), the service it went
 * through (`provider`), what it was paid with (`paid_with`, "Visa ••4242" from
 * a reader) and a reader's approval code and last four. A payment taken on a
 * standalone terminal is the till's own `card` row with the approval code and
 * last four the cashier typed from the slip. Nothing here moves money: the
 * till asks Adminium (`data/desk.ts`) and shows what it answers.
 *
 * Which of these a ticket's payment was is read from the row itself
 * (`wayOf`): Adminium's row with a card's last four came from a reader, one
 * without from a pay link.
 */
import type { StaffPayments } from '../staffConnection';

/** A reader paired in Adminium, as a till lists them. */
export interface TillReader {
  id: string;
  label: string;
  mode: 'test' | 'live';
  online: boolean;
  /** When it was last heard from (epoch ms). */
  lastSeenAt: number | null;
  locationName: string | null;
}

/** Where a charge on a reader stands, as Adminium answers it. */
export type ChargeState = 'sending' | 'on_reader' | 'paid' | 'declined' | 'cancelled' | 'failed';
export interface ChargeView {
  attemptId: string;
  state: ChargeState;
  /** What was asked of the card, tip apart. */
  amount: number;
  currency: string;
  tip: number | null;
  last4: string | null;
  message: string | null;
}

/** A ticket's pay link: the address its QR carries, and until when it works. */
export interface PayLink {
  id: string;
  url: string;
  mode: 'test' | 'live';
  expiresAt: number;
}

/** Nothing switched on: the till reads as it always has. */
export const NO_PAYMENTS: StaffPayments = { on: false, online: false, test: false, refund: false };

/**
 * The readers this till may take a card on: a live one while the till is
 * switched on in Adminium's Payments, a test one only for someone rehearsing
 * (a test charge on a real ticket would land nowhere).
 */
export function usableReaders(readers: readonly TillReader[], payments: StaffPayments): TillReader[] {
  return readers.filter((reader) => (reader.mode === 'live' ? payments.on : payments.test));
}

/** How one payment of a ticket was taken. */
export type PaymentWay = 'reader' | 'link' | 'terminal' | 'card' | 'cash' | 'qr' | 'gift_card';

/** The payment row's own word for how it was taken. */
export function wayOf(row: { method: string; payment_last4?: unknown; approval_code?: unknown }): PaymentWay {
  const filled = (value: unknown) => value !== null && value !== undefined && String(value) !== '';
  if (row.method === 'online') return filled(row.payment_last4) ? 'reader' : 'link';
  if (row.method === 'card') return filled(row.approval_code) ? 'terminal' : 'card';
  if (row.method === 'cash' || row.method === 'qr' || row.method === 'gift_card') return row.method;
  return 'card';
}

/** A refund of this payment sends the money back through the payment service, by itself. */
export const sendsBack = (way: PaymentWay | undefined): boolean => way === 'reader' || way === 'link';

/** The approval code on a terminal slip: letters and digits, at most 12. */
export const APPROVAL_CODE = /^[A-Za-z0-9]{1,12}$/;
/** The card's last four: exactly four digits. */
export const LAST_FOUR = /^\d{4}$/;

/** What is wrong with what was typed from a terminal slip, field by field. */
export function slipErrors(code: string, last4: string): { code: boolean; last4: boolean } {
  return { code: !APPROVAL_CODE.test(code.trim()), last4: !LAST_FOUR.test(last4.trim()) };
}

/** The approval code as it is kept: trimmed, in capitals. */
export const approvalOf = (code: string): string => code.trim().toUpperCase();

/** Why a refund that sends money back is made, as the till keeps it on the refund row. */
export const REFUND_REASONS = ['wrong-item', 'quality', 'changed-mind', 'other'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

// ── which reader this till uses: a choice of the device, not of the shop ──

const READER_KEY = 'pos-reader';

/** The reader this device takes cards on, or null for a standalone terminal. */
export function chosenReader(): string | null {
  try {
    const kept = localStorage.getItem(READER_KEY);
    return kept === null || kept === '' ? null : kept;
  } catch {
    return null;
  }
}

/** Keep this device's choice; false when the browser keeps nothing. */
export function chooseReader(id: string | null): boolean {
  try {
    if (id === null) localStorage.removeItem(READER_KEY);
    else localStorage.setItem(READER_KEY, id);
    return true;
  } catch {
    return false;
  }
}

// ── the wire ─────────────────────────────────────────────────────────────────

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const amount = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));

/** One reader from `GET /payments/terminal/readers`. */
export function readerOf(raw: unknown): TillReader | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = text(r['id']);
  if (id === null) return null;
  return {
    id,
    label: text(r['label']) ?? id,
    mode: r['mode'] === 'live' ? 'live' : 'test',
    online: r['online'] === true,
    lastSeenAt: typeof r['lastSeenAt'] === 'number' ? r['lastSeenAt'] : null,
    locationName: text(r['locationName']),
  };
}

const STATES: readonly ChargeState[] = ['sending', 'on_reader', 'paid', 'declined', 'cancelled', 'failed'];

/** A charge from the terminal routes' `data`. */
export function chargeOf(raw: unknown): ChargeView {
  const r = (raw ?? {}) as Record<string, unknown>;
  const state = STATES.includes(r['state'] as ChargeState) ? (r['state'] as ChargeState) : 'failed';
  return {
    attemptId: String(r['attemptId'] ?? ''),
    state,
    amount: amount(r['amount']) ?? 0,
    currency: text(r['currency']) ?? '',
    tip: amount(r['tip']),
    last4: text(r['last4']),
    message: text(r['message']),
  };
}

/** A pay link from the links routes' `data`, or null. */
export function payLinkOf(raw: unknown): PayLink | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = text(r['id']);
  const url = text(r['url']);
  if (id === null || url === null || typeof r['expiresAt'] !== 'number') return null;
  return { id, url, mode: r['mode'] === 'live' ? 'live' : 'test', expiresAt: r['expiresAt'] };
}
