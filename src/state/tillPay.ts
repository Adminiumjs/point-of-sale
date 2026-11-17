/**
 * TAKING A CARD THROUGH ADMINIUM, AND A PAY LINK, AT THE TILL.
 *
 * Three ways a card is taken, each on its own condition:
 *
 *   a card reader      paired in Adminium and chosen for this till (Till
 *                      settings). The till asks Adminium to put what is due on
 *                      the reader; Adminium drives the reader and writes the
 *                      payment into the till's `payments` table — what the
 *                      reader took, its tip beside it. The till follows the
 *                      charge every second and, once the payment is there,
 *                      goes on as after any other payment.
 *   a standalone terminal
 *                      the card is taken on the shop's own terminal, and the
 *                      cashier records it with the approval code and the last
 *                      four from the slip. Nothing is sent anywhere.
 *   the demo           today's animation (the demo build only).
 *
 * The QR tab shows the ticket's pay link while guests can pay online (the
 * server is on the internet and a payment service is live); the guest pays
 * on their phone, Adminium writes the payment, and the till sees it arrive.
 * Otherwise the QR tab marks the ticket paid by hand, as it always has.
 *
 * A reader collects its own tip, and a pay link carries what is due and no
 * tip: while either is in use the till's tip is set aside (and given back if
 * the cashier turns to another way).
 *
 * NOTHING HERE IS GIVEN UP BLIND. A charge whose answer is lost is followed
 * until Adminium says how it ended; a cancel that loses the race to the card
 * is a payment, and recorded as one.
 */
import { t } from '../i18n/ambient';
import { desk } from '../data/desk';
import { payDesk } from '../data/payDesk';
import { approvalOf, slipErrors, usableReaders, type ChargeView, type PayLink, type TillReader } from '../data/payments';
import { asSinkError, type RowId, type SinkRow } from '../data/sink';
import type { Split } from '../data/types';
import { chargeTarget, remaining, round2 } from './calc';
import { outbox } from './writes';
import type { PosState } from './store';

/** Where a charge on the reader stands, as the card tab shows it. */
export type ReaderPhase = 'sending' | 'on_reader' | 'recording' | 'approved' | 'declined' | 'cancelled' | 'offline' | 'nonet' | 'busy' | 'failed';

export interface ReaderRun {
  phase: ReaderPhase;
  attemptId: string | null;
  readerId: string;
  label: string;
  /** What was asked of the card, tip apart. */
  amount: number;
  tip: number | null;
  paidWith: string | null;
  last4: string | null;
  /** The cancel came after the card was approved: the payment stands. */
  race: boolean;
  cancelling: boolean;
  /** The ticket it is for. */
  rid: string;
  seq: number;
}

/** Where the ticket's pay link stands, as the QR tab shows it. */
export type LinkPhase = 'making' | 'waiting' | 'closing' | 'paid' | 'closed' | 'expired' | 'failed';

export interface LinkRun {
  phase: LinkPhase;
  link: PayLink | null;
  /** What the link asks: the ticket's balance, no tip. */
  amount: number;
  /** What arrived through it. */
  paid: number;
  rid: string;
  /** Why no link could be made, in the till's words. */
  words: string | null;
  seq: number;
}

/** What is typed from a standalone terminal's slip. */
export interface Slip {
  code: string;
  last4: string;
  /** Record was pressed: the fields say what is wrong with them. */
  tried: boolean;
  busy: boolean;
  done: { amount: number; last4: string } | null;
}

export const EMPTY_SLIP: Slip = { code: '', last4: '', tried: false, busy: false, done: null };

/** What the store lends this module: its own doors, so a payment here is saved and settled as every other. */
export interface TillPayCtx {
  get: () => PosState;
  set: (partial: Partial<PosState> | ((s: PosState) => Partial<PosState>)) => void;
  /** Save one payment the till took itself (the slip's approval code and last four in `extra`). */
  savePayment: (split: Split, settles: boolean, extra?: SinkRow) => Promise<boolean>;
  /** A payment is in: add it to the ticket's, and close the ticket when it settles it. `tipless`: no tip of the till's rides on it. */
  took: (split: Split, settles: boolean, tipless: boolean) => void;
  refreshTicket: (rid?: string) => Promise<void>;
  awaitingTotal: () => boolean;
  offline: () => boolean;
}

/** How often a charge and a pay link are asked about, and how long a result stays on screen (shortened by tests). */
export const TIMING = { poll: 1_000, linkPoll: 2_000, shown: 1_400 };
/** How many times a payment Adminium says it took is looked for in the till's table, a poll apart. */
const RECORD_WAIT = 60;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let seq = 0;

// ── which way the card and QR tabs work ─────────────────────────────────────

/** The reader this till takes cards on now: chosen here, paired, and usable while payments are on (or rehearsed). */
export function tillReader(s: Pick<PosState, 'payments' | 'readers' | 'readerId' | 'connected'>): TillReader | null {
  if (!s.connected || s.readerId === null || s.readers === null) return null;
  return usableReaders(s.readers, s.payments).find((reader) => reader.id === s.readerId) ?? null;
}

/** The card tab: today's animation where there is no server (the demo), the till's reader, or a standalone terminal. */
export function cardPanel(s: Pick<PosState, 'payments' | 'readers' | 'readerId' | 'connected' | 'cardWay'>): 'demo' | 'reader' | 'terminal' {
  if (!s.connected) return 'demo';
  return tillReader(s) !== null && s.cardWay === 'reader' ? 'reader' : 'terminal';
}

/** The QR tab: the ticket's pay link while guests can pay online, else marked paid by hand as today. */
export function qrPanel(s: Pick<PosState, 'payments' | 'connected'>): 'link' | 'mark' {
  return s.connected && s.payments.online ? 'link' : 'mark';
}

/** The till's tip is set aside while a reader or a pay link takes the payment. */
export function setTipAside(ctx: Pick<TillPayCtx, 'get' | 'set'>): void {
  const s = ctx.get();
  if (s.tipBefore !== null) return;
  ctx.set({ tipBefore: { tip: s.tip, tipCustom: s.tipCustom }, tip: 'c', tipCustom: '' });
}

/** And given back when the cashier turns to another way. */
export function giveTipBack(ctx: Pick<TillPayCtx, 'get' | 'set'>): void {
  const was = ctx.get().tipBefore;
  if (was === null) return;
  ctx.set({ tipBefore: null, tip: was.tip, tipCustom: was.tipCustom });
}

/** Whether a charge is on its way: the reader holds the amount, or its payment is being read. */
export const chargeRunning = (run: ReaderRun | null): boolean =>
  run !== null && (run.phase === 'sending' || run.phase === 'on_reader' || run.phase === 'recording' || run.phase === 'approved' || ((run.phase === 'offline' || run.phase === 'nonet') && run.attemptId !== null));

/** The ticket's key on the server, once every change to it is saved. */
function savedTicket(s: PosState): { rid: string; id: RowId } | null {
  const rid = s.ticket.rid;
  if (rid === undefined || outbox().pendingIn(rid) > 0) return null;
  const id = outbox().resolve(rid);
  return id === undefined ? null : { rid, id };
}

// ── the reader ──────────────────────────────────────────────────────────────

const updateRun = (ctx: TillPayCtx, mine: number, patch: Partial<ReaderRun>) =>
  ctx.set((s) => (s.charge !== null && s.charge.seq === mine ? { charge: { ...s.charge, ...patch } } : {}));
const current = (ctx: TillPayCtx, mine: number): ReaderRun | null => {
  const run = ctx.get().charge;
  return run !== null && run.seq === mine ? run : null;
};

/** Whether the reader is off the network, read again from Adminium (and kept for the settings screen). */
async function readerOff(ctx: TillPayCtx, readerId: string): Promise<boolean> {
  const pd = payDesk();
  if (pd === null) return false;
  try {
    const readers = await pd.readers();
    ctx.set({ readers });
    return readers.find((reader) => reader.id === readerId)?.online === false;
  } catch {
    return false;
  }
}

/** Charge what is due (or this part of it) on the till's reader. */
export async function chargeReader(ctx: TillPayCtx): Promise<void> {
  const s = ctx.get();
  const pd = payDesk();
  const reader = tillReader(s);
  if (pd === null || reader === null || chargeRunning(s.charge) || s.paying) return;
  const mine = ++seq;
  const base: ReaderRun = { phase: 'sending', attemptId: null, readerId: reader.id, label: reader.label, amount: 0, tip: null, paidWith: null, last4: null, race: false, cancelling: false, rid: s.ticket.rid ?? '', seq: mine };
  if (ctx.offline()) {
    ctx.set({ charge: { ...base, phase: 'nonet' } });
    return;
  }
  if (ctx.awaitingTotal()) return;
  const saved = savedTicket(s);
  if (saved === null) {
    // The ticket's last change is still on its way: the charge waits for it.
    ctx.set({ charge: null });
    s.showToast(t('toast.totalComing'));
    return;
  }
  const rem = remaining(s);
  const amount = round2(Math.min(chargeTarget(s), rem));
  if (amount <= 0) return;
  const whole = amount >= rem - 0.005;
  ctx.set({ charge: { ...base, amount, rid: saved.rid } });
  let view: ChargeView;
  try {
    view = await pd.charge(saved.id, reader.id, whole ? null : amount.toFixed(2));
  } catch (raw) {
    const error = asSinkError(raw);
    const reason = error.details['reason'];
    updateRun(ctx, mine, { phase: error.status === 0 || reason === 'network-off' ? 'nonet' : reason === 'reader-busy' ? 'busy' : reason === 'reader-offline' ? 'offline' : 'failed' });
    return;
  }
  updateRun(ctx, mine, { attemptId: view.attemptId, amount: view.amount });
  await follow(ctx, mine, view, rem);
}

/** Follow a charge until Adminium says how it ended. */
async function follow(ctx: TillPayCtx, mine: number, first: ChargeView, rem: number): Promise<void> {
  const pd = payDesk();
  if (pd === null) return;
  let view = first;
  for (let tick = 0; ; tick += 1) {
    const run = current(ctx, mine);
    if (run === null || run.attemptId === null) return;
    if (view.state === 'paid') return recorded(ctx, mine, view, rem);
    // The cashier's cancel was answered: taken off the reader, nothing taken.
    if (run.phase === 'cancelled') return;
    if (view.state === 'declined') return updateRun(ctx, mine, { phase: 'declined', cancelling: false });
    if (view.state === 'cancelled') return updateRun(ctx, mine, { phase: 'cancelled', cancelling: false });
    if (view.state === 'failed') {
      // Refused at the reader: off the network, or anything else.
      return updateRun(ctx, mine, { phase: (await readerOff(ctx, run.readerId)) ? 'offline' : 'failed', cancelling: false });
    }
    // Still on its way. The reader's own state is read now and then: off the network, the cashier is told.
    const off = tick % 5 === 4 ? await readerOff(ctx, run.readerId) : run.phase === 'offline';
    if (current(ctx, mine) === null) return;
    // `processing` (the card is being read) is drawn as the charge on the reader: readers seldom say it.
    updateRun(ctx, mine, { phase: off ? 'offline' : view.state === 'sending' ? 'sending' : 'on_reader' });
    await sleep(TIMING.poll);
    if (current(ctx, mine) === null) return;
    try {
      view = await pd.charged(run.attemptId);
    } catch (raw) {
      // No answer: the charge is still where it was. Followed again, never ended blind.
      if (asSinkError(raw).status === 0) updateRun(ctx, mine, { phase: 'nonet' });
    }
  }
}

/** The reader took it: wait for the payment in the till's table, show it, and go on. */
async function recorded(ctx: TillPayCtx, mine: number, view: ChargeView, rem: number): Promise<void> {
  // What the card was, as the reader said it ("Visa ••4242"); the recorded row says the same once it is in.
  const told = view.brand !== null && view.last4 !== null ? `${view.brand} ••${view.last4}` : null;
  updateRun(ctx, mine, { phase: 'recording', tip: view.tip, last4: view.last4, paidWith: told, cancelling: false });
  const d = desk();
  let row: SinkRow | undefined;
  for (let i = 0; i < RECORD_WAIT && d !== null && row === undefined; i += 1) {
    try {
      row = (await d.rows('payments', { column: 'payment_ref', op: 'eq', value: view.attemptId }, 1))[0];
    } catch {
      // asked again
    }
    if (row === undefined) await sleep(TIMING.poll);
  }
  const run = current(ctx, mine);
  if (run === null) return;
  const tip = view.tip ?? 0;
  const paidWith = told ?? (row !== undefined && typeof row['paid_with'] === 'string' && row['paid_with'] !== '' ? row['paid_with'] : null);
  const last4 = row !== undefined && typeof row['payment_last4'] === 'string' && row['payment_last4'] !== '' ? row['payment_last4'] : view.last4;
  updateRun(ctx, mine, { phase: 'approved', paidWith, last4 });
  const split: Split = {
    method: 'card',
    via: 'reader',
    amount: round2(view.amount + tip),
    tip,
    reader: run.label,
    ...(row?.['id'] === undefined || row['id'] === null ? {} : { id: String(row['id']) }),
    ...(last4 === null ? {} : { last4 }),
    ...(paidWith === null ? {} : { paidWith }),
  };
  await sleep(TIMING.shown);
  // A ticket that left the register meanwhile keeps its payment; the till shows it when the ticket is back.
  if (current(ctx, mine) === null) return;
  if (ctx.get().ticket.rid !== run.rid) {
    ctx.set({ charge: null });
    return;
  }
  ctx.took(split, rem - view.amount <= 0.005, true);
}

/** Take the amount off the reader. A card approved first is a payment, and it is recorded. */
export async function cancelReader(ctx: TillPayCtx): Promise<void> {
  const run = ctx.get().charge;
  const pd = payDesk();
  if (pd === null || run === null || run.attemptId === null || run.cancelling) return;
  if (run.phase !== 'sending' && run.phase !== 'on_reader' && run.phase !== 'offline' && run.phase !== 'nonet') return;
  updateRun(ctx, run.seq, { cancelling: true });
  try {
    const after = await pd.cancel(run.attemptId);
    if (after.state === 'paid') updateRun(ctx, run.seq, { race: true });
    else if (after.state === 'cancelled') updateRun(ctx, run.seq, { phase: 'cancelled', cancelling: false });
    else updateRun(ctx, run.seq, { cancelling: false });
  } catch {
    updateRun(ctx, run.seq, { cancelling: false });
    ctx.get().showToast(t('reader.cancelLost'), 'error');
  }
}

/** Off the reader, to a standalone terminal: what is on the reader is taken off first, as far as it can be told. */
export async function toTerminal(ctx: TillPayCtx): Promise<void> {
  const run = ctx.get().charge;
  if (run !== null && run.attemptId !== null && chargeRunning(run) && run.phase !== 'recording' && run.phase !== 'approved') {
    const pd = payDesk();
    try {
      const after = pd === null ? null : await pd.cancel(run.attemptId);
      // The card was taken after all: that is the payment, not a second one on the terminal.
      if (after !== null && after.state === 'paid') {
        updateRun(ctx, run.seq, { race: true, phase: 'on_reader' });
        return;
      }
    } catch {
      // Not reached: Adminium takes it off the reader itself once the reader is back, and a card taken before is still recorded.
    }
  }
  ctx.set({ charge: null, cardWay: 'terminal' });
  giveTipBack(ctx);
}

// ── the standalone terminal ─────────────────────────────────────────────────

/** Record what the terminal took, from its slip. */
export async function recordSlip(ctx: TillPayCtx): Promise<void> {
  const s = ctx.get();
  const slip = s.slip;
  const wrong = slipErrors(slip.code, slip.last4);
  if (wrong.code || wrong.last4) {
    ctx.set({ slip: { ...slip, tried: true } });
    return;
  }
  if (s.paying || slip.busy || ctx.awaitingTotal()) return;
  const rem = remaining(s);
  const amount = round2(Math.min(chargeTarget(s), rem));
  if (amount <= 0) return;
  const last4 = slip.last4.trim();
  const split: Split = { method: 'card', via: 'terminal', amount, last4 };
  const settles = rem - amount <= 0.005;
  ctx.set({ slip: { ...slip, busy: true } });
  const ok = await ctx.savePayment(split, settles, { approval_code: approvalOf(slip.code), payment_last4: last4 });
  if (!ok) {
    ctx.set((st) => ({ slip: { ...st.slip, busy: false } }));
    return;
  }
  ctx.set({ slip: { ...EMPTY_SLIP, done: { amount, last4 } } });
  await sleep(TIMING.shown);
  ctx.took(split, settles, false);
}

// ── the pay link ────────────────────────────────────────────────────────────

const updateLink = (ctx: TillPayCtx, mine: number, patch: Partial<LinkRun>) =>
  ctx.set((s) => (s.link !== null && s.link.seq === mine ? { link: { ...s.link, ...patch } } : {}));
const linkNow = (ctx: TillPayCtx, mine: number): LinkRun | null => {
  const run = ctx.get().link;
  return run !== null && run.seq === mine ? run : null;
};

/** Show the ticket's pay link, and wait for the guest to pay it. */
export async function openLink(ctx: TillPayCtx): Promise<void> {
  const s = ctx.get();
  const pd = payDesk();
  const d = desk();
  if (pd === null || d === null || qrPanel(s) !== 'link') return;
  if (s.link !== null && (s.link.phase === 'making' || s.link.phase === 'waiting')) return;
  const mine = ++seq;
  const base: LinkRun = { phase: 'making', link: null, amount: 0, paid: 0, rid: s.ticket.rid ?? '', words: null, seq: mine };
  setTipAside(ctx);
  if (ctx.offline()) {
    ctx.set({ link: { ...base, phase: 'failed', words: t('link.offline') } });
    return;
  }
  const saved = savedTicket(ctx.get());
  if (saved === null || showsEstimateOf(ctx.get())) {
    ctx.set({ link: { ...base, phase: 'failed', words: t('toast.totalComing') } });
    if (saved !== null) void ctx.refreshTicket();
    return;
  }
  const amount = remaining(ctx.get());
  ctx.set({ link: { ...base, amount, rid: saved.rid } });
  let before: Set<string>;
  let link: PayLink;
  try {
    // What the ticket held before the link: a payment that arrives is a new one.
    before = new Set((await d.rows('payments', { column: 'ticket_id', op: 'eq', value: saved.id })).map((row) => String(row['id'])));
    link = await pd.payLink(saved.id);
  } catch (raw) {
    const error = asSinkError(raw);
    updateLink(ctx, mine, { phase: 'failed', words: error.status === 0 ? t('link.offline') : t('link.refused') });
    return;
  }
  updateLink(ctx, mine, { phase: 'waiting', link });
  for (;;) {
    await sleep(TIMING.linkPoll);
    const run = linkNow(ctx, mine);
    if (run === null || (run.phase !== 'waiting' && run.phase !== 'closing')) return;
    if (Date.now() >= link.expiresAt) return updateLink(ctx, mine, { phase: 'expired' });
    let fresh: SinkRow[];
    try {
      fresh = (await d.rows('payments', { and: [{ column: 'ticket_id', op: 'eq', value: saved.id }, { column: 'payment_ref', op: 'not_null' }] })).filter((row) => !before.has(String(row['id'])));
    } catch {
      continue;
    }
    if (fresh.length === 0) continue;
    const paid = round2(fresh.reduce((sum, row) => sum + Number(row['amount'] ?? 0), 0));
    const provider = fresh.map((row) => row['provider']).find((value): value is string => typeof value === 'string' && value !== '');
    updateLink(ctx, mine, { phase: 'paid', paid });
    await sleep(TIMING.shown);
    if (linkNow(ctx, mine) === null) return;
    if (ctx.get().ticket.rid !== run.rid) {
      ctx.set({ link: null });
      return;
    }
    const split: Split = {
      method: 'online',
      via: 'link',
      amount: paid,
      ...(fresh.length === 1 && fresh[0]!['id'] !== undefined ? { id: String(fresh[0]!['id']) } : {}),
      ...(provider === undefined ? {} : { provider }),
    };
    ctx.took(split, amount - paid <= 0.005, true);
    return;
  }
}

/** Close the pay link: nobody can pay with it any more. */
export async function closeLink(ctx: TillPayCtx, quiet = false): Promise<void> {
  const run = ctx.get().link;
  const pd = payDesk();
  if (run === null) return;
  if (run.link === null || pd === null || run.phase !== 'waiting') {
    if (quiet) ctx.set({ link: null });
    return;
  }
  if (quiet) ctx.set({ link: null });
  else updateLink(ctx, run.seq, { phase: 'closing' });
  try {
    await pd.closeLink(run.link.id);
    if (!quiet) ctx.set((s) => (s.link !== null && s.link.seq === run.seq && s.link.phase === 'closing' ? { link: { ...s.link, phase: 'closed' } } : {}));
  } catch {
    if (quiet) return;
    // Not closed: the link is still open, and the till goes on waiting for it.
    ctx.set((s) => (s.link !== null && s.link.seq === run.seq && s.link.phase === 'closing' ? { link: { ...s.link, phase: 'waiting' } } : {}));
    ctx.get().showToast(t('link.closeLost'), 'error');
  }
}

/** The till shows its own estimate (Adminium's figures are not in yet). */
const showsEstimateOf = (s: PosState): boolean => s.connected && !s.figureless && s.ticket.server === undefined;
