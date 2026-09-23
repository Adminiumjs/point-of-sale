/**
 * THE TILL'S OWN SCREENS SAVE WHAT THEY DO — Refund, Close shift, Staff & time
 * clock, 86 and Reservations (plan §3.6), action by action.
 *
 * As in store-writes.test.ts, the outbox sits on a fresh memory sink, so what
 * reached "the server" is read back: the table, the operation, the values.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { SinkError, memorySink, type MemorySink } from '../data/sink';
import type { PastSale, Reservation, TableInfo } from '../data/types';
import { expectedDrawer, refundMoney, usePos } from './store';
import { outbox, setSink } from './writes';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
let sink: MemorySink;

const settled = async () => {
  for (let i = 0; i < 20; i += 1) {
    await outbox().idle();
    await Promise.resolve();
  }
};

const table = (label: string, seats: number, status: TableInfo['status'] = 'open', id?: string): TableInfo => ({
  ...(id === undefined ? {} : { id }),
  zone: 'Main',
  label,
  seats,
  status,
});
const booking = (id: string, at: number, party: number, fields: Partial<Reservation> = {}): Reservation => ({
  id,
  code: `MR-${id.toUpperCase().padStart(4, '0')}`,
  name: `Guest ${id}`,
  mobile: '+1 415 555 0100',
  email: null,
  partySize: party,
  startsAt: at,
  status: 'confirmed',
  channel: 'online',
  tableId: null,
  occasion: null,
  request: null,
  note: null,
  ...fields,
});
/** Seven tonight, in the device's own zone (the demo has no venue zone). */
const tonight = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d.getTime();
})();

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null });
});

describe('86 / Menu', () => {
  it('switches an item off and on, on its own row, and the register follows', async () => {
    s().toggle86('croissant');
    expect(s().unavail).toContain('croissant');
    s().tapTile('croissant');
    expect(s().ticket.items).toEqual([]);
    s().toggle86('croissant');
    await settled();
    expect(sink.calls.map((c) => [c.op, c.ref, c.id, c.values])).toEqual([
      ['update', 'menu_items', 'croissant', { available: false }],
      ['update', 'menu_items', 'croissant', { available: true }],
    ]);
    expect(s().unavail).not.toContain('croissant');
  });

  it('starts from what the menu says is off, not a list of its own', () => {
    expect(INITIAL.unavail).toEqual(['almond']);
  });

  it('puts the switch back when the server refuses', async () => {
    sink.failNext(new SinkError('No.', 'refused', 403, 'FORBIDDEN'));
    s().toggle86('banana');
    await settled();
    expect(s().unavail).not.toContain('banana');
    expect(s().toast?.kind).toBe('error');
  });
});

describe('Staff & time clock', () => {
  it('clocks in with a new row and out on the same row', async () => {
    expect(s().clock.some((c) => c.staffId === 'jordan')).toBe(false);
    s().clockIn('jordan');
    expect(s().clock.some((c) => c.staffId === 'jordan')).toBe(true);
    s().clockOut('jordan');
    await settled();
    expect(sink.calls.map((c) => `${c.op} ${c.ref}`)).toEqual(['insert time_clock', 'update time_clock']);
    expect(sink.calls[0]!.values).toMatchObject({ staff_id: 'jordan', clock_in: expect.any(String) });
    // The clock-out names the row the clock-in made.
    expect(sink.calls[1]!.id).toBe(sink.rows.get('time_clock')![0]!['id']);
    expect(sink.calls[1]!.values).toEqual({ clock_out: expect.any(String) });
    expect(s().clockedOutAt['jordan']).toEqual(expect.any(Number));
  });

  it('adds a staff member, on the roster under their row’s key', async () => {
    const ok = await s().addStaff({ name: '  Robin  Park ', role: 'Barista', email: 'robin@example.com' });
    expect(ok).toBe(true);
    expect(sink.calls[0]).toMatchObject({ op: 'insert', ref: 'staff', values: { name: 'Robin  Park', initials: 'RP', role: 'Barista', email: 'robin@example.com', active: true } });
    expect(s().roster.at(-1)).toMatchObject({ id: String(sink.rows.get('staff')![0]!['id']), name: 'Robin  Park' });
  });

  it('deactivates rather than deletes, clocking them out first', async () => {
    s().deactivateStaff('sam');
    await settled();
    expect(sink.calls.map((c) => `${c.op} ${c.ref}`)).not.toContain('remove staff');
    expect(sink.calls.at(-1)).toMatchObject({ op: 'update', ref: 'staff', id: 'sam', values: { active: false } });
    expect(s().roster.map((p) => p.id)).not.toContain('sam');
    expect(s().clock.map((c) => c.staffId)).not.toContain('sam');
  });
});

describe('Refund', () => {
  const sale: PastSale = {
    rid: '77',
    number: 1035,
    table: 'P3',
    closedAt: 0,
    method: 'card',
    lines: [
      { rid: '701', name: 'Breakfast Bowl', qty: 2, unit: 12, line: 24, mod: '', refunded: 0 },
      { rid: '702', name: 'Fresh OJ', qty: 2, unit: 5.5, line: 11, mod: '', refunded: 0 },
    ],
    subtotal: 35,
    discount: 0,
    tax: 2.89,
    total: 37.89,
    refunded: 0,
  };

  it('gives back the chosen lines, in one write with their items, and only says so once saved', async () => {
    s().openRefund();
    s().pickRefundSale(sale);
    expect(s().refundSel).toEqual([0, 1]);
    s().toggleRefundLine(1);
    s().setRefundMethod('cash');
    const done = s().processRefund();
    expect(s().refundDone).toBeNull();
    await done;
    const [call] = sink.calls;
    expect(call).toMatchObject({ op: 'insert', ref: 'refunds' });
    expect(call!.values).toMatchObject({ ticket_id: '77', method: 'cash', amount: 25.98, tax: 1.98 });
    expect(call!.children).toEqual([{ ref: 'refund_items', via: 'refund_id', rows: [{ id: expect.any(String), ticket_item_id: '701', qty: 2 }] }]);
    expect(s().refundDone).toEqual({ total: 25.98, count: 1 });
    // The shift's takings and the drawer both know.
    expect(s().shiftTotals.refunds).toBeCloseTo(INITIAL.shiftTotals.refunds + 25.98, 2);
    expect(expectedDrawer(s())).toBeCloseTo(expectedDrawer(INITIAL) - 25.98, 2);
  });

  it('never gives the same line back twice', async () => {
    s().openRefund();
    s().pickRefundSale(sale);
    await s().processRefund();
    const after = s().sales.find((x) => x.number === 1035)!;
    expect(after.lines.every((l) => l.refunded === l.qty)).toBe(true);
    s().pickRefundSale(after);
    expect(s().refundSel).toEqual([]);
    s().toggleRefundLine(0);
    expect(s().refundSel).toEqual([]);
  });

  it('shares a discount out over the lines, and never gives back more than is left', () => {
    const discounted = { ...sale, discount: 3.5, total: 34.14 };
    // Half the goods, less their half of the 10% off, plus the tax on that.
    expect(refundMoney(discounted, [0])).toEqual({ sub: 21.6, tax: 1.78, total: 23.38 });
    expect(refundMoney({ ...discounted, refunded: 30 }, [0, 1]).total).toBe(4.14);
  });

  it('keeps the refund unissued when the server refuses it', async () => {
    sink.failNext(new SinkError('No.', 'refused', 422, 'VALIDATION_FAILED', 'amount'));
    s().openRefund();
    s().pickRefundSale(sale);
    await s().processRefund();
    expect(s().refundDone).toBeNull();
    expect(s().shiftTotals.refunds).toBe(INITIAL.shiftTotals.refunds);
  });
});

describe('Close shift', () => {
  it('starts the count at what the drawer should hold, and records the count, the expectation and the difference', async () => {
    usePos.setState({ shiftRid: '81', drawer: 200 });
    s().openShiftClose();
    const expected = expectedDrawer(s());
    expect(s().closeCount).toBe(expected);
    s().closeCountAdj(-5);
    s().closeCountAdj(1);
    await s().finishShift();
    expect(sink.calls[0]).toMatchObject({ op: 'update', ref: 'shifts' });
    expect(sink.calls[0]!.values).toMatchObject({ counted_cash: expected - 4, expected_cash: expected, over_short: -4, ended_at: expect.any(String) });
    expect(s().view).toBe('login');
    expect(s().shiftRid).toBeNull();
  });

  it('stays open when the count cannot be saved', async () => {
    usePos.setState({ shiftRid: '81' });
    sink.failNext(new SinkError('No.', 'refused', 403, 'FORBIDDEN'));
    s().openShiftClose();
    await s().finishShift();
    expect(s().view).toBe('shiftclose');
    expect(s().shiftRid).toBe('81');
  });

  it('opens the next shift from nothing', () => {
    usePos.setState({ shiftRid: null });
    s().openShift();
    expect(s().shiftTotals).toEqual({ orders: 0, gross: 0, card: 0, cash: 0, qr: 0, gift: 0, tips: 0, refunds: 0, cashRefunds: 0, comps: 0 });
  });

  it('adds each sale to the shift as it closes', async () => {
    s().tapTile('croissant');
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '20', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().shiftTotals.orders).toBe(INITIAL.shiftTotals.orders + 1);
    expect(s().shiftTotals.cash).toBeCloseTo(INITIAL.shiftTotals.cash + 4.11, 2);
    expect(s().sales[0]).toMatchObject({ number: 2001, method: 'cash', total: 4.11 });
  });
});

describe('Reservations', () => {
  beforeEach(() => {
    usePos.setState({
      floor: [table('B1', 1), table('T2', 2, 'open', '42'), table('T4', 4, 'open', '44'), table('T6', 6, 'occupied', '46')],
      reservations: [booking('a', tonight, 3), booking('b', tonight, 8), booking('c', tonight, 2, { status: 'cancelled' })],
    });
  });

  it('seats a party at the snuggest free table that fits, on a fresh ticket that names the booking', async () => {
    s().tapTile('croissant');
    s().seatResv('a');
    expect(s().ticket).toMatchObject({ table: 'T4', seats: 3, reservationId: 'a', items: [] });
    // What was on the register waits on the tray.
    expect(s().held).toHaveLength(1);
    expect(s().floor.find((x) => x.label === 'T4')!.status).toBe('occupied');
    await settled();
    const resv = sink.calls.find((c) => c.ref === 'reservations')!;
    expect(resv).toMatchObject({ op: 'update', id: 'a', values: { status: 'seated', table_id: 44, seated_at: expect.any(String) } });
    expect(sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'insert').at(-1)!.values).toMatchObject({ reservation_id: 'a', guests: 3 });
  });

  it('never puts a party where it does not fit', () => {
    usePos.setState({ reservations: [booking('b', tonight, 8)] });
    s().seatResv('b');
    expect(s().view).not.toBe('register');
    expect(s().toast).toMatchObject({ kind: 'error' });
  });

  it('marks a no-show, cancels, and reinstates only while the slot has room', async () => {
    usePos.setState({ reservations: [booking('a', tonight, 3), booking('c', tonight, 2, { status: 'cancelled' }), booking('d', tonight, 8)] });
    s().setResvStatus('a', 'no_show');
    // Twelve covers: 8 booked, 2 more fit.
    s().setResvStatus('c', 'confirmed');
    expect(s().reservations.find((r) => r.id === 'c')!.status).toBe('confirmed');
    s().setResvStatus('a', 'confirmed');
    expect(s().reservations.find((r) => r.id === 'a')!.status).toBe('no_show');
    expect(s().toast?.msg).toMatch(/full/);
    await settled();
    expect(sink.calls.map((c) => c.values)).toEqual([{ status: 'no_show' }, { status: 'confirmed' }]);
  });

  it('keeps the staff note apart from the guest’s request', async () => {
    usePos.setState({ reservations: [booking('a', tonight, 3, { request: 'Window, please' })] });
    s().saveResvNote('a', '  VIP  ');
    await settled();
    expect(sink.calls[0]!.values).toEqual({ staff_note: 'VIP' });
    expect(s().reservations[0]).toMatchObject({ note: 'VIP', request: 'Window, please' });
  });

  it('takes a phone booking through the same capacity check, and keeps the code it is given', async () => {
    expect(s().createResv({ name: 'Ada', mobile: '+1 415 555 0101', party: 4, startsAt: tonight, note: '' })).toBe(false);
    expect(s().toast?.msg).toMatch(/full/);
    expect(s().createResv({ name: 'Ada', mobile: '+1 415 555 0101', party: 1, startsAt: tonight, note: 'Allergy: nuts' })).toBe(true);
    await settled();
    expect(sink.calls[0]).toMatchObject({ op: 'insert', ref: 'reservations', values: { name: 'Ada', party_size: 1, channel: 'phone', status: 'confirmed', staff_note: 'Allergy: nuts' } });
    const added = s().reservations.find((r) => r.name === 'Ada')!;
    expect(added.id).toBe(String(sink.rows.get('reservations')![0]!['id']));
    expect(added.code).toMatch(/^MR-[0-9A-Z]{4}$/);
  });

  it('takes the booking back off when Adminium says the slot filled up meanwhile', async () => {
    sink.failNext(new SinkError('That time is full.', 'refused', 409, 'CAPACITY_FULL'));
    usePos.setState({ reservations: [] });
    s().createResv({ name: 'Ada', mobile: '+1 415 555 0101', party: 2, startsAt: tonight, note: '' });
    expect(s().reservations).toHaveLength(1);
    await settled();
    expect(s().reservations).toEqual([]);
    expect(s().toast?.msg).toMatch(/full/);
  });
});

describe('§0.6 — the floor, the discount, the tip', () => {
  it('an occupied table opens ITS ticket from the tray, never a second one', () => {
    const tray = [{ number: 1040, rid: '40', table: 'P1', at: 0, seats: 4, items: [] }];
    usePos.setState({ floor: [table('P1', 4, 'occupied', '41'), table('W3', 2)], held: tray });
    s().openTable(s().floor[0]!);
    expect(s().ticket).toMatchObject({ number: 1040, table: 'P1' });
    expect(s().held.map((h) => h.number)).not.toContain(1040);
  });

  it('an occupied table whose ticket is not on this till opens nothing', () => {
    usePos.setState({ floor: [table('P2', 4, 'occupied', '42')], held: [] });
    const before = s().ticket;
    s().openTable(s().floor[0]!);
    expect(s().ticket).toBe(before);
    expect(s().toast?.msg).toMatch(/isn’t on this till/);
  });

  it('records the reason chosen for a discount, and the receipt keeps its label', async () => {
    s().tapTile('croissant');
    s().applyDiscount('pct', 10, '10% off', 'Service recovery');
    await settled();
    expect(sink.calls.at(-1)!.values).toEqual({ discount_kind: 'percent', discount_value: 10, discount_reason: 'Service recovery' });
    expect(s().discount?.label).toBe('10% off');
  });

  it('chooses no tip for the guest (the comp preselected 15%)', () => {
    expect(INITIAL.tip).toBe(0);
    s().tapTile('croissant');
    s().openPay();
    expect(s().tip).toBe(0);
  });
});
