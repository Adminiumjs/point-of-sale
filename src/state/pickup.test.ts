/**
 * PICKUP (wave 2, 55-T71): a ticket becomes an order someone collects — its
 * customer found by their number or made — and moves Queued → Making → Ready
 * → handed off, each step saved on the ticket; a paid order still waits.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { applyFrame } from './live';
import { memorySink, type MemorySink } from '../data/sink';
import { demoMembers } from '../data/loyalty';
import { usePos } from './store';
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
const ticketPatches = () => sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'update').map((c) => c.values);

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, pickups: [] });
});

describe('taking an order for pickup', () => {
  it('needs something on the ticket first', () => {
    s().setPickupSheet(true);
    expect(s().pickupSheetOpen).toBe(false);
  });

  it('makes the caller a customer, queues the order and saves it on the ticket', async () => {
    s().tapTile('coldbrew');
    await s().markPickup({ name: 'Tomas R.', mobile: '+1 415 555 0199', channel: 'phone' });
    await settled();
    expect(sink.calls.find((c) => c.ref === 'customers')?.values).toEqual({ name: 'Tomas R.', mobile: '+1 415 555 0199', email: null });
    const customerId = s().ticket.customerId!;
    expect(customerId).not.toMatch(/^tmp:/);
    expect(ticketPatches()).toContainEqual(expect.objectContaining({ channel: 'phone', pickup_stage: 'queued' }));
    // Called by Adminium's number, not the till's provisional one.
    expect(ticketPatches()).toContainEqual({ pickup_code: '2001' });
    expect(ticketPatches().some((p) => p?.['pickup_code'] === '1')).toBe(false);
    expect(s().pickups).toEqual([expect.objectContaining({ number: 2001, name: 'Tomas R.', channel: 'phone', stage: 'queued' })]);
  });

  it('uses the member a number already belongs to', async () => {
    usePos.setState({ members: { dana: demoMembers()[0]! } });
    s().tapTile('croissant');
    await s().markPickup({ name: 'Dana', mobile: '(415) 555-0132', channel: 'till' });
    await settled();
    expect(sink.calls.some((c) => c.ref === 'customers')).toBe(false);
    expect(ticketPatches()).toContainEqual(expect.objectContaining({ customer_id: 'dana', channel: 'till' }));
  });
});

describe('the queue', () => {
  it('moves an order on, stamping when it is ready and when they were told, and hands it off', async () => {
    s().tapTile('coldbrew');
    await s().markPickup({ name: 'Wei', mobile: '', channel: 'till' });
    const rid = s().pickups[0]!.rid;
    s().advancePickup(rid);
    expect(s().pickups[0]!.stage).toBe('making');
    s().notifyPickup(rid); // not ready yet: nothing
    s().advancePickup(rid);
    expect(s().pickups[0]).toMatchObject({ stage: 'ready', readyAt: expect.any(Number) });
    s().notifyPickup(rid);
    expect(s().pickups[0]!.notifiedAt).toEqual(expect.any(Number));
    s().advancePickup(rid);
    expect(s().pickups).toEqual([]);
    await settled();
    expect(ticketPatches().slice(-4)).toEqual([
      { pickup_stage: 'making' },
      { pickup_stage: 'ready', ready_at: expect.any(String) },
      { notified_at: expect.any(String) },
      { pickup_stage: 'collected' },
    ]);
  });

  it('keeps a paid order waiting, with the lines it was sold with', async () => {
    s().tapTile('bowl');
    await s().markPickup({ name: 'Priya', mobile: '', channel: 'till' });
    s().openPay();
    usePos.setState({ payMethod: 'qr', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('complete');
    expect(s().pickups).toEqual([expect.objectContaining({ name: 'Priya', stage: 'queued', items: ['Breakfast Bowl'] })]);
  });

  it('follows another till: a new order joins, a collected one leaves', () => {
    applyFrame({ table: 'tickets', kind: 'record.update', id: '77', row: { number: '1077', pickup_stage: 'ready', channel: 'phone', status: 'paid', opened_at: '2026-09-23T10:00:00Z' } });
    expect(s().pickups).toEqual([expect.objectContaining({ rid: '77', number: 1077, stage: 'ready', channel: 'phone' })]);
    applyFrame({ table: 'tickets', kind: 'record.update', id: '77', row: { number: '1077', pickup_stage: 'collected', status: 'paid' } });
    expect(s().pickups).toEqual([]);
  });
});
