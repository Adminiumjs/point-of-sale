// Central POS store — a faithful port of the design comp's `class Component
// extends DCLogic`. One store is shared across register / floor / payment /
// kitchen, exactly like the comp's single-store shape. View routing is a single
// `view` state var (no router), also like the comp.

import { create } from 'zustand';
import { demoSource } from '../data/source';
import { STAFF, seedTicket } from '../data/demo';
import type {
  Discount,
  DiscountKind,
  HeldTicket,
  KdsOrder,
  LineItem,
  PayMethod,
  Sale,
  ServiceMode,
  Size,
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
  discountAmt,
  itemById,
  keyOf,
  lineTotal,
  lineUnit,
  modLabel,
  money,
  remaining,
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
  sheetSize: Size;
  sheetMilk: string;
  sheetExtras: string[];
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
  kds: KdsOrder[];

  toast: Toast | null;

  // actions
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
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
  setSheetSize: (s: Size) => void;
  setSheetMilk: (m: string) => void;
  toggleSheetExtra: (x: string) => void;
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
  applyDiscount: (kind: DiscountKind, value: number, label: string) => void;
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
  sendReceipt: (kind: string) => void;

  bumpK: (n: number) => void;
  openTable: (t: TableInfo) => void;
}

// Timers held module-side (mirrors the comp's this._ct / this._pt handles).
let ptTimer: ReturnType<typeof setTimeout>;
let ctTimer: ReturnType<typeof setTimeout>;
let ct2Timer: ReturnType<typeof setTimeout>;
let ttTimer: ReturnType<typeof setTimeout>;

const curStaffOf = (s: PosState): Staff => STAFF.find((x) => x.id === s.staffSel) || STAFF[0];

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

const initialTheme = (): Theme => {
  try {
    const t = localStorage.getItem('pos-theme');
    if (t === 'dark' || t === 'light') return t;
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
    opt: { qty?: number; size?: Size | null; milk?: string | null; extras?: string[]; note?: string; seat?: number } = {},
  ) => {
    const items = get().ticket.items.slice();
    const k = keyOf(id, opt.size, opt.milk, opt.extras, opt.note, opt.seat);
    const i = items.findIndex((x) => x.key === k);
    if (i >= 0) {
      items[i] = { ...items[i], qty: items[i].qty + (opt.qty || 1) };
    } else {
      items.push({
        key: k,
        id,
        qty: opt.qty || 1,
        size: opt.size || null,
        milk: opt.milk || null,
        extras: opt.extras || [],
        note: opt.note || '',
        seat: opt.seat || 0,
        sent: false,
      });
    }
    setItems(items);
  };
  const finalize = (splits: Split[], change: number) => {
    const s = get();
    const sale: Sale = {
      number: s.ticket.number,
      table: s.ticket.table,
      items: s.ticket.items.map((x) => ({
        name: itemById(x.id)?.name ?? x.id,
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
    };
    get().showToast('Payment complete · ' + money(sale.total), 'success');
    set({
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
      tipCustom: '',
      /*
       * The discount belongs to the ticket that just closed, not to the
       * register. Without this a comp stayed applied after the sale finalised,
       * so every subsequent customer was rung up free until someone noticed and
       * cleared it by hand.
       */
      discount: null,
    });
  };

  return {
    theme: initialTheme(),
    mode: 'restaurant',
    online: true,
    view: 'login',
    tick: 0,

    loginStep: 'pin',
    pin: '',
    pinErr: false,
    staffSel: 'sam',
    drawer: 200,

    cat: 'all',
    search: '',
    menuDensity: 'cozy',
    coursing: false,
    unavail: ['almond'],
    ticket: demoSource.openTicket(),
    held: demoSource.heldTickets(),

    sheetOpen: false,
    sheetId: null,
    sheetQty: 1,
    sheetSize: 'M',
    sheetMilk: 'Whole',
    sheetExtras: [],
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
    tip: 2,
    tipCustom: '',
    card: 'waiting',
    declined: false,
    splits: [],
    splitMode: 'none',
    splitN: 0,
    splitCustom: '',

    lastSale: null,
    kds: demoSource.kitchenOrders(),

    toast: null,

    // ---- display / behaviour ----
    toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    setTheme: (t) => set({ theme: t }),
    setMode: (m) =>
      set((s) => ({ mode: m, view: m === 'retail' && s.view === 'floor' ? 'register' : s.view })),
    toggleOnline: () => set((s) => ({ online: !s.online })),
    toggleDeclined: () => {
      const willDecline = !get().declined;
      set({ declined: willDecline, card: 'waiting' });
      get().showToast(willDecline ? 'Card will decline' : 'Card will approve');
    },
    go: (v) => {
      if (v === 'login') set({ view: 'login', loginStep: 'pin', pin: '', pinErr: false });
      else if (v === 'payment') get().openPay();
      else if (v === 'move') get().openMove();
      else if (v === 'discount') get().openDiscount();
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
      set({ view: 'register' });
      get().showToast('Shift opened · Drawer ' + money(get().drawer), 'success');
    },

    // ---- register ----
    setCat: (slug) => set({ cat: slug, search: '' }),
    setSearch: (q) => set({ search: q }),
    setDensity: (d) => set({ menuDensity: d }),
    toggleCoursing: () => set((s) => ({ coursing: !s.coursing })),
    emptyTicket: () => setItems([]),
    resetTicket: () => set({ ticket: seedTicket() }),

    tapTile: (id) => {
      const s = get();
      const m = itemById(id);
      if (!m || m.available === false || s.unavail.indexOf(id) >= 0) return;
      if (m.mods) get().openSheet(id);
      else addLine(id, {});
    },
    // Bump exactly one line, mirroring `dec`. A `.map` over the key would bump
    // every line that shares it, which is only safe while the no-duplicate-keys
    // invariant holds — enforce it here rather than assume it.
    inc: (k) => {
      const items = get().ticket.items.slice();
      const i = items.findIndex((x) => x.key === k);
      if (i < 0) return;
      items[i] = { ...items[i], qty: items[i].qty + 1 };
      setItems(items);
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
        items.splice(i, 1);
      } else {
        items[i] = { ...items[i], qty: items[i].qty - 1 };
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
      setItems(get().ticket.items.filter((x) => x.key !== k));
    },
    send: () => {
      const s = get();
      const unsent = s.ticket.items.filter((x) => !x.sent);
      if (!unsent.length) {
        get().showToast('Nothing new to send');
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
        n: itemById(x.id)?.name ?? x.id,
        q: x.qty,
        m: [modLabel(x), x.note].filter(Boolean).join(' · '),
      }));
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
          table: s.ticket.table || 'New',
          at: Date.now(),
          status: 'new',
          items: rows,
        });
      }
      set({ ticket: { ...s.ticket, items: s.ticket.items.map((x) => ({ ...x, sent: true })) }, kds });
      get().showToast('Order sent to kitchen');
    },
    hold: () => {
      const s = get();
      if (!s.ticket.items.length) {
        get().showToast('Ticket is empty');
        return;
      }
      const t = s.ticket;
      const held = s.held.concat([
        { number: t.number, table: t.table || 'New', at: Date.now(), seats: t.seats, items: t.items },
      ]);
      // A discount applies to the ticket on the register; it must not follow the
      // register onto the next one. (Held tickets do not carry a discount, so a
      // held-then-resumed ticket has to have it re-applied.)
      set({ held, ticket: freshTicket(), discount: null });
      get().showToast('Ticket held');
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
        held.push({ number: cur.number, table: cur.table || 'New', at: Date.now(), seats: cur.seats, items: cur.items });
      }
      set({
        held,
        ticket: { number: h.number, table: h.table, seats: h.seats || 2, openedAt: h.at, items: h.items },
        heldOpen: false,
        view: 'register',
        discount: null,
      });
      get().showToast('Resumed ' + tableName(h.table, s.mode));
    },

    // ---- modifier sheet ----
    openSheet: (id) =>
      set({
        sheetOpen: true,
        sheetId: id,
        sheetQty: 1,
        sheetSize: 'M',
        sheetMilk: 'Whole',
        sheetExtras: [],
        sheetNote: '',
        sheetSeat: 0,
      }),
    closeSheet: () => set({ sheetOpen: false }),
    sheetQtyInc: () => set((s) => ({ sheetQty: s.sheetQty + 1 })),
    sheetQtyDec: () => set((s) => ({ sheetQty: Math.max(1, s.sheetQty - 1) })),
    setSheetSize: (v) => set({ sheetSize: v }),
    setSheetMilk: (m) => set({ sheetMilk: m }),
    toggleSheetExtra: (x) =>
      set((s) => ({
        sheetExtras: s.sheetExtras.indexOf(x) >= 0 ? s.sheetExtras.filter((y) => y !== x) : s.sheetExtras.concat([x]),
      })),
    setSheetNote: (n) => set({ sheetNote: n }),
    setSheetSeat: (n) => set({ sheetSeat: n }),
    sheetAdd: () => {
      const s = get();
      const m = itemById(s.sheetId || '');
      if (!m) return;
      const ms = m.mods;
      const opt: { qty: number; note: string; seat: number; size?: Size; milk?: string; extras?: string[] } = {
        qty: s.sheetQty,
        note: s.sheetNote,
        seat: s.sheetSeat,
      };
      if (ms === 'coffee' || ms === 'tea' || ms === 'cold') opt.size = s.sheetSize;
      if (ms === 'coffee' || ms === 'tea') opt.milk = s.sheetMilk;
      if (ms === 'coffee' || ms === 'cold') opt.extras = s.sheetExtras.slice();
      addLine(s.sheetId as string, opt);
      set({ sheetOpen: false });
      get().showToast('Added ' + m.name, 'success');
    },

    // ---- void ----
    openVoid: (k) => set({ voidOpen: true, voidKey: k, voidText: '' }),
    setVoidText: (t) => set({ voidText: t }),
    closeVoid: () => set({ voidOpen: false, voidText: '' }),
    confirmVoid: () => {
      const s = get();
      if (s.voidText.trim().toUpperCase() !== 'VOID') return;
      const k = s.voidKey;
      setItems(s.ticket.items.filter((x) => x.key !== k));
      set({ voidOpen: false, voidKey: null, voidText: '' });
      get().showToast('Item voided');
    },

    // ---- move / discount ----
    openMove: () => set({ moveOpen: true }),
    closeMove: () => set({ moveOpen: false }),
    doMove: (label) => {
      set((s) => ({ ticket: { ...s.ticket, table: label }, moveOpen: false }));
      get().showToast('Moved to ' + tableName(label, get().mode), 'success');
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
      get().showToast('Merged ' + tableName(h.table, s.mode) + ' in', 'success');
    },
    openDiscount: () => set({ discountOpen: true }),
    closeDiscount: () => set({ discountOpen: false }),
    applyDiscount: (kind, value, label) => {
      set({ discount: { kind, value, label }, discountOpen: false });
      get().showToast((kind === 'comp' ? 'Comped · ' : 'Discount · ') + label, 'success');
    },
    clearDiscount: () => {
      set({ discount: null, discountOpen: false });
      get().showToast('Discount removed');
    },

    // ---- payment ----
    openPay: () => {
      const cur = get();
      if (!cur.ticket.items.length) {
        get().showToast('Add items first');
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
        tip: 2,
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
        tip: 2,
        tipCustom: '',
        discount: null,
      });
    },
    printReceipt: () => get().showToast('Sent to receipt printer'),
    sendReceipt: (kind) => get().showToast(kind + ' receipt sent'),

    // ---- kitchen ----
    bumpK: (n) =>
      set((s) => {
        const k = s.kds.map((o) => ({ ...o }));
        const i = k.findIndex((o) => o.number === n);
        if (i < 0) return {};
        if (k[i].status === 'new') k[i].status = 'cooking';
        else if (k[i].status === 'cooking') k[i].status = 'ready';
        else k.splice(i, 1);
        return { kds: k };
      }),

    // ---- floor ----
    openTable: (t) => {
      const s = get();
      // Where the open ticket actually is, not the seed's pinned `current` flag.
      if (t.label === s.ticket.table) {
        set({ view: 'register' });
        return;
      }
      const held = s.held.slice();
      const cur = s.ticket;
      if (cur.items.length) {
        held.push({ number: cur.number, table: cur.table || 'New', at: Date.now(), seats: cur.seats, items: cur.items });
      }
      set({
        ticket: { number: nextNum(), table: t.label, seats: t.seats, openedAt: Date.now(), items: [] },
        held,
        view: 'register',
        discount: null,
      });
      get().showToast((t.status === 'open' ? 'Seated ' : 'Opened ') + tableName(t.label, s.mode));
    },
  };

  // ---- charge helpers (need get/set closure) ----
  function applyCash() {
    const s = get();
    const rem = remaining(s);
    const tend = parseFloat(s.cash || '0') || 0;
    if (tend <= 0) {
      get().showToast('Enter cash tendered');
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
        get().showToast('Under the ' + money(target) + ' share', 'error');
        return;
      }
      applied = target;
      change = tend - target;
    }
    const splits = s.splits.concat([{ method: 'cash', amount: applied, tendered: tend, change }]);
    if (rem - applied <= 0.005) {
      finalize(splits, change);
    } else {
      set({ splits, cash: '', ...clearAmountSplit(s) });
      get().showToast('Paid ' + money(applied) + ' · ' + money(rem - applied) + ' left', 'success');
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
        get().showToast('Card declined — try another card', 'error');
      } else {
        set({ card: 'approved' });
        clearTimeout(ct2Timer);
        ct2Timer = setTimeout(() => {
          if (!stillPaying()) return;
          const st = get();
          const rem = remaining(st);
          const amt = Math.min(chargeTarget(st), rem);
          const splits = st.splits.concat([{ method: 'card', amount: amt } as Split]);
          if (rem - amt <= 0.005) finalize(splits, 0);
          else {
            set({ splits, card: 'waiting', ...clearAmountSplit(st) });
            get().showToast('Card share paid · ' + money(rem - amt) + ' left', 'success');
          }
        }, 850);
      }
    }, 1500);
  }
  function applyQr() {
    const st = get();
    const rem = remaining(st);
    const amt = Math.min(chargeTarget(st), rem);
    const splits = st.splits.concat([{ method: 'qr', amount: amt } as Split]);
    if (rem - amt <= 0.005) finalize(splits, 0);
    else {
      set({ splits, ...clearAmountSplit(st) });
      get().showToast('Wallet share paid · ' + money(rem - amt) + ' left', 'success');
    }
  }
});

export { curStaffOf };
export { SHIFT, STAFF, TABLES } from '../data/demo';
