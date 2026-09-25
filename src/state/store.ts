// Central POS store — a faithful port of the design comp's `class Component
// extends DCLogic`. One store is shared across register / floor / payment /
// kitchen, exactly like the comp's single-store shape. View routing is a single
// `view` state var (no router), also like the comp.

import { create } from 'zustand';

// Toast copy is produced inside actions, which are not React components — the
// ambient bridge hands back the same `t` the tree is rendering with.
import { t } from '../i18n/ambient';
/* The SEAM, not the seed. `demoSource` here meant a connected till read the
 * demo catalogue no matter what the server said — the swap had nowhere to
 * land. */
import { source } from '../data/source';
import { seedTicket } from '../data/demo';
import { dbKey, type SinkError, type SinkRow } from '../data/sink';
import { locale, tenantZone } from '../i18n/ambient';
import { DEMO_FEATURES, NO_FEATURES, type Features } from '../features';
import { DEMO, HOSTED } from '../surface';
import { bookingDays, seatFor, slotFull } from './bookings';
import { demoMembers, demoRewards, loyalty } from '../data/loyalty';
import { pointsFor, pointsLeft } from './points';
import { matches as matchesMember } from '../data/loyalty';
import { demoCards, giftCards, normaliseCode } from '../data/giftCards';
import { printOnly } from '../components/print';
import { SESSION_STAFF_ID } from '../data/sessionOperator';
import type { OutboxState } from './outbox';
import { deviceKey, outbox, watchOutbox } from './writes';
import type {
  ClockEntry,
  Discount,
  DiscountKind,
  GiftCard,
  GiftCardEntry,
  HeldTicket,
  KdsOrder,
  LineItem,
  Member,
  PastSale,
  PickupChannel,
  PickupOrder,
  ReceiptVia,
  PointsEntry,
  PayMethod,
  Reservation,
  ReservationStatus,
  Reward,
  Sale,
  ServiceMode,
  Selection,
  ShiftTotals,
  Split,
  Staff,
  TableInfo,
  Theme,
  Ticket,
  Toast,
  View,
} from '../data/types';
import {
  chargeTarget,
  chosenOptions,
  groupsOf,
  goodsOf,
  lineName,
  discountAmt,
  itemById,
  keyOf,
  lineTotal,
  lineUnit,
  modLabel,
  money,
  netSub,
  regTotal,
  remaining,
  round2,
  subtotal,
  tableName,
  tax,
  tipAmt,
  total,
} from './calc';

type CardState = 'waiting' | 'reading' | 'approved' | 'declined';
type SplitMode = 'none' | 'even' | 'amount';

export interface PosState {
  // display / behaviour
  theme: Theme;
  /** True once the Adminium host frame chose the theme (29 D11) — never persisted. */
  themeFromHost: boolean;
  mode: ServiceMode;
  online: boolean;
  view: View;
  tick: number;

  // login
  loginStep: 'pin' | 'drawer';
  pin: string;
  pinErr: boolean;
  staffSel: string;
  drawer: number;

  // register
  cat: string;
  search: string;
  menuDensity: 'cozy' | 'dense';
  coursing: boolean;
  unavail: string[];
  ticket: Ticket;
  held: HeldTicket[];

  // modifier sheet
  sheetOpen: boolean;
  sheetId: string | null;
  sheetQty: number;
  /** What is chosen on the sheet, by group (menu v1). */
  sheetSel: Selection;
  sheetNote: string;
  sheetSeat: number;

  // overlays
  heldOpen: boolean;
  voidOpen: boolean;
  voidText: string;
  voidKey: string | null;
  moveOpen: boolean;
  discountOpen: boolean;
  discount: Discount | null;

  // payment
  payMethod: PayMethod;
  cash: string;
  tip: number | 'c';
  tipCustom: string;
  card: CardState;
  declined: boolean;
  splits: Split[];
  splitMode: SplitMode;
  splitN: number;
  splitCustom: string;

  // sale + kitchen
  lastSale: Sale | null;
  /** What the add-ons attached to this till switch on (features.ts). */
  features: Features;
  kds: KdsOrder[];

  toast: Toast | null;

  /** What the outbox has not saved yet — the offline chip and the sign-in notice read it. */
  sync: OutboxState;
  /** The open shift's row (a temporary key until saved). */
  shiftRid: string | null;
  /** A payment is on its way to the server: the charge buttons wait for it. */
  paying: boolean;

  /** The floor as it stands: which tables are free, and since when one is not. */
  floor: TableInfo[];
  /** Bookings from today on. */
  reservations: Reservation[];

  /** The open shift's takings, kept up as the till sells and refunds. */
  shiftTotals: ShiftTotals;
  /** When the open shift began. */
  shiftStart: number;
  /** The sales this till closed since it opened, newest first (Refund lists them). */
  sales: PastSale[];
  /** Every active staff member, and who is clocked in. */
  roster: Staff[];
  clock: ClockEntry[];
  /** When someone clocked out, this session. */
  clockedOutAt: Record<string, number>;

  // close shift
  closeCount: number;

  // refund
  refundSale: PastSale | null;
  /** Indexes of the chosen sale's lines being given back. */
  refundSel: number[];
  refundMethod: PayMethod;
  refundDone: { total: number; count: number } | null;
  refunding: boolean;

  // reservations
  resvDay: number;
  resvSel: string | null;
  /** The New reservation sheet is open (the demo card's shortcut opens it too). */
  resvNewOpen: boolean;

  // loyalty (wave 2)
  /** The rewards on offer, read when Loyalty first opens. */
  rewards: Reward[];
  /** Every member the till has seen this session, by id: what it last knew of them. */
  members: Record<string, Member>;
  /** The points history this till wrote, by member — shown before any read has it. */
  pointsLog: Record<string, PointsEntry[]>;
  loyaltyQuery: string;
  /** The members the search found, by id. */
  loyaltyResults: string[];
  loyaltySel: string | null;
  /** The chosen member's latest history, newest first. */
  loyaltyActivity: PointsEntry[];
  loyaltyBusy: boolean;
  enrollOpen: boolean;

  // gift cards (wave 2)
  /** Every card the till has looked at this session, by id: what it last knew of it. */
  cards: Record<string, GiftCard>;
  giftSel: string | null;
  /** The chosen card's latest history, newest first. */
  giftActivity: GiftCardEntry[];
  /** The history this till wrote, by card — shown before any read has it. */
  giftLog: Record<string, GiftCardEntry[]>;
  giftBusy: boolean;

  // customer display (wave 2)
  /** The guest's side of the ticket: where they are, whether they signed, the receipt they want. */
  display: { step: 'order' | 'sign'; signed: boolean; receipt: ReceiptVia | ''; receiptTo: string };
  /** The custom-tip pad (the display's, which Payment's Custom opens too). */
  tipPad: string | null;

  // pickup (wave 2)
  /** Orders waiting to be collected, oldest first. */
  pickups: PickupOrder[];
  /** The sheet that makes the ticket on the register a pickup order. */
  pickupSheetOpen: boolean;

  // actions
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  /** Theme pushed by the Adminium host frame. Applied, never written to storage. */
  setHostTheme: (t: Theme) => void;
  setMode: (m: ServiceMode) => void;
  toggleOnline: () => void;
  toggleDeclined: () => void;
  go: (v: View | 'move' | 'discount') => void;
  doTick: () => void;
  showToast: (msg: string, kind?: Toast['kind']) => void;

  selStaff: (id: string) => void;
  pinPush: (d: string) => void;
  autofillPin: () => void;
  drawerAdj: (v: number) => void;
  drawerPreset: (v: number) => void;
  openShift: () => void;

  setCat: (slug: string) => void;
  setSearch: (q: string) => void;
  setDensity: (d: 'cozy' | 'dense') => void;
  toggleCoursing: () => void;
  emptyTicket: () => void;
  resetTicket: () => void;

  tapTile: (id: string) => void;
  /** A scanned barcode: the item it belongs to joins the ticket, as a tap on its tile would. */
  scanCode: (code: string) => void;
  inc: (k: string) => void;
  dec: (k: string) => void;
  removeKey: (k: string) => void;
  send: () => void;
  hold: () => void;
  resumeHeld: (n: number) => void;

  openSheet: (id: string) => void;
  closeSheet: () => void;
  sheetQtyInc: () => void;
  sheetQtyDec: () => void;
  /** Pick an option: a radio group holds one, a check group up to its `max`. */
  toggleOption: (groupId: string, optionId: string) => void;
  setSheetNote: (n: string) => void;
  setSheetSeat: (n: number) => void;
  sheetAdd: () => void;

  openVoid: (k: string) => void;
  setVoidText: (t: string) => void;
  closeVoid: () => void;
  confirmVoid: () => void;

  openMove: () => void;
  closeMove: () => void;
  doMove: (label: string) => void;
  doMerge: (n: number) => void;
  openDiscount: () => void;
  closeDiscount: () => void;
  /** `reason`, when one was chosen, is what the ticket records as why (§0.6); the label is what the receipt prints. */
  applyDiscount: (kind: DiscountKind, value: number, label: string, reason?: string) => void;
  clearDiscount: () => void;

  openPay: () => void;
  closeHeld: () => void;
  openHeld: () => void;
  setMethod: (m: PayMethod) => void;
  setTip: (i: number | 'c') => void;
  cashPush: (d: string) => void;
  cashPreset: (v: number) => void;
  setSplitN: (n: number) => void;
  setSplitFraction: (f: number) => void;
  clearSplit: () => void;
  onCharge: () => void;
  newOrder: () => void;
  printReceipt: () => void;
  /** A texted receipt: the demo's only, until a text-message add-on exists. */
  sendReceipt: (kind: 'text') => void;
  /**
   * Email the receipt of the sale that just closed to the guest's address:
   * one message in the outbox, which Adminium sends with the receipt drawn by
   * Invoices & Receipts attached. `invalid` for an address that is not one,
   * `off` while the feature is off, `none` with no saved sale to send.
   */
  emailReceipt: (to: string) => 'queued' | 'invalid' | 'off' | 'none';

  bumpK: (n: number) => void;
  openTable: (t: TableInfo) => void;

  /** 86 an item, or put it back on sale. */
  toggle86: (id: string) => void;

  clockIn: (staffId: string) => void;
  clockOut: (staffId: string) => void;
  addStaff: (person: { name: string; role: string; email: string }) => Promise<boolean>;
  deactivateStaff: (staffId: string) => void;

  openRefund: () => void;
  pickRefundSale: (sale: PastSale) => void;
  toggleRefundLine: (i: number) => void;
  setRefundMethod: (m: PayMethod) => void;
  processRefund: () => Promise<void>;
  /** Back from a chosen sale to the list, or from the list to the register. */
  refundBack: () => void;

  openShiftClose: () => void;
  closeCountAdj: (v: number) => void;
  finishShift: () => Promise<void>;

  resvSetDay: (i: number) => void;
  resvPick: (id: string | null) => void;
  seatResv: (id: string) => void;
  assignResvTable: (id: string, table: TableInfo) => void;
  setResvStatus: (id: string, status: ReservationStatus) => void;
  saveResvNote: (id: string, note: string) => void;
  createResv: (draft: { name: string; mobile: string; party: number; startsAt: number; note: string }) => boolean;

  openLoyalty: () => void;
  loyaltySearch: (query: string) => void;
  loyaltyPick: (id: string) => void;
  /** Put a member on the ticket on the register: they earn its points. */
  attachMember: (id: string) => void;
  /** Take them off again, and any reward they were spending on it. */
  detachMember: () => void;
  /** Spend the chosen member's points on a reward: its item joins the ticket, free. */
  redeemReward: (rewardId: string) => void;
  setEnrollOpen: (open: boolean) => void;
  enroll: (person: { name: string; mobile: string; email: string }) => Promise<boolean>;

  openGiftCards: () => void;
  /** Look a card up by its code; false when there is none. */
  findGiftCard: (code: string) => Promise<boolean>;
  /** A new card, not yet paid for: it is sold by putting an amount on the ticket. */
  issueGiftCard: () => Promise<boolean>;
  /** Put this much on the chosen card: a line on the ticket, credited when the ticket is paid. */
  loadGiftCard: (amount: number) => void;
  /** Pay the ticket from the chosen card, as far as its balance goes. */
  payWithGiftCard: () => void;

  /** The guest's tip on the display: a preset by index, or 'custom' for the pad. */
  displayTip: (choice: number | 'custom') => void;
  openTipPad: () => void;
  tipPadPush: (key: string) => void;
  applyTipPad: () => void;
  closeTipPad: () => void;
  displayContinue: () => void;
  displayBack: () => void;
  displaySign: () => void;
  displayReceipt: (via: ReceiptVia) => void;
  displayReceiptTo: (to: string) => void;
  /** Signed and chosen: saved on the ticket, and the display is ready for the till again. */
  displayDone: () => void;

  setPickupSheet: (open: boolean) => void;
  /** Make the ticket on the register an order someone will collect. */
  markPickup: (order: { name: string; mobile: string; channel: PickupChannel }) => Promise<boolean>;
  /** Queued → making → ready → handed off. */
  advancePickup: (rid: string) => void;
  /** Say it is ready: noted on the order (the message itself goes from the device). */
  notifyPickup: (rid: string) => void;
}

// Timers held module-side (mirrors the comp's this._ct / this._pt handles).
let ptTimer: ReturnType<typeof setTimeout>;
let ctTimer: ReturnType<typeof setTimeout>;
let ct2Timer: ReturnType<typeof setTimeout>;
let ttTimer: ReturnType<typeof setTimeout>;

const curStaffOf = (s: PosState): Staff => {
  const roster = source.staff();
  return roster.find((x: Staff) => x.id === s.staffSel) ?? (roster[0] as Staff);
};

/*
 * What to reset after a partial payment lands.
 *
 * A "charge part of the balance" amount is consumed once it is paid. Clearing
 * `splitCustom` while leaving `splitMode: 'amount'` in place left the badge
 * reading "By amount · $0.00" over a charge button already targeting the whole
 * remaining balance — the screen and the button disagreed about what the next
 * tap would take. An even split is mid-sequence and stays as it is.
 */
const clearAmountSplit = (s: PosState): { splitMode?: SplitMode; splitCustom: string } =>
  s.splitMode === 'amount' ? { splitMode: 'none', splitCustom: '' } : { splitCustom: '' };

/** What the drawer should hold: the float, plus cash taken, less cash given back. */
export const expectedDrawer = (s: Pick<PosState, 'drawer' | 'shiftTotals'>): number =>
  round2(s.drawer + s.shiftTotals.cash - s.shiftTotals.cashRefunds);

/**
 * What giving back these lines of a sale comes to: the lines at what they were
 * sold for, less their share of any discount, plus the tax on that. Never more
 * than the sale has left after earlier refunds.
 */
export function refundMoney(sale: PastSale, sel: number[]): { sub: number; tax: number; total: number } {
  const goods = sel.reduce((sum, i) => {
    const l = sale.lines[i];
    return l === undefined ? sum : sum + l.unit * Math.max(0, l.qty - l.refunded);
  }, 0);
  const share = sale.subtotal > 0 ? Math.max(0, 1 - sale.discount / sale.subtotal) : 1;
  const sub = round2(goods * share);
  const tax$ = round2(sub * source.taxRate());
  const total = Math.min(round2(sub + tax$), round2(sale.total - sale.refunded));
  return { sub, tax: round2(Math.min(tax$, total)), total: Math.max(0, total) };
}

/** A booking code for the demo, which has no server to make one: never one already taken. */
function demoCode(taken: Reservation[]): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (;;) {
    let code = 'MR-';
    for (let i = 0; i < 4; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!taken.some((r) => r.code === code)) return code;
  }
}

/** The ticket on the register, parked on the held tray — its member goes with it. */
const parked = (tk: Ticket): HeldTicket => ({
  number: tk.number,
  rid: tk.rid,
  table: tk.table,
  at: Date.now(),
  seats: tk.seats,
  items: tk.items,
  ...(tk.customerId === undefined ? {} : { customerId: tk.customerId }),
});

/** Which member search is the latest: an older answer arriving late is dropped. */
let searchSeq = 0;
/** Which member's history is being read. */
let activitySeq = 0;
/** Which card's history is being read. */
let cardSeq = 0;

/** A card code for the demo, which has no server to make one. */
function demoGiftCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let code = 'GC-';
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/**
 * An address a receipt can be sent to: something@somewhere.tld, no spaces, at
 * most 254 characters. Deliberately loose — the mail server is the judge of an
 * address; this only catches a name or a number typed into the wrong field.
 */
export const isEmailAddress = (value: string): boolean =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const initialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('pos-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* no storage — fall through to light */
  }
  return 'light';
};

export const usePos = create<PosState>()((set, get) => {
  const nextNum = (): number => {
    const s = get();
    const nums = [s.ticket.number, ...s.held.map((h) => h.number)];
    if (s.lastSale) nums.push(s.lastSale.number);
    return Math.max(...nums) + 1;
  };
  const freshTicket = (): Ticket => ({
    number: nextNum(),
    table: get().mode === 'retail' ? '—' : null,
    seats: 2,
    openedAt: Date.now(),
    items: [],
  });
  const setItems = (items: LineItem[]) =>
    set((s) => ({ ticket: { ...s.ticket, items } }));
  const addLine = (
    id: string,
    opt: { qty?: number; selection?: Selection; note?: string; seat?: number; rewardId?: string } = {},
  ) => {
    const items = get().ticket.items.slice();
    const selection = opt.selection ?? {};
    const k = keyOf(id, selection, opt.note, opt.seat, opt.rewardId);
    const i = items.findIndex((x) => x.key === k);
    if (i >= 0) {
      items[i] = { ...items[i], qty: items[i].qty + (opt.qty || 1) };
    } else {
      items.push({
        key: k,
        rid: outbox().temp(),
        id,
        qty: opt.qty || 1,
        selection,
        note: opt.note || '',
        seat: opt.seat || 0,
        sent: false,
        ...(opt.rewardId === undefined ? {} : { rewardId: opt.rewardId }),
      });
    }
    setItems(items);
    const ticketRid = ensureTicket();
    if (i >= 0) {
      saveQty(items[i]);
    } else {
      const li = items[items.length - 1];
      // The chosen options are saved with the line, in the same write.
      const options = chosenOptions(li).map((o) => ({ modifier_id: itemKey(o.id), price_delta: o.delta }));
      void outbox().insert(ticketRid, 'ticket_items', lineValues(ticketRid, li), {
        temp: li.rid,
        ...(options.length === 0 ? {} : { children: [{ ref: 'ticket_item_modifiers', via: 'ticket_item_id', rows: options }] }),
        onRefused: (error) => {
          dropLine(li.rid);
          refused(error);
        },
      });
    }
  };
  // ---- saving (§ the outbox) ----
  /** Who rang it up: a staff row's key, or nobody for a session with no staff row. */
  const staffKey = () => {
    const id = curStaffOf(get()).id;
    return id === SESSION_STAFF_ID ? null : dbKey(id);
  };
  const tableKey = (label: string | null) => {
    if (label === null || label === '—') return null;
    // The floor as it stands — a table added or renamed since boot is on it, not in the boot read.
    const id = get().floor.find((x) => x.label === label)?.id;
    return id === undefined ? null : dbKey(id);
  };
  const itemKey = (id: string) => dbKey(id);
  const refused = (error: SinkError) =>
    get().showToast(
      error.field === null ? t('toast.notSaved') : t('toast.notSavedField', { field: error.field }),
      'error',
    );
  /** The server's number for a ticket that just saved, everywhere it is shown. */
  const renumber = (rid: string, row: SinkRow) => {
    const n = Number(row['number']);
    if (!Number.isFinite(n)) return;
    set((s) => ({
      ticket: s.ticket.rid === rid ? { ...s.ticket, number: n } : s.ticket,
      held: s.held.map((h) => (h.rid === rid ? { ...h, number: n } : h)),
      kds: s.kds.map((o) => (o.rid === rid ? { ...o, number: n } : o)),
      pickups: s.pickups.map((p) => (p.rid === rid ? { ...p, number: n } : p)),
    }));
    // A pickup order taken before its number came back is called by the real one.
    if (get().pickups.some((p) => p.rid === rid)) void saveTicket(rid, { pickup_code: String(n) });
  };
  /** A table taken or freed, on the floor the screens draw. */
  const occupy = (label: string | null, taken: boolean) => {
    if (label === null || label === '—') return;
    set((s) => ({
      floor: s.floor.map((tb) =>
        tb.label !== label
          ? tb
          : taken
            ? { ...tb, status: tb.status === 'open' ? 'occupied' : tb.status, since: tb.since ?? Date.now() }
            : { id: tb.id, zone: tb.zone, label: tb.label, seats: tb.seats, status: 'open' },
      ),
    }));
  };
  /** The ticket on the register as a row, written the first time it is needed. */
  const ensureTicket = (): string => {
    const tk = get().ticket;
    if (tk.rid !== undefined) return tk.rid;
    const rid = outbox().temp();
    set((s) => ({ ticket: { ...s.ticket, rid } }));
    void outbox().insert(
      rid,
      'tickets',
      {
        table_id: tableKey(tk.table),
        staff_id: staffKey(),
        shift_id: get().shiftRid,
        guests: Math.max(1, tk.seats || 1),
        status: 'open',
        held: false,
        ...(tk.reservationId === undefined ? {} : { reservation_id: tk.reservationId }),
        ...(tk.customerId === undefined ? {} : { customer_id: dbKey(tk.customerId) }),
      },
      { temp: rid, onSaved: (row) => renumber(rid, row), onRefused: refused },
    );
    return rid;
  };
  const lineValues = (ticketRid: string, li: LineItem) => ({
    ticket_id: ticketRid,
    menu_item_id: li.giftCard === undefined ? itemKey(li.id) : null,
    name: lineName(li),
    qty: li.qty,
    unit_price: round2(lineUnit(li)),
    seat: li.seat,
    notes: li.note === '' ? null : li.note,
    ...(li.rewardId === undefined ? {} : { reward_id: dbKey(li.rewardId) }),
    ...(li.giftCard === undefined ? {} : { gift_card_id: dbKey(li.giftCard.cardId) }),
  });
  /** A line the server would not take comes off the screen again. */
  const dropLine = (rid: string | undefined) => {
    if (rid === undefined) return;
    set((s) => ({ ticket: { ...s.ticket, items: s.ticket.items.filter((x) => x.rid !== rid) } }));
  };
  const saveQty = (li: LineItem) => {
    if (li.rid === undefined) return;
    void outbox().update(ensureTicket(), 'ticket_items', li.rid, { qty: li.qty }, { onRefused: refused });
  };
  const removeLine = (li: LineItem) => {
    if (li.rid === undefined) return;
    void outbox().remove(ensureTicket(), 'ticket_items', li.rid, { onRefused: refused });
  };
  const saveTicket = (rid: string | undefined, patch: SinkRow) => {
    if (rid === undefined) return Promise.resolve(null);
    return outbox().update(rid, 'tickets', rid, patch, { onRefused: refused });
  };
  /**
   * One payment, saved before the screen moves on: money waits for the server.
   * The payment that settles the ticket carries its tip, the way the Overview
   * adds tips up; a device-made key makes a retried one the same payment.
   */
  const savePayment = async (split: Split, settles: boolean): Promise<boolean> => {
    const rid = ensureTicket();
    const tip = settles ? tipAmt(get()) : 0;
    set({ paying: true });
    const row = await outbox().insert(
      rid,
      'payments',
      {
        id: deviceKey(),
        ticket_id: rid,
        method: split.method,
        amount: round2(split.amount - tip),
        tip,
        tendered: split.tendered ?? null,
        change: split.change ?? null,
        ...(split.reference === undefined ? {} : { reference: split.reference }),
        staff_id: staffKey(),
      },
      { onRefused: refused },
    );
    set({ paying: false });
    return row !== null;
  };

  /**
   * What the ticket's member earns and spends, written to their history once
   * the ticket is paid: one `earn` row (it is a visit) and one `redeem` row per
   * reward line. Adminium's rollups keep their balance; the till keeps what it
   * knows of them up to date on screen, and says it on the receipt.
   */
  const settlePoints = (s: PosState, ticketRid: string): Sale['member'] => {
    const memberId = s.ticket.customerId;
    if (memberId === undefined) return undefined;
    const member = s.members[memberId];
    const earned = pointsFor(netSub(s));
    const bought = goodsOf(s.ticket.items).filter((x) => x.rewardId === undefined).map(lineName);
    const at = Date.now();
    const entries: PointsEntry[] = [];
    const write = (kind: PointsEntry['kind'], points: number, rewardId: string | null, note: string | null, visit: number) => {
      const id = deviceKey();
      entries.unshift({ id, kind, points, rewardId, note, at });
      void outbox().insert(
        ticketRid,
        'loyalty_ledger',
        {
          id,
          customer_id: dbKey(memberId),
          kind,
          points,
          visit,
          reward_id: rewardId === null ? null : dbKey(rewardId),
          ticket_id: ticketRid,
          note,
          staff_id: staffKey(),
        },
        { onRefused: refused },
      );
    };
    write('earn', earned, null, bought.length === 0 ? null : bought.join(' · ').slice(0, 200), 1);
    let spent = 0;
    for (const li of s.ticket.items) {
      if (li.rewardId === undefined) continue;
      const reward = s.rewards.find((r) => r.id === li.rewardId);
      const cost = (reward?.points ?? 0) * li.qty;
      spent += cost;
      write('redeem', -cost, li.rewardId, reward?.name ?? null, 0);
    }
    set((st) => {
      const was = st.members[memberId];
      return {
        members:
          was === undefined
            ? st.members
            : { ...st.members, [memberId]: { ...was, points: was.points + earned - spent, lifetime: was.lifetime + earned, visits: was.visits + 1 } },
        pointsLog: { ...st.pointsLog, [memberId]: [...entries, ...(st.pointsLog[memberId] ?? [])] },
      };
    });
    return { name: member?.name ?? '', earned, balance: member === undefined ? null : member.points + earned - spent };
  };

  /**
   * The cards a paid ticket put money on: one ledger row each (`issue` for a
   * card sold now, `reload` for one already in use), and a new card switched
   * on. Adminium's rollup keeps the balance; the till keeps its own view.
   */
  const settleGiftLoads = (s: PosState, ticketRid: string) => {
    const at = Date.now();
    for (const li of s.ticket.items) {
      const load = li.giftCard;
      if (load === undefined) continue;
      const card = s.cards[load.cardId];
      const kind: GiftCardEntry['kind'] = card?.status === 'active' ? 'reload' : 'issue';
      const id = deviceKey();
      void outbox().insert(
        ticketRid,
        'gift_card_ledger',
        { id, card_id: dbKey(load.cardId), kind, amount: load.amount, ticket_id: ticketRid, staff_id: staffKey() },
        { onRefused: refused },
      );
      if (kind === 'issue') {
        void outbox().update(ticketRid, 'gift_cards', dbKey(load.cardId), { status: 'active', issued_at: new Date(at).toISOString() }, { onRefused: refused });
      }
      set((st) => {
        const was = st.cards[load.cardId];
        const entry: GiftCardEntry = { id, kind, amount: load.amount, at };
        return {
          cards:
            was === undefined
              ? st.cards
              : { ...st.cards, [load.cardId]: { ...was, status: 'active', balance: round2(was.balance + load.amount), issuedAt: was.issuedAt ?? at } },
          giftLog: { ...st.giftLog, [load.cardId]: [entry, ...(st.giftLog[load.cardId] ?? [])] },
        };
      });
    }
  };

  const finalize = async (splits: Split[], change: number) => {
    const before = get();
    // The ticket is paid only once the server says so; the receipt shows after.
    const closed = await saveTicket(before.ticket.rid, {
      status: 'paid',
      closed_at: new Date().toISOString(),
      tax: tax(before),
      tip: tipAmt(before),
      total: regTotal(before),
    });
    if (before.ticket.rid !== undefined && closed === null) return;
    const s = get();
    const member = s.ticket.rid === undefined ? undefined : settlePoints(s, s.ticket.rid);
    if (s.ticket.rid !== undefined) settleGiftLoads(s, s.ticket.rid);
    const sale: Sale = {
      ...(s.ticket.rid === undefined ? {} : { rid: s.ticket.rid }),
      ...(s.ticket.customerId === undefined ? {} : { customerId: s.ticket.customerId }),
      number: s.ticket.number,
      table: s.ticket.table,
      items: s.ticket.items.map((x) => ({
        name: lineName(x),
        qty: x.qty,
        unit: lineUnit(x),
        line: lineTotal(x),
        mod: modLabel(x),
        note: x.note,
      })),
      subtotal: subtotal(s),
      discount: discountAmt(s),
      discountLabel: s.discount ? s.discount.label : '',
      tax: tax(s),
      tip: tipAmt(s),
      total: total(s),
      splits,
      change,
      at: Date.now(),
      staff: curStaffOf(s).name,
      ...(member === undefined ? {} : { member }),
      ...(s.display.receipt === '' ? {} : { receipt: { via: s.display.receipt, to: s.display.receiptTo.trim() === '' ? null : s.display.receiptTo.trim() } }),
    };
    get().showToast(t('toast.paymentComplete', { amount: money(sale.total) }), 'success');
    // Paid: the table is free again.
    occupy(s.ticket.table, false);
    // The shift's takings follow, the way the connected till adds them up from payments.
    const took = (m: PayMethod) => round2(splits.filter((x) => x.method === m).reduce((sum, x) => sum + x.amount, 0));
    const was = s.shiftTotals;
    const shiftTotals: ShiftTotals = {
      ...was,
      orders: was.orders + 1,
      gross: round2(was.gross + regTotal(s)),
      card: round2(was.card + took('card')),
      cash: round2(was.cash + took('cash')),
      qr: round2(was.qr + took('qr')),
      gift: round2(was.gift + took('gift_card')),
      tips: round2(was.tips + sale.tip),
      comps: s.discount?.kind === 'comp' ? round2(was.comps + sale.discount) : was.comps,
    };
    const past: PastSale = {
      ...(s.ticket.rid === undefined ? {} : { rid: s.ticket.rid }),
      number: sale.number,
      table: sale.table,
      closedAt: sale.at,
      method: splits[0]?.method ?? 'card',
      lines: s.ticket.items.map((x) => ({
        ...(x.rid === undefined ? {} : { rid: x.rid }),
        name: lineName(x),
        qty: x.qty,
        unit: lineUnit(x),
        line: lineTotal(x),
        mod: modLabel(x),
        refunded: 0,
        ...(x.giftCard === undefined ? {} : { giftCard: true as const }),
      })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      total: round2(sale.total - sale.tip),
      refunded: 0,
      ...(s.ticket.customerId === undefined ? {} : { customerId: s.ticket.customerId }),
      ...(splits.find((x) => x.method === 'gift_card')?.reference === undefined ? {} : { giftCardCode: splits.find((x) => x.method === 'gift_card')!.reference! }),
    };
    set({
      shiftTotals,
      // A paid pickup order waits on its lines as they were sold.
      pickups: s.pickups.map((p) => (p.rid === s.ticket.rid ? { ...p, items: s.ticket.items.map((x) => (x.qty > 1 ? `${String(x.qty)}× ` : '') + lineName(x)) } : p)),
      sales: [past, ...s.sales],
      lastSale: sale,
      view: 'complete',
      /*
       * Retire the ticket that was just paid for.
       *
       * It used to stay on the register, fully intact: navigating back from the
       * receipt and pressing Pay charged the same items a second time and wrote
       * a second Sale under the same order number.
       */
      ticket: freshTicket(),
      splits: [],
      cash: '',
      card: 'waiting',
      splitMode: 'none',
      splitN: 0,
      splitCustom: '',
      // The tip was this ticket's too; the next guest chooses their own.
      tip: 0,
      tipCustom: '',
      display: { step: 'order', signed: false, receipt: '', receiptTo: '' },
      /*
       * The discount belongs to the ticket that just closed, not to the
       * register. Without this a comp stayed applied after the sale finalised,
       * so every subsequent customer was rung up free until someone noticed and
       * cleared it by hand.
       */
      discount: null,
    });
  };

  /**
   * A booking changed at the till: on screen now, saved in its own queue, and
   * put back as it was if the server refuses (a full slot, a booking that
   * changed underneath).
   */
  /** A member a ticket names but this till has not seen yet (another till's, or before a reload). */
  const knowMember = (id: string | undefined) => {
    if (id === undefined || get().members[id] !== undefined) return;
    void loyalty()
      .member(id)
      .then((member) => {
        if (member !== null) set((st) => ({ members: { [member.id]: member, ...st.members } }));
      })
      .catch(() => undefined);
  };

  /** Choose a card, and read its history (what this till wrote first). */
  const pickCard = (id: string) => {
    const seq = ++cardSeq;
    set((st) => ({ giftSel: id, giftActivity: st.giftLog[id] ?? [] }));
    if (outbox().resolve(id) === undefined) return; // not saved yet: nothing to read
    void giftCards()
      .activity(id)
      .then((read) => {
        if (seq !== cardSeq) return;
        set((st) => {
          const mine = st.giftLog[id] ?? [];
          return { giftActivity: [...mine, ...read.filter((e) => !mine.some((m) => m.id === e.id))].sort((a, b) => b.at - a.at).slice(0, 20) };
        });
      })
      .catch(() => undefined);
  };

  const patchResv = (id: string, local: Partial<Reservation>, patch: SinkRow) => {
    const before = get().reservations.find((x) => x.id === id);
    if (before === undefined) return;
    set((s) => ({ reservations: s.reservations.map((x) => (x.id === id ? { ...x, ...local } : x)) }));
    void outbox().update(`resv:${id}`, 'reservations', dbKey(id), patch, {
      onRefused: (error) => {
        set((s) => ({ reservations: s.reservations.map((x) => (x.id === id ? before : x)) }));
        if (error.code.startsWith('CAPACITY_')) get().showToast(t('resv.toastFull'), 'error');
        else refused(error);
      },
    });
  };

  return {
    theme: initialTheme(),
    themeFromHost: false,
    mode: 'restaurant',
    online: true,
    view: 'login',
    tick: 0,

    loginStep: 'pin',
    pin: '',
    pinErr: false,
    staffSel: 'sam',
    drawer: source.openingFloat(),

    cat: 'all',
    search: '',
    menuDensity: 'cozy',
    coursing: false,
    // Sold out: the items the menu says are off, then whatever is 86'd at the till.
    unavail: source.menu().filter((m) => m.available === false).map((m) => m.id),
    ticket: source.openTicket(),
    held: source.heldTickets(),

    sheetOpen: false,
    sheetId: null,
    sheetQty: 1,
    sheetSel: {},
    sheetNote: '',
    sheetSeat: 0,

    heldOpen: false,
    voidOpen: false,
    voidText: '',
    voidKey: null,
    moveOpen: false,
    discountOpen: false,
    discount: null,

    payMethod: 'card',
    cash: '',
    // No tip is chosen for the guest (the comp preselected 15% — §5.8.8, 11).
    tip: 0,
    tipCustom: '',
    card: 'waiting',
    declined: false,
    splits: source.openSplits(),
    splitMode: 'none',
    splitN: 0,
    splitCustom: '',

    lastSale: null,
    features: DEMO ? DEMO_FEATURES : NO_FEATURES,
    kds: source.kitchenOrders(),

    toast: null,

    sync: outbox().state(),
    shiftRid: source.openShiftId(),
    paying: false,

    floor: source.tables(),
    reservations: source.reservations(),

    shiftTotals: source.shift(),
    shiftStart: source.shiftStart(),
    sales: [],
    roster: source.roster(),
    clock: source.timeClock(),
    clockedOutAt: {},

    closeCount: 0,

    refundSale: null,
    refundSel: [],
    refundMethod: 'card',
    refundDone: null,
    refunding: false,

    resvDay: 0,
    resvSel: null,
    resvNewOpen: false,

    // The demo's rewards are known from the start; a hosted till reads its own at boot (main.tsx).
    rewards: DEMO ? demoRewards() : [],
    members: {},
    pointsLog: {},
    loyaltyQuery: '',
    loyaltyResults: [],
    loyaltySel: null,
    loyaltyActivity: [],
    loyaltyBusy: false,
    enrollOpen: false,

    pickups: source.pickups(),
    pickupSheetOpen: false,

    display: { step: 'order', signed: false, receipt: '', receiptTo: '' },
    tipPad: null,

    cards: {},
    giftSel: null,
    giftActivity: [],
    giftLog: {},
    giftBusy: false,

    // ---- display / behaviour ----
    toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    setTheme: (next) => set({ theme: next }),
    /*
     * The HOST owns the theme while the till is blended into the dashboard: it
     * is the operator's dashboard setting, not this app's. `themeFromHost` is
     * what stops `App` writing it to `pos-theme` — persisting it would leave the
     * till stuck in the dashboard's theme the next time it is opened on its own.
     */
    setHostTheme: (next) => set({ theme: next, themeFromHost: true }),
    setMode: (m) =>
      set((s) => ({ mode: m, view: m === 'retail' && s.view === 'floor' ? 'register' : s.view })),
    toggleOnline: () => set((s) => ({ online: !s.online })),
    toggleDeclined: () => {
      const willDecline = !get().declined;
      set({ declined: willDecline, card: 'waiting' });
      get().showToast(t(willDecline ? 'toast.cardWillDecline' : 'toast.cardWillApprove'));
    },
    go: (v) => {
      // The tip pad belongs to the screen that opened it.
      if (get().tipPad !== null) set({ tipPad: null });
      if (v === 'login') set({ view: 'login', loginStep: 'pin', pin: '', pinErr: false });
      else if (v === 'payment') get().openPay();
      else if (v === 'move') get().openMove();
      else if (v === 'discount') get().openDiscount();
      else if (v === 'refund') get().openRefund();
      else if (v === 'shiftclose') get().openShiftClose();
      else if (v === 'loyalty') get().openLoyalty();
      else if (v === 'giftcards') get().openGiftCards();
      else if (v === 'display') set({ view: 'display', display: { ...get().display, step: 'order' } });
      else set({ view: v as View });
    },
    doTick: () => set((s) => ({ tick: s.tick + 1 })),
    showToast: (msg, kind) => {
      clearTimeout(ttTimer);
      set({ toast: { msg, kind: kind || 'default' } });
      ttTimer = setTimeout(() => set({ toast: null }), 2600);
    },

    // ---- login ----
    selStaff: (id) => set({ staffSel: id, pin: '', pinErr: false }),
    pinPush: (d) => {
      const s = get();
      if (d === 'back') {
        set({ pin: s.pin.slice(0, -1), pinErr: false });
        return;
      }
      if (d === 'clear') {
        set({ pin: '', pinErr: false });
        return;
      }
      if (s.pin.length >= 4) return;
      const np = s.pin + d;
      set({ pin: np, pinErr: false });
      if (np.length === 4) {
        const ok = np === curStaffOf(get()).pin;
        clearTimeout(ptTimer);
        if (ok) ptTimer = setTimeout(() => set({ loginStep: 'drawer', pin: '' }), 200);
        else ptTimer = setTimeout(() => set({ pin: '', pinErr: true }), 260);
      }
    },
    autofillPin: () => {
      set({ pin: curStaffOf(get()).pin });
      clearTimeout(ptTimer);
      ptTimer = setTimeout(() => set({ loginStep: 'drawer', pin: '' }), 320);
    },
    drawerAdj: (v) => set((s) => ({ drawer: Math.max(0, s.drawer + v) })),
    drawerPreset: (v) => set({ drawer: v }),
    openShift: () => {
      const rid = outbox().temp();
      const fresh = get().shiftRid === null;
      set({
        view: 'register',
        shiftRid: rid,
        // A shift opened after the last one closed starts from nothing.
        ...(fresh ? { shiftStart: Date.now(), shiftTotals: { orders: 0, gross: 0, card: 0, cash: 0, qr: 0, gift: 0, tips: 0, refunds: 0, cashRefunds: 0, comps: 0 } } : {}),
      });
      void outbox().insert(
        'shift',
        'shifts',
        { opened_by: staffKey(), started_at: new Date().toISOString(), opening_float: get().drawer },
        { temp: rid, onRefused: refused },
      );
      get().showToast(t('toast.shiftOpened', { amount: money(get().drawer) }), 'success');
    },

    // ---- register ----
    setCat: (slug) => set({ cat: slug, search: '' }),
    setSearch: (q) => set({ search: q }),
    setDensity: (d) => set({ menuDensity: d }),
    toggleCoursing: () => set((s) => ({ coursing: !s.coursing })),
    emptyTicket: () => {
      get().ticket.items.filter((x) => !x.sent).forEach(removeLine);
      setItems([]);
    },
    // The demo dock's "Reset ticket": the flag folds, so a real till carries no seed ticket.
    resetTicket: () => {
      if (DEMO) set({ ticket: seedTicket() });
    },

    tapTile: (id) => {
      const s = get();
      const m = itemById(id);
      if (!m || s.unavail.indexOf(id) >= 0) return;
      if (groupsOf(id).length > 0) get().openSheet(id);
      else addLine(id, {});
    },
    scanCode: (code) => {
      const clean = code.trim();
      // What the scanner typed into the search field is not a search.
      set((st) => (st.search.includes(clean) ? { search: st.search.replace(clean, '').trim() } : {}));
      const item = source.menu().find((m) => (m.barcode ?? '').trim() === clean);
      if (item === undefined) {
        get().showToast(t('scan.toastUnknown', { code: clean }), 'error');
        return;
      }
      if (get().unavail.includes(item.id)) {
        get().showToast(t('scan.toastOff', { name: item.name }), 'error');
        return;
      }
      get().tapTile(item.id);
      if (groupsOf(item.id).length === 0) get().showToast(t('toast.added', { name: item.name }), 'success');
    },
    // Bump exactly one line, mirroring `dec`. A `.map` over the key would bump
    // every line that shares it, which is only safe while the no-duplicate-keys
    // invariant holds — enforce it here rather than assume it.
    inc: (k) => {
      const items = get().ticket.items.slice();
      const i = items.findIndex((x) => x.key === k);
      // A reward's line is one reward: another is spent on Loyalty, not here.
      if (i < 0 || items[i].rewardId !== undefined) return;
      items[i] = { ...items[i], qty: items[i].qty + 1 };
      setItems(items);
      saveQty(items[i]);
    },
    dec: (k) => {
      const items = get().ticket.items.slice();
      const i = items.findIndex((x) => x.key === k);
      if (i < 0) return;
      if (items[i].qty <= 1) {
        if (items[i].sent) {
          get().openVoid(k);
          return;
        }
        removeLine(items[i]);
        items.splice(i, 1);
      } else {
        items[i] = { ...items[i], qty: items[i].qty - 1 };
        saveQty(items[i]);
      }
      setItems(items);
    },
    removeKey: (k) => {
      const it = get().ticket.items.find((x) => x.key === k);
      if (!it) return;
      if (it.sent) {
        get().openVoid(k);
        return;
      }
      removeLine(it);
      setItems(get().ticket.items.filter((x) => x.key !== k));
    },
    send: () => {
      const s = get();
      // A gift card load is no food: it never goes to the kitchen.
      const unsent = s.ticket.items.filter((x) => !x.sent && x.giftCard === undefined);
      if (!unsent.length) {
        get().showToast(t('toast.nothingToSend'));
        return;
      }
      /*
       * Actually put the order on the kitchen board.
       *
       * This used to flip `sent` on the lines and toast "Order sent to
       * kitchen" without touching `kds` at all — the board was seeded once at
       * startup and never grew. The seeded board happens to contain #1042, the
       * seeded ticket, so it looked wired up right until you rang in something
       * of your own and it never arrived.
       */
      const rows = unsent.map((x) => ({
        n: lineName(x),
        q: x.qty,
        m: [modLabel(x), x.note].filter(Boolean).join(' · '),
      }));
      const ticketRid = ensureTicket();
      const now = new Date().toISOString();
      for (const li of unsent) {
        if (li.rid !== undefined) void outbox().update(ticketRid, 'ticket_items', li.rid, { sent_at: now }, { onRefused: refused });
      }
      void saveTicket(ticketRid, { status: 'sent', kitchen_status: 'new', sent_at: now });
      const kds = s.kds.slice();
      const i = kds.findIndex((o) => o.number === s.ticket.number);
      if (i >= 0) {
        // A later course joins the ticket's existing card rather than opening a
        // second one, and puts it back in the queue — the new items still have
        // to be made even if the first course is already up.
        kds[i] = { ...kds[i], items: kds[i].items.concat(rows), at: Date.now(), status: 'new' };
      } else {
        kds.push({
          number: s.ticket.number,
          rid: ticketRid,
          table: s.ticket.table,
          at: Date.now(),
          status: 'new',
          items: rows,
        });
      }
      set({ ticket: { ...s.ticket, items: s.ticket.items.map((x) => (x.giftCard === undefined ? { ...x, sent: true } : x)) }, kds });
      get().showToast(t('toast.orderSent'));
    },
    hold: () => {
      const s = get();
      if (!s.ticket.items.length) {
        get().showToast(t('toast.ticketEmpty'));
        return;
      }
      const tk = s.ticket;
      void saveTicket(tk.rid, { held: true });
      const held = s.held.concat([parked(tk)]);
      // A discount applies to the ticket on the register; it must not follow the
      // register onto the next one. (Held tickets do not carry a discount, so a
      // held-then-resumed ticket has to have it re-applied.)
      set({ held, ticket: freshTicket(), discount: null });
      get().showToast(t('toast.ticketHeld'));
    },
    resumeHeld: (n) => {
      const s = get();
      const held = s.held.slice();
      const idx = held.findIndex((x) => x.number === n);
      if (idx < 0) return;
      const h = held[idx];
      held.splice(idx, 1);
      const cur = s.ticket;
      if (cur.items.length) {
        void saveTicket(cur.rid, { held: true });
        held.push(parked(cur));
      }
      void saveTicket(h.rid, { held: false });
      set({
        held,
        ticket: {
          number: h.number,
          rid: h.rid,
          table: h.table,
          seats: h.seats || 2,
          openedAt: h.at,
          items: h.items,
          ...(h.customerId === undefined ? {} : { customerId: h.customerId }),
        },
        heldOpen: false,
        view: 'register',
        discount: null,
      });
      knowMember(h.customerId);
      get().showToast(t('toast.resumed', { table: tableName(h.table, s.mode) }));
    },

    // ---- modifier sheet ----
    openSheet: (id) => {
      /*
       * A group that must be answered starts answered, with its first option
       * that costs nothing (Medium, whole milk): the cashier changes what the
       * guest asked for rather than confirming the everyday choice.
       */
      const sheetSel: Selection = {};
      for (const group of groupsOf(id)) {
        if (group.kind !== 'radio' || group.min < 1) continue;
        const open = group.options.filter((o) => o.available);
        const pick = open.find((o) => o.delta === 0) ?? open[0];
        if (pick !== undefined) sheetSel[group.id] = [pick.id];
      }
      set({ sheetOpen: true, sheetId: id, sheetQty: 1, sheetSel, sheetNote: '', sheetSeat: 0 });
    },
    closeSheet: () => set({ sheetOpen: false }),
    sheetQtyInc: () => set((s) => ({ sheetQty: s.sheetQty + 1 })),
    sheetQtyDec: () => set((s) => ({ sheetQty: Math.max(1, s.sheetQty - 1) })),
    toggleOption: (groupId, optionId) =>
      set((s) => {
        const group = groupsOf(s.sheetId ?? '').find((g) => g.id === groupId);
        if (group === undefined) return {};
        const now = s.sheetSel[groupId] ?? [];
        let next: string[];
        if (group.kind === 'radio') {
          // A required choice is changed, never emptied.
          next = now.includes(optionId) && group.min < 1 ? [] : [optionId];
        } else if (now.includes(optionId)) {
          next = now.filter((x) => x !== optionId);
        } else {
          if (now.length >= group.max) return {};
          next = [...now, optionId];
        }
        return { sheetSel: { ...s.sheetSel, [groupId]: next } };
      }),
    setSheetNote: (n) => set({ sheetNote: n }),
    setSheetSeat: (n) => set({ sheetSeat: n }),
    sheetAdd: () => {
      const s = get();
      const m = itemById(s.sheetId || '');
      if (!m) return;
      // A group still waiting for its answer holds the line back, and is named.
      const unanswered = groupsOf(m.id).find((g) => (s.sheetSel[g.id] ?? []).length < g.min);
      if (unanswered !== undefined) {
        get().showToast(t('sheet.chooseGroup', { group: unanswered.name }), 'error');
        return;
      }
      addLine(s.sheetId as string, { qty: s.sheetQty, note: s.sheetNote, seat: s.sheetSeat, selection: s.sheetSel });
      set({ sheetOpen: false });
      get().showToast(t('toast.added', { name: m.name }), 'success');
    },

    // ---- void ----
    openVoid: (k) => set({ voidOpen: true, voidKey: k, voidText: '' }),
    setVoidText: (text) => set({ voidText: text }),
    closeVoid: () => set({ voidOpen: false, voidText: '' }),
    confirmVoid: () => {
      const s = get();
      if (s.voidText.trim().toUpperCase() !== 'VOID') return;
      const k = s.voidKey;
      const li = s.ticket.items.find((x) => x.key === k);
      // A sent line is voided on the record, never deleted: the kitchen made it.
      if (li !== undefined && li.sent && li.rid !== undefined) {
        void outbox().update(ensureTicket(), 'ticket_items', li.rid, { voided_at: new Date().toISOString(), voided_by: staffKey() }, { onRefused: refused });
      } else if (li !== undefined) {
        removeLine(li);
      }
      setItems(s.ticket.items.filter((x) => x.key !== k));
      set({ voidOpen: false, voidKey: null, voidText: '' });
      get().showToast(t('toast.itemVoided'));
    },

    // ---- move / discount ----
    openMove: () => set({ moveOpen: true }),
    closeMove: () => set({ moveOpen: false }),
    doMove: (label) => {
      const from = get().ticket.table;
      set((s) => ({ ticket: { ...s.ticket, table: label }, moveOpen: false }));
      occupy(from, false);
      occupy(label, true);
      void saveTicket(get().ticket.rid, { table_id: tableKey(label) });
      get().showToast(t('toast.movedTo', { table: tableName(label, get().mode) }), 'success');
    },
    doMerge: (n) => {
      const s = get();
      const h = s.held.find((x) => x.number === n);
      if (!h) {
        set({ moveOpen: false });
        return;
      }
      /*
       * Merge by line key rather than concatenating.
       *
       * A plain concat produced two rows carrying the same `key` whenever both
       * tickets held the same configuration — two "Croissant" rows, a duplicate
       * React key, and `inc()` bumping both at once so the quantity climbed in
       * twos. Identical lines are one line with the quantities added, which is
       * the same rule `addLine` already applies at the register.
       */
      // On the record: the held ticket's lines move over, and it is closed as merged.
      const into = ensureTicket();
      for (const x of h.items) {
        if (x.rid !== undefined) void outbox().update(h.rid ?? into, 'ticket_items', x.rid, { ticket_id: into }, { onRefused: refused });
      }
      void saveTicket(h.rid, { status: 'void', merged_into_id: into, held: false });
      const items = s.ticket.items.map((x) => ({ ...x }));
      h.items.forEach((x) => {
        const i = items.findIndex((y) => y.key === x.key);
        if (i >= 0) items[i] = { ...items[i], qty: items[i].qty + x.qty, sent: items[i].sent && x.sent };
        else items.push({ ...x });
      });
      set({
        ticket: { ...s.ticket, items },
        held: s.held.filter((x) => x.number !== n),
        moveOpen: false,
      });
      get().showToast(t('toast.merged', { table: tableName(h.table, s.mode) }), 'success');
    },
    openDiscount: () => set({ discountOpen: true }),
    closeDiscount: () => set({ discountOpen: false }),
    applyDiscount: (kind, value, label, reason) => {
      set({ discount: { kind, value, label }, discountOpen: false });
      void saveTicket(ensureTicket(), {
        discount_kind: kind === 'pct' ? 'percent' : kind === 'amt' ? 'amount' : 'comp',
        discount_value: value,
        discount_reason: reason ?? label,
      });
      get().showToast(t(kind === 'comp' ? 'toast.comped' : 'toast.discounted', { label }), 'success');
    },
    clearDiscount: () => {
      set({ discount: null, discountOpen: false });
      void saveTicket(get().ticket.rid, { discount_kind: null, discount_value: null, discount_reason: null });
      get().showToast(t('toast.discountRemoved'));
    },

    // ---- payment ----
    openPay: () => {
      const cur = get();
      if (!cur.ticket.items.length) {
        get().showToast(t('toast.addItemsFirst'));
        return;
      }
      /*
       * Resume a part-paid ticket instead of restarting it.
       *
       * This used to reset `splits: []` unconditionally, so stepping back to
       * the ticket to add a forgotten item and pressing Pay again silently
       * discarded every payment already collected — the balance jumped back to
       * full and the guest who had already handed over cash was asked again.
       */
      if (cur.splits.length) {
        set({ view: 'payment' });
        return;
      }
      clearTimeout(ctTimer);
      clearTimeout(ct2Timer);
      set({
        view: 'payment',
        payMethod: 'card',
        cash: '',
        splits: [],
        splitMode: 'none',
        splitN: 0,
        splitCustom: '',
        card: 'waiting',
        // NOT the tip: the guest may have chosen one on the customer display
        // already (the plan's fix 7 — Appendix D 17), and Payment keeps it.
      });
    },
    openHeld: () => set({ heldOpen: true }),
    closeHeld: () => set({ heldOpen: false }),
    setMethod: (m) => set({ payMethod: m, cash: '', card: 'waiting' }),
    setTip: (i) => set({ tip: i }),
    cashPush: (d) =>
      set((s) => {
        const c = s.cash;
        if (d === 'back') return { cash: c.slice(0, -1) };
        if (d === 'clear') return { cash: '' };
        if (d === '.') {
          if (c.indexOf('.') >= 0) return {};
          return { cash: (c === '' ? '0' : c) + '.' };
        }
        const nc = c + d;
        if (nc.indexOf('.') >= 0 && nc.split('.')[1].length > 2) return {};
        if (nc.replace('.', '').length > 7) return {};
        return { cash: nc };
      }),
    cashPreset: (v) => set({ cash: String(v) }),
    setSplitN: (n) => set({ splitMode: 'even', splitN: n, splitCustom: '' }),
    setSplitFraction: (f) => {
      const v = Math.round(remaining(get()) * f * 100) / 100;
      set({ splitMode: 'amount', splitCustom: String(v), splitN: 0 });
    },
    clearSplit: () => set({ splitMode: 'none', splitN: 0, splitCustom: '' }),
    onCharge: () => {
      const m = get().payMethod;
      if (m === 'cash') applyCash();
      else if (m === 'card') runCard();
      else applyQr();
    },
    newOrder: () => {
      /*
       * Number the ticket with `freshTicket()`, do not re-derive it.
       *
       * This branch used to compute `lastSale.number + 1`, which ignores the
       * held tray: ring up #1041 while #1042 is parked there and the next
       * ticket is also #1042 — two open tickets, one number, and the held tray
       * and the register disagree about which is which.
       */
      // `finalize` already retired the paid ticket and minted this one, so this
      // only has to return to the register and reset the payment scratch state.
      set({
        view: 'register',
        lastSale: null,
        splits: [],
        cash: '',
        card: 'waiting',
        tip: 0,
        tipCustom: '',
        discount: null,
      });
    },
    // To whatever printer the tablet can reach; the print stylesheet sizes it for an 80 mm roll.
    printReceipt: () => printOnly('receipt'),
    sendReceipt: () => get().showToast(t('toast.receiptSentText')),
    emailReceipt: (raw) => {
      const s = get();
      if (!s.features['emailed-receipts']) return 'off';
      const sale = s.lastSale;
      if (sale === null || sale.rid === undefined) return 'none';
      const to = raw.trim();
      if (!isEmailAddress(to)) return 'invalid';
      /*
       * One row in the outbox, and nothing else. The address goes only there —
       * a personal column Adminium masks for anyone who does not need it — and
       * the ticket keeps no copy. Queued behind the ticket's own writes, so a
       * sale still on its way to the server is saved before its receipt is
       * asked for; offline, it waits with them.
       */
      const rid = sale.rid;
      void outbox().insert(
        rid,
        'messages',
        {
          id: deviceKey(),
          kind: 'receipt',
          status: 'queued',
          to_address: to,
          language: locale(),
          ticket_id: rid,
          ...(sale.customerId === undefined ? {} : { customer_id: dbKey(sale.customerId) }),
        },
        {
          onRefused: (error) => {
            set((st) => ({ lastSale: st.lastSale?.rid === rid ? { ...st.lastSale, emailedTo: (st.lastSale.emailedTo ?? []).filter((x) => x !== to) } : st.lastSale }));
            refused(error);
          },
        },
      );
      set((st) => ({ lastSale: st.lastSale?.rid === rid ? { ...st.lastSale, emailedTo: [...(st.lastSale.emailedTo ?? []).filter((x) => x !== to), to] } : st.lastSale }));
      get().showToast(t('complete.emailQueued', { to }), 'success');
      return 'queued';
    },

    // ---- kitchen ----
    bumpK: (n) => {
      const order = get().kds.find((o) => o.number === n);
      if (order === undefined) return;
      const next = order.status === 'new' ? 'cooking' : order.status === 'cooking' ? 'ready' : 'served';
      void saveTicket(order.rid, { kitchen_status: next });
      set((s) => {
        const k = s.kds.map((o) => ({ ...o }));
        const i = k.findIndex((o) => o.number === n);
        if (i < 0) return {};
        if (k[i].status === 'new') k[i].status = 'cooking';
        else if (k[i].status === 'cooking') k[i].status = 'ready';
        else k.splice(i, 1);
        return { kds: k };
      });
    },

    // ---- floor ----
    openTable: (tbl) => {
      const s = get();
      // Where the open ticket actually is, not the seed's pinned `current` flag.
      if (tbl.label === s.ticket.table) {
        set({ view: 'register' });
        return;
      }
      /*
       * An occupied table opens ITS ticket, not a fresh one (§0.6): the ticket
       * waiting on the tray comes to the register, and the one there waits.
       */
      if (tbl.status !== 'open') {
        const own = s.held.find((h) => h.table === tbl.label);
        if (own !== undefined) get().resumeHeld(own.number);
        // Not on this till (yet): nothing to open, and no second ticket for the table.
        else get().showToast(t('toast.tableElsewhere', { table: tableName(tbl.label, s.mode) }));
        return;
      }
      const held = s.held.slice();
      const cur = s.ticket;
      if (cur.items.length) {
        void saveTicket(cur.rid, { held: true });
        held.push(parked(cur));
      }
      set({
        ticket: { number: nextNum(), table: tbl.label, seats: tbl.seats, openedAt: Date.now(), items: [] },
        held,
        view: 'register',
        discount: null,
      });
      // Seating a table opens its ticket on the record.
      ensureTicket();
      occupy(tbl.label, true);
      get().showToast(
        t(tbl.status === 'open' ? 'toast.seated' : 'toast.opened', {
          table: tableName(tbl.label, s.mode),
        }),
      );
    },

    // ---- 86 / menu ----
    toggle86: (id) => {
      const off = !get().unavail.includes(id);
      set((s) => ({ unavail: off ? [...s.unavail, id] : s.unavail.filter((x) => x !== id) }));
      void outbox().update('menu', 'menu_items', itemKey(id), { available: !off }, {
        onRefused: (error) => {
          // Put the switch back where the server has it.
          set((s) => ({ unavail: off ? s.unavail.filter((x) => x !== id) : [...s.unavail, id] }));
          refused(error);
        },
      });
      const name = itemById(id)?.name ?? id;
      get().showToast(t(off ? 'm86.toastOff' : 'm86.toastOn', { name }), off ? 'default' : 'success');
    },

    // ---- staff & time clock ----
    clockIn: (staffId) => {
      if (get().clock.some((c) => c.staffId === staffId)) return;
      const rid = outbox().temp();
      const since = Date.now();
      set((s) => ({ clock: [...s.clock, { staffId, rid, since }] }));
      void outbox().insert('clock', 'time_clock', { staff_id: dbKey(staffId), clock_in: new Date(since).toISOString() }, {
        temp: rid,
        onRefused: (error) => {
          set((s) => ({ clock: s.clock.filter((c) => c.rid !== rid) }));
          refused(error);
        },
      });
      get().showToast(t('staff.toastIn', { name: get().roster.find((p) => p.id === staffId)?.name ?? '' }), 'success');
    },
    clockOut: (staffId) => {
      const entry = get().clock.find((c) => c.staffId === staffId);
      if (entry === undefined) return;
      const at = Date.now();
      set((s) => ({ clock: s.clock.filter((c) => c !== entry), clockedOutAt: { ...s.clockedOutAt, [staffId]: at } }));
      if (entry.rid !== undefined) {
        void outbox().update('clock', 'time_clock', entry.rid, { clock_out: new Date(at).toISOString() }, {
          onRefused: (error) => {
            set((s) => ({ clock: [...s.clock, entry] }));
            refused(error);
          },
        });
      }
      get().showToast(t('staff.toastOut', { name: get().roster.find((p) => p.id === staffId)?.name ?? '' }));
    },
    addStaff: async ({ name, role, email }) => {
      const clean = name.trim();
      if (clean === '') return false;
      const initials = clean
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
      const rid = outbox().temp();
      const person: Staff = { id: rid, name: clean, initials, role: role.trim(), pin: '', email: email.trim() === '' ? null : email.trim() };
      set((s) => ({ roster: [...s.roster, person] }));
      const row = await outbox().insert(
        'staff',
        'staff',
        { name: clean, initials, role: person.role === '' ? null : person.role, email: person.email, active: true },
        {
          temp: rid,
          onRefused: (error) => {
            set((s) => ({ roster: s.roster.filter((p) => p.id !== rid) }));
            refused(error);
          },
        },
      );
      if (row === null) return false;
      // The row's own key from here on, so clocking them in names it.
      const id = String(row['id'] ?? rid);
      set((s) => ({ roster: s.roster.map((p) => (p.id === rid ? { ...p, id } : p)) }));
      get().showToast(t('staff.toastAdded', { name: clean }), 'success');
      return true;
    },
    deactivateStaff: (staffId) => {
      const person = get().roster.find((p) => p.id === staffId);
      if (person === undefined) return;
      if (get().clock.some((c) => c.staffId === staffId)) get().clockOut(staffId);
      set((s) => ({ roster: s.roster.filter((p) => p.id !== staffId) }));
      void outbox().update('staff', 'staff', dbKey(staffId), { active: false }, {
        onRefused: (error) => {
          set((s) => ({ roster: [...s.roster, person] }));
          refused(error);
        },
      });
      get().showToast(t('staff.toastDeactivated', { name: person.name }));
    },

    // ---- refund ----
    openRefund: () =>
      set({ view: 'refund', refundSale: null, refundSel: [], refundDone: null, refunding: false }),
    pickRefundSale: (sale) =>
      set({
        refundSale: sale,
        // Everything not already given back starts chosen, as the comp does for the last sale.
        refundSel: sale.lines.map((l, i) => (l.refunded < l.qty && l.giftCard !== true ? i : -1)).filter((i) => i >= 0),
        refundMethod: sale.method,
        refundDone: null,
      }),
    toggleRefundLine: (i) =>
      set((s) => {
        const line = s.refundSale?.lines[i];
        if (line === undefined || line.refunded >= line.qty || line.giftCard === true) return {};
        return { refundSel: s.refundSel.includes(i) ? s.refundSel.filter((x) => x !== i) : [...s.refundSel, i].sort((a, b) => a - b) };
      }),
    setRefundMethod: (m) => set({ refundMethod: m }),
    processRefund: async () => {
      const s = get();
      const sale = s.refundSale;
      if (sale === null || s.refunding || s.refundSel.length === 0) return;
      const money$ = refundMoney(sale, s.refundSel);
      if (money$.total <= 0) return;
      set({ refunding: true });
      const saleRid = sale.rid;
      const items = s.refundSel
        .map((i) => sale.lines[i]!)
        .filter((l) => l.rid !== undefined)
        .map((l) => ({ id: deviceKey(), ticket_item_id: l.rid, qty: l.qty - l.refunded }));
      // Money waits for the server, as a payment does: the screen says "issued" only once it is.
      const row =
        saleRid === undefined
          ? {}
          : await outbox().insert(
              saleRid,
              'refunds',
              { id: deviceKey(), ticket_id: saleRid, method: s.refundMethod, amount: money$.total, tax: money$.tax, reason: null, staff_id: staffKey() },
              { ...(items.length === 0 ? {} : { children: [{ ref: 'refund_items', via: 'refund_id', rows: items }] }), onRefused: refused },
            );
      set({ refunding: false });
      if (row === null) return;
      // Money given back takes back the points it earned (never the visit).
      const memberId = sale.customerId;
      const back = pointsFor(money$.sub);
      if (memberId !== undefined && saleRid !== undefined && back > 0) {
        const id = deviceKey();
        void outbox().insert(
          saleRid,
          'loyalty_ledger',
          { id, customer_id: dbKey(memberId), kind: 'adjust', points: -back, visit: 0, reward_id: null, ticket_id: saleRid, note: null, staff_id: staffKey() },
          { onRefused: refused },
        );
        const entry: PointsEntry = { id, kind: 'adjust', points: -back, rewardId: null, note: null, at: Date.now() };
        set((st) => {
          const was = st.members[memberId];
          return {
            members: was === undefined ? st.members : { ...st.members, [memberId]: { ...was, points: was.points - back, lifetime: was.lifetime - back } },
            pointsLog: { ...st.pointsLog, [memberId]: [entry, ...(st.pointsLog[memberId] ?? [])] },
          };
        });
      }
      // Money given back onto the gift card that paid: its history gets it back.
      if (s.refundMethod === 'gift_card' && sale.giftCardCode !== undefined && saleRid !== undefined) {
        const card = Object.values(get().cards).find((c) => c.code === sale.giftCardCode) ?? (await giftCards().byCode(sale.giftCardCode).catch(() => null));
        if (card !== null) {
          const id = deviceKey();
          void outbox().insert(saleRid, 'gift_card_ledger', { id, card_id: dbKey(card.id), kind: 'refund', amount: money$.total, ticket_id: saleRid, staff_id: staffKey() }, { onRefused: refused });
          const entry: GiftCardEntry = { id, kind: 'refund', amount: money$.total, at: Date.now() };
          set((st) => ({
            cards: { ...st.cards, [card.id]: { ...(st.cards[card.id] ?? card), balance: round2((st.cards[card.id] ?? card).balance + money$.total) } },
            giftLog: { ...st.giftLog, [card.id]: [entry, ...(st.giftLog[card.id] ?? [])] },
          }));
        }
      }
      const count = s.refundSel.length;
      const given = new Set(s.refundSel);
      const after: PastSale = {
        ...sale,
        lines: sale.lines.map((l, i) => (given.has(i) ? { ...l, refunded: l.qty } : l)),
        refunded: round2(sale.refunded + money$.total),
      };
      set((st) => ({
        refundDone: { total: money$.total, count },
        refundSale: after,
        refundSel: [],
        // Kept with the till's own sales, so the list shows what was given back before any read does.
        sales: st.sales.some((x) => x.number === sale.number) ? st.sales.map((x) => (x.number === sale.number ? after : x)) : [after, ...st.sales],
        shiftTotals: {
          ...st.shiftTotals,
          refunds: round2(st.shiftTotals.refunds + money$.total),
          cashRefunds: s.refundMethod === 'cash' ? round2(st.shiftTotals.cashRefunds + money$.total) : st.shiftTotals.cashRefunds,
        },
      }));
      get().showToast(t('refund.toastIssued'), 'success');
    },
    refundBack: () => {
      const s = get();
      if (s.refundSale !== null && s.refundDone === null) set({ refundSale: null, refundSel: [] });
      else set({ view: 'register', refundSale: null, refundSel: [], refundDone: null });
    },

    // ---- close shift ----
    openShiftClose: () => set({ view: 'shiftclose', closeCount: expectedDrawer(get()) }),
    closeCountAdj: (v) => set((s) => ({ closeCount: Math.max(0, round2(s.closeCount + v)) })),
    finishShift: async () => {
      const s = get();
      const expected = expectedDrawer(s);
      const counted = round2(s.closeCount);
      if (s.shiftRid !== null) {
        const row = await outbox().update('shift', 'shifts', s.shiftRid, {
          ended_at: new Date().toISOString(),
          closed_by: staffKey(),
          counted_cash: counted,
          expected_cash: expected,
          over_short: round2(counted - expected),
        }, { onRefused: refused });
        // The count is money: the shift is closed only once the server has it.
        if (row === null) return;
      }
      set({
        shiftRid: null,
        view: 'login',
        // A hosted till is signed into by the session, so the next shift starts at the float count.
        loginStep: HOSTED ? 'drawer' : 'pin',
        pin: '',
        pinErr: false,
      });
      get().showToast(t('shift.toastClosed'), 'success');
    },

    // ---- reservations ----
    resvSetDay: (i) => {
      const days = bookingDays(source.bookingRules(), Date.now(), tenantZone());
      const day = days[i];
      if (day === undefined) return;
      set({ resvDay: i, resvSel: null });
    },
    resvPick: (id) => set({ resvSel: id }),
    seatResv: (id) => {
      const s = get();
      const r = s.reservations.find((x) => x.id === id);
      if (r === undefined || r.status !== 'confirmed') return;
      const table = seatFor(r, s.floor);
      if (table === null) {
        get().showToast(t('resv.toastNoTable', { n: r.partySize }), 'error');
        return;
      }
      // Whatever was on the register waits on the tray; the party gets a fresh ticket at its table.
      const held = s.held.slice();
      const cur = s.ticket;
      if (cur.items.length) {
        void saveTicket(cur.rid, { held: true });
        held.push(parked(cur));
      }
      const tableRef = table.id ?? table.label;
      patchResv(id, { status: 'seated', tableId: tableRef }, { status: 'seated', table_id: tableKey(table.label), seated_at: new Date().toISOString() });
      set({
        held,
        ticket: { number: nextNum(), table: table.label, seats: r.partySize, openedAt: Date.now(), items: [], reservationId: id },
        view: 'register',
        mode: 'restaurant',
        discount: null,
      });
      ensureTicket();
      occupy(table.label, true);
      get().showToast(t('resv.toastSeated', { name: r.name, n: r.partySize, table: tableName(table.label, 'restaurant') }), 'success');
    },
    assignResvTable: (id, table) => {
      const r = get().reservations.find((x) => x.id === id);
      if (r === undefined) return;
      patchResv(id, { tableId: table.id ?? table.label }, { table_id: tableKey(table.label) });
      get().showToast(t('resv.toastAssigned', { name: r.name, table: tableName(table.label, 'restaurant') }), 'success');
    },
    setResvStatus: (id, status) => {
      const s = get();
      const r = s.reservations.find((x) => x.id === id);
      if (r === undefined || r.status === status) return;
      // Reinstating takes a place back: the slot must still have room (DP32).
      if (status === 'confirmed' && slotFull(s.reservations, source.bookingRules(), r.startsAt, r.partySize, r.id)) {
        get().showToast(t('resv.toastFull'), 'error');
        return;
      }
      patchResv(id, { status }, { status });
      const key = status === 'no_show' ? 'resv.toastNoShow' : status === 'cancelled' ? 'resv.toastCancelled' : 'resv.toastReinstated';
      get().showToast(t(key, { name: r.name, code: r.code ?? '' }), status === 'confirmed' ? 'success' : 'default');
    },
    saveResvNote: (id, note) => {
      const clean = note.trim();
      patchResv(id, { note: clean === '' ? null : clean }, { staff_note: clean === '' ? null : clean });
      get().showToast(t('resv.toastNoteSaved'), 'success');
    },
    createResv: ({ name, mobile, party, startsAt, note }) => {
      const s = get();
      if (name.trim() === '' || mobile.trim() === '') return false;
      // A phone booking takes the same places an online one does (DP15).
      if (slotFull(s.reservations, source.bookingRules(), startsAt, party)) {
        get().showToast(t('resv.toastFull'), 'error');
        return false;
      }
      const rid = outbox().temp();
      const staffNote = note.trim() === '' ? null : note.trim();
      const draft: Reservation = {
        id: rid,
        code: null,
        name: name.trim(),
        mobile: mobile.trim(),
        email: null,
        partySize: party,
        startsAt,
        status: 'confirmed',
        channel: 'phone',
        tableId: null,
        occasion: null,
        request: null,
        note: staffNote,
      };
      set((st) => ({ reservations: [...st.reservations, draft].sort((a, b) => a.startsAt - b.startsAt), resvSel: rid }));
      void outbox().insert(
        `resv:${rid}`,
        'reservations',
        { name: draft.name, mobile: draft.mobile, party_size: party, starts_at: new Date(startsAt).toISOString(), status: 'confirmed', channel: 'phone', staff_note: staffNote },
        {
          temp: rid,
          onSaved: (row) => {
            // Adminium gives the booking its code; the demo's memory makes one up.
            const code = typeof row['code'] === 'string' ? row['code'] : DEMO ? demoCode(get().reservations) : null;
            const real = String(row['id'] ?? rid);
            set((st) => ({
              reservations: st.reservations.map((x) => (x.id === rid ? { ...x, id: real, code } : x)),
              resvSel: st.resvSel === rid ? real : st.resvSel,
            }));
            get().showToast(t('resv.toastAdded', { code: code ?? '' }), 'success');
          },
          onRefused: (error) => {
            set((st) => ({ reservations: st.reservations.filter((x) => x.id !== rid), resvSel: null }));
            if (error.code.startsWith('CAPACITY_')) get().showToast(t('resv.toastFull'), 'error');
            else refused(error);
          },
        },
      );
      return true;
    },
    // ---- loyalty (wave 2) ----
    openLoyalty: () => {
      const s = get();
      set({ view: 'loyalty' });
      if (s.rewards.length === 0) {
        void loyalty()
          .rewards()
          .then((rewards) => set({ rewards }))
          .catch(() => undefined);
      }
      // The ticket's own member, when it has one, is who the screen opens on.
      const onTicket = s.ticket.customerId;
      if (onTicket !== undefined) {
        get().loyaltyPick(onTicket);
        return;
      }
      // The demo opens as the comp draws it: its three members, the first one chosen.
      if (DEMO && s.loyaltySel === null) {
        const members = demoMembers();
        set((st) => ({ members: { ...Object.fromEntries(members.map((m) => [m.id, m])), ...st.members } }));
        get().loyaltyPick(members[0]!.id);
      }
    },
    loyaltySearch: (query) => {
      const seq = ++searchSeq;
      set({ loyaltyQuery: query });
      const typed = query.trim();
      if (typed === '') {
        set({ loyaltyResults: [], loyaltyBusy: false });
        return;
      }
      set({ loyaltyBusy: true });
      void loyalty()
        .search(typed)
        .then((found) => {
          if (seq !== searchSeq) return;
          set((st) => {
            const members = { ...st.members };
            // What this till wrote since is newer than what the read says.
            for (const m of found) if (members[m.id] === undefined || st.pointsLog[m.id] === undefined) members[m.id] = m;
            // A member enrolled here and not yet read back is found too.
            const local = Object.values(st.members).filter((m) => !found.some((f) => f.id === m.id) && matchesMember(m, typed));
            return { members, loyaltyResults: [...found.map((m) => m.id), ...local.map((m) => m.id)], loyaltyBusy: false };
          });
        })
        .catch(() => {
          if (seq !== searchSeq) return;
          set({ loyaltyBusy: false });
          get().showToast(t('loyalty.toastSearchFailed'), 'error');
        });
    },
    loyaltyPick: (id) => {
      const seq = ++activitySeq;
      set((st) => ({ loyaltySel: id, loyaltyActivity: st.pointsLog[id] ?? [] }));
      const book = loyalty();
      void Promise.all([book.member(id), book.activity(id)])
        .then(([member, read]) => {
          if (seq !== activitySeq) return;
          set((st) => {
            const mine = st.pointsLog[id] ?? [];
            const activity = [...mine, ...read.filter((e) => !mine.some((m) => m.id === e.id))].sort((a, b) => b.at - a.at).slice(0, 20);
            // Once the server has read back everything this till wrote, its balance is the truth.
            const caughtUp = mine.every((m) => read.some((e) => e.id === m.id));
            const members = member !== null && (caughtUp || st.members[id] === undefined) ? { ...st.members, [id]: member } : st.members;
            return { loyaltyActivity: activity, members };
          });
        })
        .catch(() => undefined);
    },
    attachMember: (id) => {
      const s = get();
      const member = s.members[id];
      if (member === undefined) return;
      const was = s.ticket.customerId;
      if (was === id) return;
      // Another member's rewards do not stay on a ticket they are no longer on.
      const items = was === undefined ? s.ticket.items : s.ticket.items.filter((x) => x.rewardId === undefined);
      if (was !== undefined) s.ticket.items.filter((x) => x.rewardId !== undefined).forEach(removeLine);
      set({ ticket: { ...s.ticket, customerId: id, items } });
      void saveTicket(ensureTicket(), { customer_id: dbKey(id) });
      get().showToast(t('loyalty.toastAttached', { name: member.name }), 'success');
    },
    detachMember: () => {
      const s = get();
      if (s.ticket.customerId === undefined) return;
      s.ticket.items.filter((x) => x.rewardId !== undefined).forEach(removeLine);
      const { customerId: _gone, ...rest } = s.ticket;
      set({ ticket: { ...rest, items: s.ticket.items.filter((x) => x.rewardId === undefined) } });
      void saveTicket(s.ticket.rid, { customer_id: null });
      get().showToast(t('loyalty.toastDetached'));
    },
    redeemReward: (rewardId) => {
      const s = get();
      const id = s.loyaltySel;
      const member = id === null ? undefined : s.members[id];
      const reward = s.rewards.find((r) => r.id === rewardId);
      if (id === null || member === undefined || reward === undefined) return;
      const item = itemById(reward.itemId);
      if (item === undefined || s.unavail.includes(item.id)) {
        get().showToast(t('loyalty.toastItemOff', { name: reward.name }), 'error');
        return;
      }
      // Spending points puts the member on the ticket first — they are who pays for it.
      if (s.ticket.customerId !== id) get().attachMember(id);
      const now = get();
      if (pointsLeft(member, now.ticket.items, now.rewards) < reward.points) {
        get().showToast(t('loyalty.toastNotEnough', { name: reward.name }), 'error');
        return;
      }
      // The item as it is usually had: every required choice at its first free option.
      const selection: Selection = {};
      for (const group of groupsOf(item.id)) {
        if (group.kind !== 'radio' || group.min < 1) continue;
        const open = group.options.filter((o) => o.available);
        const pick = open.find((o) => o.delta === 0) ?? open[0];
        if (pick !== undefined) selection[group.id] = [pick.id];
      }
      addLine(item.id, { selection, rewardId });
      get().showToast(t('loyalty.toastRedeemed', { name: reward.name }), 'success');
    },
    setEnrollOpen: (open) => set({ enrollOpen: open }),
    enroll: async ({ name, mobile, email }) => {
      const cleanName = name.trim();
      const cleanMobile = mobile.trim();
      const cleanEmail = email.trim();
      if (cleanName === '' || cleanMobile.replace(/\D+/g, '').length < 6) return false;
      // One member per phone: the number already on file opens that member instead.
      const already = await loyalty()
        .search(cleanMobile)
        .catch(() => [] as Member[]);
      const digits = cleanMobile.replace(/\D+/g, '');
      const known = [...already, ...Object.values(get().members)].find((m) => (m.mobile ?? '').replace(/\D+/g, '') === digits);
      if (known !== undefined) {
        set((st) => ({ members: { ...st.members, [known.id]: st.members[known.id] ?? known }, enrollOpen: false, loyaltyResults: [known.id] }));
        get().loyaltyPick(known.id);
        get().showToast(t('loyalty.toastAlready', { name: known.name }));
        return true;
      }
      const rid = outbox().temp();
      const member: Member = {
        id: rid,
        memberNo: null,
        name: cleanName,
        mobile: cleanMobile,
        email: cleanEmail === '' ? null : cleanEmail,
        joinedAt: Date.now(),
        points: 0,
        lifetime: 0,
        visits: 0,
      };
      set((st) => ({ members: { ...st.members, [rid]: member }, loyaltySel: rid, loyaltyActivity: [], loyaltyResults: [rid], enrollOpen: false }));
      const row = await outbox().insert(
        'customers',
        'customers',
        { name: member.name, mobile: member.mobile, email: member.email },
        {
          temp: rid,
          onRefused: (error) => {
            set((st) => {
              const { [rid]: _gone, ...members } = st.members;
              return { members, loyaltySel: st.loyaltySel === rid ? null : st.loyaltySel, loyaltyResults: st.loyaltyResults.filter((x) => x !== rid) };
            });
            refused(error);
          },
        },
      );
      if (row === null) return false;
      // The row's own key and member number from here on.
      const id = String(row['id'] ?? rid);
      const memberNo = typeof row['member_no'] === 'string' || typeof row['member_no'] === 'number' ? String(row['member_no']) : DEMO ? String(1000 + Object.keys(get().members).length) : null;
      set((st) => {
        const { [rid]: was, ...members } = st.members;
        const saved = { ...(was ?? member), id, memberNo };
        return {
          members: { ...members, [id]: saved },
          loyaltySel: st.loyaltySel === rid ? id : st.loyaltySel,
          loyaltyResults: st.loyaltyResults.map((x) => (x === rid ? id : x)),
          ticket: st.ticket.customerId === rid ? { ...st.ticket, customerId: id } : st.ticket,
        };
      });
      get().showToast(t('loyalty.toastEnrolled', { name: cleanName }), 'success');
      return true;
    },
    // ---- gift cards (wave 2) ----
    openGiftCards: () => {
      set({ view: 'giftcards' });
      // The demo opens as the comp draws it: its card, chosen.
      if (DEMO && get().giftSel === null) {
        const [card] = demoCards();
        if (card !== undefined) {
          set((st) => ({ cards: { [card.id]: card, ...st.cards } }));
          pickCard(card.id);
        }
      }
    },
    findGiftCard: async (code) => {
      const wanted = normaliseCode(code);
      if (wanted === '') return false;
      // A card this till made or read already answers at once.
      const known = Object.values(get().cards).find((c) => c.code === wanted);
      if (known !== undefined) {
        pickCard(known.id);
        return true;
      }
      set({ giftBusy: true });
      const card = await giftCards()
        .byCode(wanted)
        .catch(() => null);
      set({ giftBusy: false });
      if (card === null) {
        get().showToast(t('gift.toastNotFound', { code: wanted }), 'error');
        return false;
      }
      set((st) => ({ cards: { ...st.cards, [card.id]: card } }));
      pickCard(card.id);
      return true;
    },
    issueGiftCard: async () => {
      const rid = outbox().temp();
      const draft: GiftCard = { id: rid, code: '', status: 'inactive', balance: 0, issuedAt: null };
      set((st) => ({ cards: { ...st.cards, [rid]: draft }, giftSel: rid, giftActivity: [] }));
      const row = await outbox().insert('gift_cards', 'gift_cards', { status: 'inactive' }, {
        temp: rid,
        onRefused: (error) => {
          set((st) => {
            const { [rid]: _gone, ...cards } = st.cards;
            return { cards, giftSel: st.giftSel === rid ? null : st.giftSel };
          });
          refused(error);
        },
      });
      if (row === null) return false;
      // Adminium gives the card its code; the demo's memory makes one up.
      const code = typeof row['code'] === 'string' ? row['code'] : DEMO ? demoGiftCode() : '';
      const id = String(row['id'] ?? rid);
      set((st) => {
        const { [rid]: was, ...cards } = st.cards;
        return {
          cards: { ...cards, [id]: { ...(was ?? draft), id, code } },
          giftSel: st.giftSel === rid ? id : st.giftSel,
          ticket: { ...st.ticket, items: st.ticket.items.map((x) => (x.giftCard?.cardId === rid ? { ...x, giftCard: { ...x.giftCard, cardId: id, code } } : x)) },
        };
      });
      get().showToast(t('gift.toastIssued', { code }), 'success');
      return true;
    },
    loadGiftCard: (amount) => {
      const s = get();
      const card = s.giftSel === null ? undefined : s.cards[s.giftSel];
      if (card === undefined || card.status === 'void' || !(amount > 0)) return;
      if (card.code === '') {
        // Still being made: its code is on its way.
        get().showToast(t('gift.toastWait'));
        return;
      }
      const items = s.ticket.items.slice();
      const i = items.findIndex((x) => x.giftCard?.cardId === card.id);
      if (i >= 0) {
        // One line per card: another tap adds to it.
        const was = items[i]!;
        const next = { ...was, giftCard: { ...was.giftCard!, amount: round2(was.giftCard!.amount + amount) } };
        items[i] = next;
        set({ ticket: { ...s.ticket, items } });
        if (next.rid !== undefined) void outbox().update(ensureTicket(), 'ticket_items', next.rid, { unit_price: next.giftCard!.amount }, { onRefused: refused });
      } else {
        const li: LineItem = {
          key: `gift:${card.id}`,
          rid: outbox().temp(),
          id: '',
          qty: 1,
          selection: {},
          note: '',
          seat: 0,
          sent: false,
          giftCard: { cardId: card.id, code: card.code, amount: round2(amount) },
        };
        set({ ticket: { ...s.ticket, items: [...items, li] } });
        const ticketRid = ensureTicket();
        void outbox().insert(ticketRid, 'ticket_items', lineValues(ticketRid, li), {
          temp: li.rid,
          onRefused: (error) => {
            dropLine(li.rid);
            refused(error);
          },
        });
      }
      get().showToast(t('gift.toastLoaded', { amount: money(amount), code: card.code }), 'success');
    },
    payWithGiftCard: () => {
      const s = get();
      const card = s.giftSel === null ? undefined : s.cards[s.giftSel];
      if (card === undefined || s.paying) return;
      if (!s.ticket.items.length) {
        get().showToast(t('toast.addItemsFirst'));
        return;
      }
      if (card.status !== 'active') {
        get().showToast(t('gift.toastNotActive'), 'error');
        return;
      }
      // A card cannot pay for the money being put on itself.
      if (s.ticket.items.some((x) => x.giftCard?.cardId === card.id)) {
        get().showToast(t('gift.toastSameCard'), 'error');
        return;
      }
      const rem = remaining(s);
      const amount = round2(Math.min(card.balance, rem));
      if (amount <= 0) {
        get().showToast(t(card.balance <= 0 ? 'gift.toastEmpty' : 'gift.toastNothingDue'), 'error');
        return;
      }
      const split: Split = { method: 'gift_card', amount, reference: card.code };
      const settles = rem - amount <= 0.005;
      const ticketRid = ensureTicket();
      void savePayment(split, settles).then((ok) => {
        if (!ok) return;
        // The card pays: its history takes the amount off, under the ticket.
        const id = deviceKey();
        const at = Date.now();
        void outbox().insert(ticketRid, 'gift_card_ledger', { id, card_id: dbKey(card.id), kind: 'redeem', amount: -amount, ticket_id: ticketRid, staff_id: staffKey() }, { onRefused: refused });
        set((st) => {
          const was = st.cards[card.id];
          const entry: GiftCardEntry = { id, kind: 'redeem', amount: -amount, at };
          return {
            cards: was === undefined ? st.cards : { ...st.cards, [card.id]: { ...was, balance: round2(was.balance - amount) } },
            giftLog: { ...st.giftLog, [card.id]: [entry, ...(st.giftLog[card.id] ?? [])] },
            giftActivity: st.giftSel === card.id ? [entry, ...st.giftActivity] : st.giftActivity,
          };
        });
        const now = get();
        const splits = now.splits.concat([split]);
        get().showToast(t('gift.toastApplied', { amount: money(amount) }), 'success');
        if (settles) void finalize(splits, 0);
        else set({ splits, view: 'payment' });
      });
    },
    // ---- customer display (wave 2) ----
    displayTip: (choice) => {
      if (choice === 'custom') get().openTipPad();
      else set({ tip: choice, tipCustom: '' });
    },
    openTipPad: () => set({ tipPad: '' }),
    tipPadPush: (key) =>
      set((s) => {
        const c = s.tipPad ?? '';
        if (key === 'back') return { tipPad: c.slice(0, -1) };
        if (key === '.') return c.includes('.') ? {} : { tipPad: (c === '' ? '0' : c) + '.' };
        const next = c + key;
        if (next.includes('.') && next.split('.')[1]!.length > 2) return {};
        if (next.replace('.', '').length > 6) return {};
        return { tipPad: next };
      }),
    applyTipPad: () => {
      const v = round2(parseFloat(get().tipPad || '0') || 0);
      set({ tip: 'c', tipCustom: String(v), tipPad: null });
    },
    closeTipPad: () => set({ tipPad: null }),
    displayContinue: () => {
      if (!get().ticket.items.length) {
        get().showToast(t('display.toastNoItems'));
        return;
      }
      set((s) => ({ display: { ...s.display, step: 'sign' } }));
    },
    displayBack: () => set((s) => ({ display: { ...s.display, step: 'order' } })),
    // A tap is the signature: the device has no drawing surface (the comp's own box).
    displaySign: () => set((s) => ({ display: { ...s.display, signed: !s.display.signed } })),
    displayReceipt: (via) => set((s) => ({ display: { ...s.display, receipt: via } })),
    displayReceiptTo: (to) => set((s) => ({ display: { ...s.display, receiptTo: to } })),
    displayDone: () => {
      const s = get();
      const d = s.display;
      if (!d.signed) return;
      const to = d.receiptTo.trim();
      // Email and text need somewhere to send; the rest need nothing.
      if ((d.receipt === 'email' || d.receipt === 'text') && to === '') {
        get().showToast(t(d.receipt === 'email' ? 'display.needEmail' : 'display.needPhone'), 'error');
        return;
      }
      void saveTicket(ensureTicket(), {
        signed_at: new Date().toISOString(),
        receipt_via: d.receipt === '' ? null : d.receipt,
        receipt_to: d.receipt === 'email' || d.receipt === 'text' ? to : null,
      });
      set({ display: { step: 'order', signed: false, receipt: d.receipt, receiptTo: d.receiptTo } });
      get().showToast(t('display.toastDone'), 'success');
    },

    // ---- pickup (wave 2) ----
    setPickupSheet: (open) => {
      if (open && !get().ticket.items.length) {
        get().showToast(t('toast.addItemsFirst'));
        return;
      }
      set({ pickupSheetOpen: open });
    },
    markPickup: async ({ name, mobile, channel }) => {
      const cleanName = name.trim();
      const cleanMobile = mobile.trim();
      if (cleanName === '') return false;
      const s = get();
      // Who collects it is the ticket's customer: the member on it, else the one this number is, else someone new.
      let customerId = s.ticket.customerId;
      if (customerId === undefined && cleanMobile !== '') {
        const digits = cleanMobile.replace(/\D+/g, '');
        const found = await loyalty()
          .search(cleanMobile)
          .catch(() => [] as Member[]);
        const known = [...found, ...Object.values(get().members)].find((m) => (m.mobile ?? '').replace(/\D+/g, '') === digits);
        if (known !== undefined) {
          customerId = known.id;
          set((st) => ({ members: { ...st.members, [known.id]: st.members[known.id] ?? known } }));
        }
      }
      if (customerId === undefined) {
        const rid = outbox().temp();
        const person: Member = { id: rid, memberNo: null, name: cleanName, mobile: cleanMobile === '' ? null : cleanMobile, email: null, joinedAt: Date.now(), points: 0, lifetime: 0, visits: 0 };
        set((st) => ({ members: { ...st.members, [rid]: person } }));
        customerId = rid;
        void outbox().insert('customers', 'customers', { name: person.name, mobile: person.mobile, email: null }, {
          temp: rid,
          onSaved: (row) => {
            const id = String(row['id'] ?? rid);
            set((st) => {
              const { [rid]: was, ...members } = st.members;
              return {
                members: { ...members, [id]: { ...(was ?? person), id } },
                ticket: st.ticket.customerId === rid ? { ...st.ticket, customerId: id } : st.ticket,
              };
            });
          },
          onRefused: refused,
        });
      }
      const now = get();
      const ticketRid = ensureTicket();
      const number = now.ticket.number;
      set((st) => ({
        ticket: { ...st.ticket, customerId, pickup: channel },
        pickupSheetOpen: false,
        pickups: [
          ...st.pickups.filter((p) => p.rid !== ticketRid),
          {
            rid: ticketRid,
            number,
            name: cleanName,
            mobile: cleanMobile === '' ? null : cleanMobile,
            channel,
            stage: 'queued',
            placedAt: Date.now(),
            readyAt: null,
            notifiedAt: null,
            items: [],
          },
        ],
      }));
      // The code is the ticket's number — Adminium's, so it waits for it when the ticket is new.
      const numbered = outbox().resolve(ticketRid) !== undefined;
      void saveTicket(ticketRid, { customer_id: dbKey(customerId), channel, pickup_stage: 'queued', ...(numbered ? { pickup_code: String(number) } : {}) });
      get().showToast(t('pickup.toastQueued', { n: number, name: cleanName }), 'success');
      return true;
    },
    advancePickup: (rid) => {
      const order = get().pickups.find((p) => p.rid === rid);
      if (order === undefined) return;
      const at = new Date().toISOString();
      if (order.stage === 'queued') {
        set((st) => ({ pickups: st.pickups.map((p) => (p.rid === rid ? { ...p, stage: 'making' } : p)) }));
        void saveTicket(rid, { pickup_stage: 'making' });
      } else if (order.stage === 'making') {
        set((st) => ({ pickups: st.pickups.map((p) => (p.rid === rid ? { ...p, stage: 'ready', readyAt: Date.now() } : p)) }));
        void saveTicket(rid, { pickup_stage: 'ready', ready_at: at });
        get().showToast(t('pickup.toastReady', { n: order.number }), 'success');
      } else {
        set((st) => ({ pickups: st.pickups.filter((p) => p.rid !== rid) }));
        void saveTicket(rid, { pickup_stage: 'collected' });
        get().showToast(t('pickup.toastHanded', { n: order.number }), 'success');
      }
    },
    notifyPickup: (rid) => {
      const order = get().pickups.find((p) => p.rid === rid);
      if (order === undefined || order.stage !== 'ready') return;
      set((st) => ({ pickups: st.pickups.map((p) => (p.rid === rid ? { ...p, notifiedAt: Date.now() } : p)) }));
      void saveTicket(rid, { notified_at: new Date().toISOString() });
      get().showToast(t('pickup.toastNotified', { name: order.name || String(order.number) }), 'success');
    },
  };

  // ---- charge helpers (need get/set closure) ----
  function applyCash() {
    const s = get();
    if (s.paying) return;
    const rem = remaining(s);
    const tend = parseFloat(s.cash || '0') || 0;
    if (tend <= 0) {
      get().showToast(t('toast.enterCash'));
      return;
    }
    const target = chargeTarget(s);
    let applied: number;
    let change: number;
    if (s.splitMode === 'none') {
      applied = Math.min(tend, rem);
      change = tend > rem ? tend - rem : 0;
    } else {
      if (tend < target - 0.005) {
        get().showToast(t('toast.underShare', { amount: money(target) }), 'error');
        return;
      }
      applied = target;
      change = tend - target;
    }
    const split: Split = { method: 'cash', amount: applied, tendered: tend, change };
    const settles = rem - applied <= 0.005;
    void savePayment(split, settles).then((ok) => {
      if (ok) settleCash(split, settles, rem, applied, change);
    });
  }
  function settleCash(split: Split, settles: boolean, rem: number, applied: number, change: number) {
    const s = get();
    const splits = s.splits.concat([split]);
    if (settles) {
      void finalize(splits, change);
    } else {
      set({ splits, cash: '', ...clearAmountSplit(s) });
      get().showToast(t('toast.paidPartial', { amount: money(applied), rem: money(rem - applied) }), 'success');
    }
  }
  /*
   * The card reader is faked with two chained timers. They outlive the screen:
   * start a charge, tap away to the register or the kitchen while it "reads",
   * and 2.3s later the sale finalised anyway and yanked the view to the
   * receipt. Each callback re-checks that the payment screen is still up and
   * still on Card before it does anything — a guard rather than a cancel,
   * because several screens navigate with `usePos.setState` directly and would
   * bypass any action-level cleanup.
   */
  function stillPaying(): boolean {
    return get().view === 'payment' && get().payMethod === 'card';
  }

  function runCard() {
    if (get().card === 'reading' || get().card === 'approved') return;
    set({ card: 'reading' });
    clearTimeout(ctTimer);
    ctTimer = setTimeout(() => {
      if (!stillPaying()) return;
      if (get().declined) {
        set({ card: 'declined' });
        get().showToast(t('toast.cardDeclined'), 'error');
      } else {
        set({ card: 'approved' });
        clearTimeout(ct2Timer);
        ct2Timer = setTimeout(() => {
          if (!stillPaying()) return;
          const st = get();
          const rem = remaining(st);
          const amt = Math.min(chargeTarget(st), rem);
          const split: Split = { method: 'card', amount: amt };
          const settles = rem - amt <= 0.005;
          void savePayment(split, settles).then((ok) => {
            if (!ok) {
              set({ card: 'waiting' });
              return;
            }
            const now = get();
            const splits = now.splits.concat([split]);
            if (settles) void finalize(splits, 0);
            else {
              set({ splits, card: 'waiting', ...clearAmountSplit(now) });
              get().showToast(t('toast.cardSharePaid', { rem: money(rem - amt) }), 'success');
            }
          });
        }, 850);
      }
    }, 1500);
  }
  function applyQr() {
    const st = get();
    if (st.paying) return;
    const rem = remaining(st);
    const amt = Math.min(chargeTarget(st), rem);
    const split: Split = { method: 'qr', amount: amt };
    const settles = rem - amt <= 0.005;
    void savePayment(split, settles).then((ok) => {
      if (!ok) return;
      const now = get();
      const splits = now.splits.concat([split]);
      if (settles) void finalize(splits, 0);
      else {
        set({ splits, ...clearAmountSplit(now) });
        get().showToast(t('toast.walletSharePaid', { rem: money(rem - amt) }), 'success');
      }
    });
  }
});

// The offline chip and the sign-in notice follow the outbox, across a sink swap.
watchOutbox((sync) => usePos.setState({ sync }));

export { curStaffOf };
/*
 * The seed re-export that used to stand here — `SHIFT`, `STAFF`, `TABLES`
 * forwarded straight out of `data/demo.ts` — is gone. Nothing imported it any
 * more, and while it stood it was a second door into the seed that the seam
 * could not close: a connected till would have served the demo's shift totals
 * and the demo's floor plan to anybody who took this route instead.
 */
