import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF, TABLES } from '../data/demo';
import { keyOf } from '../data/key';
import { remaining, subtotal, total } from './calc';
import { usePos } from './store';

/*
 * The store is a module singleton, so each test restores the state it was
 * created with. `true` replaces rather than merges, which also puts the action
 * functions back.
 */
const INITIAL = usePos.getState();
const reset = () => usePos.setState(INITIAL, true);
const s = () => usePos.getState();

beforeEach(reset);
afterEach(() => {
  vi.useRealTimers();
});

const keysOf = () => s().ticket.items.map((x) => x.key);
const qtyOf = (k: string) => s().ticket.items.find((x) => x.key === k)?.qty ?? 0;

describe('login', () => {
  it('a correct PIN advances to the drawer step', () => {
    vi.useFakeTimers();
    '1234'.split('').forEach((d) => s().pinPush(d));
    vi.runAllTimers();
    expect(s().loginStep).toBe('drawer');
    expect(s().pinErr).toBe(false);
  });

  it('a wrong PIN clears the entry and flags the error', () => {
    vi.useFakeTimers();
    '9999'.split('').forEach((d) => s().pinPush(d));
    vi.runAllTimers();
    expect(s().loginStep).toBe('pin');
    expect(s().pin).toBe('');
    expect(s().pinErr).toBe(true);
  });

  it('the PIN is checked against the selected staff member', () => {
    vi.useFakeTimers();
    s().selStaff('alex');
    STAFF.find((x) => x.id === 'alex')!.pin.split('').forEach((d) => s().pinPush(d));
    vi.runAllTimers();
    expect(s().loginStep).toBe('drawer');
  });

  it('will not take a fifth digit', () => {
    vi.useFakeTimers();
    '12345'.split('').forEach((d) => s().pinPush(d));
    expect(s().pin.length).toBeLessThanOrEqual(4);
  });

  it('backspace and clear', () => {
    s().pinPush('1');
    s().pinPush('2');
    s().pinPush('back');
    expect(s().pin).toBe('1');
    s().pinPush('clear');
    expect(s().pin).toBe('');
  });

  it('switching staff mid-entry discards the digits typed for the last one', () => {
    s().pinPush('1');
    s().pinPush('2');
    s().selStaff('jordan');
    expect(s().pin).toBe('');
  });

  it('the drawer float never goes negative', () => {
    s().drawerAdj(-99999);
    expect(s().drawer).toBe(0);
  });
});

describe('adding items', () => {
  it('an item with no modifiers goes straight onto the ticket', () => {
    const before = s().ticket.items.length;
    s().tapTile('soup');
    expect(s().ticket.items.length).toBe(before + 1);
    expect(s().sheetOpen).toBe(false);
  });

  it('an item with modifiers opens the sheet instead', () => {
    s().tapTile('latte');
    expect(s().sheetOpen).toBe(true);
    expect(s().sheetId).toBe('latte');
  });

  it('an unavailable item cannot be added', () => {
    const before = s().ticket.items.length;
    s().tapTile('almond'); // available: false
    expect(s().ticket.items.length).toBe(before);
    expect(s().sheetOpen).toBe(false);
  });

  it('an unknown item is ignored', () => {
    const before = s().ticket.items.length;
    s().tapTile('no-such-thing');
    expect(s().ticket.items.length).toBe(before);
  });

  /*
   * The seeded ticket already holds two Croissants. Tapping Croissant again
   * must reach the same line — this is what the stale hand-written seed keys
   * used to break.
   */
  it('tapping an item already on the ticket bumps that line', () => {
    const k = keyOf('croissant');
    expect(qtyOf(k)).toBe(2);
    const rows = s().ticket.items.length;
    s().tapTile('croissant');
    expect(qtyOf(k)).toBe(3);
    expect(s().ticket.items.length).toBe(rows);
  });

  it('the same drink with different modifiers is a different line', () => {
    s().tapTile('latte');
    s().setSheetMilk('Oat');
    s().sheetAdd();
    const rows = s().ticket.items.length;
    s().tapTile('latte');
    s().setSheetMilk('Almond');
    s().sheetAdd();
    expect(s().ticket.items.length).toBe(rows + 1);
  });

  it('the sheet resets every time it opens', () => {
    s().tapTile('latte');
    s().setSheetSize('L');
    s().setSheetMilk('Oat');
    s().toggleSheetExtra('Vanilla');
    s().setSheetNote('hot');
    s().sheetQtyInc();
    s().closeSheet();
    s().tapTile('mocha');
    expect(s().sheetSize).toBe('M');
    expect(s().sheetMilk).toBe('Whole');
    expect(s().sheetExtras).toEqual([]);
    expect(s().sheetNote).toBe('');
    expect(s().sheetQty).toBe(1);
  });

  it('sheet quantity never drops below one', () => {
    s().tapTile('latte');
    s().sheetQtyDec();
    s().sheetQtyDec();
    expect(s().sheetQty).toBe(1);
  });

  it('toggling an extra adds then removes it', () => {
    s().tapTile('latte');
    s().toggleSheetExtra('Vanilla');
    expect(s().sheetExtras).toEqual(['Vanilla']);
    s().toggleSheetExtra('Vanilla');
    expect(s().sheetExtras).toEqual([]);
  });

  it('the sheet only applies the modifiers its scheme offers', () => {
    // Cold drinks take a size and extras but no milk choice.
    s().tapTile('coldbrew');
    s().setSheetMilk('Oat');
    s().setSheetSize('L');
    s().sheetAdd();
    const added = s().ticket.items.find((x) => x.id === 'coldbrew' && x.size === 'L' && x.extras.length === 0);
    expect(added).toBeDefined();
    expect(added!.milk).toBeNull();
  });
});

describe('changing quantities', () => {
  it('inc bumps a single line', () => {
    const k = keyOf('croissant');
    s().inc(k);
    expect(qtyOf(k)).toBe(3);
  });

  it('inc on a key that is not there is a no-op', () => {
    const before = JSON.stringify(s().ticket.items);
    s().inc('nope');
    expect(JSON.stringify(s().ticket.items)).toBe(before);
  });

  it('dec reduces the quantity', () => {
    const k = keyOf('croissant');
    s().dec(k);
    expect(qtyOf(k)).toBe(1);
  });

  it('dec to zero removes an unsent line outright', () => {
    const k = keyOf('croissant');
    s().dec(k);
    s().dec(k);
    expect(keysOf()).not.toContain(k);
    expect(s().voidOpen).toBe(false);
  });

  /*
   * Anything already sent to the kitchen has been made. Removing it is a void,
   * which needs a reason — it must not just disappear off the ticket.
   */
  it('removing a sent line opens the void dialog instead of deleting it', () => {
    const k = keyOf('avotoast', null, null, [], 'No chili flakes', 1);
    expect(s().ticket.items.find((x) => x.key === k)!.sent).toBe(true);
    s().dec(k);
    expect(s().voidOpen).toBe(true);
    expect(s().voidKey).toBe(k);
    expect(keysOf()).toContain(k);
  });

  it('removeKey deletes an unsent line and routes a sent one to the void dialog', () => {
    const unsent = keyOf('croissant');
    s().removeKey(unsent);
    expect(keysOf()).not.toContain(unsent);

    const sent = keyOf('flatwhite', 'M', 'Oat', [], '', 1);
    s().removeKey(sent);
    expect(s().voidOpen).toBe(true);
    expect(keysOf()).toContain(sent);
  });

  it('a void needs the word VOID typed to go through', () => {
    const k = keyOf('flatwhite', 'M', 'Oat', [], '', 1);
    s().openVoid(k);
    s().setVoidText('yes');
    s().confirmVoid();
    expect(keysOf()).toContain(k);

    s().setVoidText('void');
    s().confirmVoid();
    expect(keysOf()).not.toContain(k);
    expect(s().voidOpen).toBe(false);
  });
});

describe('sending to the kitchen', () => {
  it('marks the unsent lines sent', () => {
    s().send();
    expect(s().ticket.items.every((x) => x.sent)).toBe(true);
  });

  it('a ticket with nothing on the board yet gets its own card', () => {
    s().openTable(TABLES.find((t) => t.label === 'W3')!);
    const board = s().kds.length;
    s().tapTile('soup');
    s().send();
    expect(s().kds.length).toBe(board + 1);
    const order = s().kds.find((o) => o.number === s().ticket.number)!;
    expect(order.table).toBe('W3');
    expect(order.status).toBe('new');
    expect(order.items.map((i) => i.n)).toContain('Soup of the Day');
  });

  it('carries the modifiers and the note through to the kitchen', () => {
    s().openTable(TABLES.find((t) => t.label === 'W3')!);
    s().tapTile('latte');
    s().setSheetMilk('Oat');
    s().setSheetNote('extra hot');
    s().sheetAdd();
    s().send();
    const row = s().kds.find((o) => o.number === s().ticket.number)!.items[0];
    expect(row.m).toContain('Oat milk');
    expect(row.m).toContain('extra hot');
  });

  it('sending again with nothing new does not duplicate the order', () => {
    s().send();
    const after = s().kds.length;
    s().send();
    expect(s().kds.length).toBe(after);
  });

  it('a second course joins the ticket’s existing card', () => {
    s().send();
    const board = s().kds.length;
    s().tapTile('soup');
    s().send();
    expect(s().kds.length).toBe(board);
    const order = s().kds.find((o) => o.number === s().ticket.number)!;
    expect(order.items.map((i) => i.n)).toContain('Soup of the Day');
  });

  it('a second course puts an already-cooking ticket back in the queue', () => {
    s().send();
    const n = s().ticket.number;
    s().bumpK(n);
    expect(s().kds.find((o) => o.number === n)!.status).toBe('cooking');
    s().tapTile('soup');
    s().send();
    expect(s().kds.find((o) => o.number === n)!.status).toBe('new');
  });

  it('the kitchen bumps new -> cooking -> ready -> off the board', () => {
    const n = s().kds[0].number;
    expect(s().kds.find((o) => o.number === n)!.status).toBe('new');
    s().bumpK(n);
    expect(s().kds.find((o) => o.number === n)!.status).toBe('cooking');
    s().bumpK(n);
    expect(s().kds.find((o) => o.number === n)!.status).toBe('ready');
    s().bumpK(n);
    expect(s().kds.find((o) => o.number === n)).toBeUndefined();
  });
});

describe('holding and resuming', () => {
  it('an empty ticket cannot be held', () => {
    s().emptyTicket();
    const before = s().held.length;
    s().hold();
    expect(s().held.length).toBe(before);
  });

  it('holding parks the ticket and starts a fresh one', () => {
    const n = s().ticket.number;
    const held = s().held.length;
    s().hold();
    expect(s().held.length).toBe(held + 1);
    expect(s().held.some((h) => h.number === n)).toBe(true);
    expect(s().ticket.items).toEqual([]);
    expect(s().ticket.number).not.toBe(n);
  });

  it('resuming swaps the parked ticket back in and parks the current one', () => {
    const cur = s().ticket.number;
    s().resumeHeld(1041);
    expect(s().ticket.number).toBe(1041);
    expect(s().held.some((h) => h.number === cur)).toBe(true);
    expect(s().held.some((h) => h.number === 1041)).toBe(false);
  });

  it('resuming while the register is empty does not park an empty ticket', () => {
    s().emptyTicket();
    s().resumeHeld(1041);
    expect(s().held.every((h) => h.items.length > 0)).toBe(true);
  });

  it('resuming a number that is not parked is a no-op', () => {
    const before = JSON.stringify({ t: s().ticket.number, h: s().held.map((x) => x.number) });
    s().resumeHeld(999999);
    expect(JSON.stringify({ t: s().ticket.number, h: s().held.map((x) => x.number) })).toBe(before);
  });

  /*
   * Every open ticket needs its own number: the held tray, the kitchen board
   * and the receipt all address tickets by it.
   */
  it('a fresh ticket never reuses a number that is still open', () => {
    s().hold();
    const all = [s().ticket.number, ...s().held.map((h) => h.number)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('and still does not after a sale closes', () => {
    s().resumeHeld(1041);
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    s().newOrder();
    const all = [s().ticket.number, ...s().held.map((h) => h.number)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('moving and merging', () => {
  it('moving relabels the ticket', () => {
    s().openMove();
    s().doMove('W3');
    expect(s().ticket.table).toBe('W3');
    expect(s().moveOpen).toBe(false);
  });

  it('merging pulls a held ticket in and takes it off the tray', () => {
    const before = subtotal(s());
    const heldSub = s().held.find((h) => h.number === 1039)!;
    s().doMerge(1039);
    expect(s().held.some((h) => h.number === 1039)).toBe(false);
    expect(subtotal(s())).toBeGreaterThan(before);
    expect(s().ticket.items.length).toBeGreaterThanOrEqual(heldSub.items.length);
  });

  /*
   * Both the seeded ticket and held #1041 hold a plain Croissant. A concat
   * produced two rows with the same key: a duplicate React key, and `inc`
   * hitting both at once so the quantity climbed in twos.
   */
  it('merging never leaves two lines with the same key', () => {
    s().doMerge(1041);
    const k = keysOf();
    expect(new Set(k).size).toBe(k.length);
  });

  it('merging adds the quantities of identical lines', () => {
    const k = keyOf('croissant');
    expect(qtyOf(k)).toBe(2); // ticket
    s().doMerge(1041); // held #1041 has 1 more
    expect(qtyOf(k)).toBe(3);
  });

  it('a merged line counts as sent only if both sides were', () => {
    const k = keyOf('croissant');
    // seeded ticket croissant is unsent, held #1041's is unsent too
    s().doMerge(1041);
    expect(s().ticket.items.find((x) => x.key === k)!.sent).toBe(false);
  });

  it('merging a number that is not parked closes the dialog and changes nothing', () => {
    s().openMove();
    const before = JSON.stringify(s().ticket.items);
    s().doMerge(999999);
    expect(s().moveOpen).toBe(false);
    expect(JSON.stringify(s().ticket.items)).toBe(before);
  });
});

describe('discounts across tickets', () => {
  it('a comp zeroes the ticket', () => {
    s().applyDiscount('comp', 0, 'On the house');
    expect(total(s())).toBe(0);
  });

  /*
   * The worst defect in this app: the discount lived on the register, not on
   * the ticket, and nothing cleared it. One comp and every subsequent customer
   * was rung up free until a human noticed.
   */
  it('does not survive the sale it was applied to', () => {
    s().applyDiscount('comp', 0, 'On the house');
    usePos.setState({ payMethod: 'cash', cash: '5' });
    s().onCharge();
    expect(s().view).toBe('complete');
    s().newOrder();
    expect(s().discount).toBeNull();
    expect(total(s())).toBe(0); // empty ticket, but for the right reason
    s().tapTile('soup');
    expect(total(s())).toBeGreaterThan(0);
  });

  it('does not follow the register onto a held-then-new ticket', () => {
    s().applyDiscount('pct', 20, '20% off');
    s().hold();
    expect(s().discount).toBeNull();
  });

  it('does not follow the register onto a resumed ticket', () => {
    s().applyDiscount('pct', 20, '20% off');
    s().resumeHeld(1041);
    expect(s().discount).toBeNull();
  });

  it('does not follow the register onto a newly seated table', () => {
    s().applyDiscount('pct', 20, '20% off');
    s().openTable(TABLES.find((t) => t.label === 'W3')!);
    expect(s().discount).toBeNull();
  });

  it('is recorded on the sale so the receipt can print it', () => {
    s().applyDiscount('pct', 20, '20% off');
    const expected = subtotal(s()) * 0.2;
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    const sale = s().lastSale!;
    expect(sale.discount).toBeCloseTo(expected, 2);
    expect(sale.discountLabel).toBe('20% off');
  });

  it('a sale with no discount records zero, not a stray label', () => {
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    expect(s().lastSale!.discount).toBe(0);
    expect(s().lastSale!.discountLabel).toBe('');
  });

  it('the receipt rows add up to the receipt total', () => {
    s().applyDiscount('pct', 15, '15% off');
    usePos.setState({ payMethod: 'cash', cash: '999', tip: 2 });
    s().onCharge();
    const r = s().lastSale!;
    expect(Math.round((r.subtotal - r.discount + r.tax + r.tip) * 100) / 100).toBe(r.total);
  });

  it('clearing a discount restores the full price', () => {
    const before = total(s());
    s().applyDiscount('pct', 20, '20% off');
    expect(total(s())).toBeLessThan(before);
    s().clearDiscount();
    expect(total(s())).toBe(before);
  });
});

describe('taking payment', () => {
  it('the payment screen refuses an empty ticket', () => {
    s().emptyTicket();
    s().openPay();
    expect(s().view).not.toBe('payment');
  });

  it('cash covering the balance closes the sale and returns the change', () => {
    s().openPay();
    const due = remaining(s());
    usePos.setState({ payMethod: 'cash', cash: '50' });
    s().onCharge();
    expect(s().view).toBe('complete');
    expect(s().lastSale!.change).toBeCloseTo(50 - due, 2);
  });

  it('exact cash leaves no change', () => {
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: String(remaining(s())) });
    s().onCharge();
    expect(s().lastSale!.change).toBe(0);
  });

  it('cash short of the balance is a partial payment, not a sale', () => {
    s().openPay();
    const due = remaining(s());
    usePos.setState({ payMethod: 'cash', cash: '5' });
    s().onCharge();
    expect(s().view).toBe('payment');
    expect(s().splits.length).toBe(1);
    expect(remaining(s())).toBeCloseTo(due - 5, 2);
  });

  it('zero cash tendered does nothing', () => {
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '0' });
    s().onCharge();
    expect(s().splits).toEqual([]);
    expect(s().view).toBe('payment');
  });

  it('a wallet payment settles the balance', () => {
    s().openPay();
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    expect(s().view).toBe('complete');
  });

  it('a card is read, approved, and settles the balance', () => {
    vi.useFakeTimers();
    s().openPay();
    usePos.setState({ payMethod: 'card' });
    s().onCharge();
    expect(s().card).toBe('reading');
    vi.runAllTimers();
    expect(s().view).toBe('complete');
  });

  it('a declined card leaves the ticket open and payable again', () => {
    vi.useFakeTimers();
    s().openPay();
    usePos.setState({ payMethod: 'card', declined: true });
    s().onCharge();
    vi.runAllTimers();
    expect(s().card).toBe('declined');
    expect(s().view).toBe('payment');
    expect(s().splits).toEqual([]);
  });

  it('the cash pad rejects a second decimal point and over-long entries', () => {
    s().cashPush('1');
    s().cashPush('.');
    s().cashPush('5');
    s().cashPush('.');
    expect(s().cash).toBe('1.5');
    s().cashPush('0');
    s().cashPush('0'); // a third decimal
    expect(s().cash).toBe('1.50');
  });

  it('an even split collects the whole balance across the payers', () => {
    s().openPay();
    const due = remaining(s());
    s().setSplitN(3);
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    expect(s().view).toBe('payment');
    s().onCharge();
    expect(s().view).toBe('payment');
    s().onCharge();
    expect(s().view).toBe('complete');
    const collected = s().lastSale!.splits.reduce((a, x) => a + x.amount, 0);
    expect(Math.round(collected * 100) / 100).toBe(due);
  });

  it('the sale records what was actually collected', () => {
    s().openPay();
    const due = remaining(s());
    usePos.setState({ payMethod: 'cash', cash: '5' });
    s().onCharge();
    usePos.setState({ cash: '999' });
    s().onCharge();
    const sale = s().lastSale!;
    expect(sale.splits.length).toBe(2);
    expect(Math.round(sale.splits.reduce((a, x) => a + x.amount, 0) * 100) / 100).toBe(due);
    expect(sale.total).toBe(due);
  });

  it('a completed sale clears the payment scratch state', () => {
    s().openPay();
    s().setSplitN(2);
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge(); // first share
    expect(s().view).toBe('payment');
    usePos.setState({ cash: '999' });
    s().onCharge(); // second share closes it
    expect(s().view).toBe('complete');
    expect(s().splits).toEqual([]);
    expect(s().cash).toBe('');
    expect(s().splitMode).toBe('none');
    expect(s().splitN).toBe(0);
  });
});

describe('a paid ticket is closed', () => {
  /*
   * The sold ticket used to stay on the register in full. Walking back from the
   * receipt and pressing Pay charged the same items again and wrote a second
   * Sale under the same order number.
   */
  it('the register is empty again after a sale', () => {
    const n = s().ticket.number;
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    expect(s().ticket.items).toEqual([]);
    expect(s().ticket.number).not.toBe(n);
  });

  it('the same ticket cannot be charged twice', () => {
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    const first = s().lastSale!;
    usePos.setState({ view: 'register' });
    s().openPay();
    expect(s().view).not.toBe('payment'); // nothing left to pay for
    expect(s().lastSale!.number).toBe(first.number);
  });

  it('the receipt still has the sale it was rung up from', () => {
    const n = s().ticket.number;
    const due = total(s());
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge();
    expect(s().lastSale!.number).toBe(n);
    expect(s().lastSale!.total).toBe(due);
    expect(s().lastSale!.items.length).toBeGreaterThan(0);
  });
});

describe('an interrupted payment', () => {
  /*
   * Stepping back to the ticket to add a forgotten item and pressing Pay again
   * used to reset `splits: []` — every payment already collected vanished and
   * the guest who had handed over cash was asked for the full amount again.
   */
  it('keeps money already collected when you return to the payment screen', () => {
    s().openPay();
    const due = remaining(s());
    usePos.setState({ payMethod: 'cash', cash: '5' });
    s().onCharge();
    expect(s().splits.length).toBe(1);

    usePos.setState({ view: 'register' }); // "Ticket" back button
    s().openPay();
    expect(s().splits.length).toBe(1);
    expect(remaining(s())).toBeCloseTo(due - 5, 2);
  });

  it('a fresh ticket does start from a clean payment screen', () => {
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '999' });
    s().onCharge(); // closes it, mints a fresh ticket
    s().tapTile('soup');
    s().openPay();
    expect(s().splits).toEqual([]);
    expect(s().splitMode).toBe('none');
  });

  /*
   * The card reader is two chained timers. They used to fire regardless of
   * where the user had navigated to, finalising a sale and yanking the view to
   * the receipt from whatever screen they were on.
   */
  it('a card charge abandoned mid-read does not finalise behind you', () => {
    vi.useFakeTimers();
    s().openPay();
    usePos.setState({ payMethod: 'card' });
    s().onCharge();
    expect(s().card).toBe('reading');
    usePos.setState({ view: 'kitchen' }); // walk away
    vi.runAllTimers();
    expect(s().view).toBe('kitchen');
    expect(s().lastSale).toBeNull();
    expect(s().splits).toEqual([]);
  });

  it('switching off Card mid-read does not charge the card', () => {
    vi.useFakeTimers();
    s().openPay();
    usePos.setState({ payMethod: 'card' });
    s().onCharge();
    s().setMethod('cash');
    vi.runAllTimers();
    expect(s().splits).toEqual([]);
    expect(s().view).toBe('payment');
  });

  it('a part-paid "by amount" split does not leave a stale $0.00 badge', () => {
    s().openPay();
    s().setSplitFraction(0.5);
    expect(s().splitMode).toBe('amount');
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    expect(s().view).toBe('payment');
    // the custom amount has been consumed, so the mode goes with it
    expect(s().splitMode).toBe('none');
    expect(s().splitCustom).toBe('');
  });

  it('an even split stays in force between payers', () => {
    s().openPay();
    s().setSplitN(3);
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    expect(s().splitMode).toBe('even');
    expect(s().splitN).toBe(3);
  });
});

describe('service mode', () => {
  it('retail has no floor plan to sit on', () => {
    usePos.setState({ view: 'floor' });
    s().setMode('retail');
    expect(s().view).toBe('register');
  });

  it('a retail ticket is a walk-in sale, not a table', () => {
    s().setMode('retail');
    s().hold();
    expect(s().ticket.table).toBe('—');
  });
});

describe('the floor plan', () => {
  it('tapping the table the open ticket is on returns to that ticket', () => {
    const cur = TABLES.find((t) => t.label === s().ticket.table)!;
    const n = s().ticket.number;
    s().openTable(cur);
    expect(s().view).toBe('register');
    expect(s().ticket.number).toBe(n);
  });

  it('seating another table parks the open ticket and starts a new one', () => {
    const n = s().ticket.number;
    s().openTable(TABLES.find((t) => t.label === 'W3')!);
    expect(s().ticket.table).toBe('W3');
    expect(s().ticket.items).toEqual([]);
    expect(s().held.some((h) => h.number === n)).toBe(true);
    expect(s().ticket.number).not.toBe(n);
  });
});
