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
      splits: [],
      cash: '',
      card: 'waiting',
      splitMode: 'none',
      splitN: 0,
      splitCustom: '',
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
    inc: (k) => setItems(get().ticket.items.map((x) => (x.key === k ? { ...x, qty: x.qty + 1 } : x))),
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
      const un = get().ticket.items.filter((x) => !x.sent).length;
      if (!un) {
        get().showToast('Nothing new to send');
        return;
      }
      setItems(get().ticket.items.map((x) => ({ ...x, sent: true })));
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
      set({ held, ticket: freshTicket() });
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
      const items = s.ticket.items.concat(h.items.map((x) => ({ ...x })));
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
      if (!get().ticket.items.length) {
        get().showToast('Add items first');
        return;
      }
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
      const s = get();
      set({
        ticket: {
          number: (s.lastSale ? s.lastSale.number : 1042) + 1,
          table: s.mode === 'retail' ? '—' : null,
          seats: 2,
          openedAt: Date.now(),
          items: [],
        },
        view: 'register',
        lastSale: null,
        splits: [],
        cash: '',
        card: 'waiting',
        tip: 2,
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
      if (t.current) {
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
      set({ splits, cash: '', splitCustom: '' });
      get().showToast('Paid ' + money(applied) + ' · ' + money(rem - applied) + ' left', 'success');
    }
  }
  function runCard() {
    if (get().card === 'reading' || get().card === 'approved') return;
    set({ card: 'reading' });
    clearTimeout(ctTimer);
    ctTimer = setTimeout(() => {
      if (get().declined) {
        set({ card: 'declined' });
        get().showToast('Card declined — try another card', 'error');
      } else {
        set({ card: 'approved' });
        clearTimeout(ct2Timer);
        ct2Timer = setTimeout(() => {
          const st = get();
          const rem = remaining(st);
          const amt = Math.min(chargeTarget(st), rem);
          const splits = st.splits.concat([{ method: 'card', amount: amt } as Split]);
          if (rem - amt <= 0.005) finalize(splits, 0);
          else {
            set({ splits, card: 'waiting', splitCustom: '' });
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
      set({ splits, splitCustom: '' });
      get().showToast('Wallet share paid · ' + money(rem - amt) + ' left', 'success');
    }
  }
});

export { curStaffOf };
export { SHIFT, STAFF, TABLES } from '../data/demo';
