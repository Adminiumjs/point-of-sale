import { describe, expect, it, vi } from 'vitest';

import { SinkError, memorySink } from '../data/sink';
import { createOutbox, isTemp } from './outbox';

const refused = () => new SinkError('Some values were refused.', 'refused', 422, 'VALIDATION_FAILED', 'qty');
const offline = () => new SinkError('Failed to fetch', 'offline', 0, 'NETWORK');

describe('the outbox', () => {
  it('says which tables still have a row of its own the server has not answered for', async () => {
    const box = createOutbox(memorySink());
    const line = box.insert('t1', 'ticket_items', { qty: 1 }, { children: [{ ref: 'ticket_item_modifiers', via: 'ticket_item_id', rows: [{ modifier_id: 3 }] }] });
    expect([box.unanswered('ticket_items'), box.unanswered('ticket_item_modifiers'), box.unanswered('tickets')]).toEqual([true, true, false]);
    await line;
    expect([box.unanswered('ticket_items'), box.unanswered('ticket_item_modifiers')]).toEqual([false, false]);
  });

  it('saves a ticket before its line, and sends the line with the ticket’s real key', async () => {
    const sink = memorySink();
    const box = createOutbox(sink);
    const ticket = box.temp();
    expect(isTemp(ticket)).toBe(true);
    void box.insert(ticket, 'tickets', { status: 'open' }, { temp: ticket });
    const line = box.temp();
    void box.insert(ticket, 'ticket_items', { ticket_id: ticket, qty: 1 }, { temp: line });
    await box.update(ticket, 'ticket_items', line, { qty: 2 });

    expect(sink.calls.map((c) => [c.op, c.ref])).toEqual([
      ['insert', 'tickets'],
      ['insert', 'ticket_items'],
      ['update', 'ticket_items'],
    ]);
    expect(sink.calls[1]!.values).toEqual({ ticket_id: 1, qty: 1 });
    expect(sink.calls[2]!.id).toBe(1);
    expect(box.resolve(ticket)).toBe(1);
    expect(box.state().pending).toBe(0);
  });

  it('holds a write that names a key another queue has not saved yet', async () => {
    const sink = memorySink();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowInsert = sink.insert.bind(sink);
    sink.insert = async (ref, values, children) => {
      if (ref === 'shifts') await gate;
      return slowInsert(ref, values, children);
    };
    const box = createOutbox(sink);
    const shift = box.temp();
    void box.insert('shift', 'shifts', { opening_float: 200 }, { temp: shift });
    const saved = box.insert('t1', 'tickets', { shift_id: shift });
    await Promise.resolve();
    expect(sink.calls).toEqual([]);
    release();
    await saved;
    expect(sink.calls.map((c) => c.ref)).toEqual(['shifts', 'tickets']);
    expect(sink.calls[1]!.values).toEqual({ shift_id: 1 });
  });

  it('counts a conflict as already saved', async () => {
    const sink = memorySink();
    sink.failNext(new SinkError('exists', 'saved', 409, 'CONFLICT'));
    const box = createOutbox(sink);
    const onSaved = vi.fn();
    const row = await box.insert('t1', 'payments', { id: 'a-uuid', amount: 5 }, { onSaved });
    expect(row).toEqual({ id: 'a-uuid', amount: 5 });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('drops a refused write, and everything that depended on it, and carries on', async () => {
    const sink = memorySink();
    sink.failNext(refused());
    const box = createOutbox(sink);
    const ticket = box.temp();
    const onTicket = vi.fn();
    const onLine = vi.fn();
    const first = box.insert('t1', 'tickets', { status: 'open' }, { temp: ticket, onRefused: onTicket });
    const second = box.insert('t1', 'ticket_items', { ticket_id: ticket }, { onRefused: onLine });
    const other = box.insert('t2', 'tickets', { status: 'open' });
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(await other).toMatchObject({ status: 'open' });
    expect(onTicket.mock.calls[0]![0]).toMatchObject({ kind: 'refused', field: 'qty' });
    expect(onLine).toHaveBeenCalledOnce();
    // Only the unrelated ticket reached the server after the refusal.
    expect(sink.calls.map((c) => c.ref)).toEqual(['tickets', 'tickets']);
  });

  it('keeps a write through a dropped connection, trying again with a growing pause', async () => {
    const sink = memorySink();
    sink.failNext(offline(), 2);
    const pauses: number[] = [];
    const states: boolean[] = [];
    const box = createOutbox(sink, {
      wait: async (ms) => {
        pauses.push(ms);
        states.push(box.state().retrying);
      },
    });
    const row = await box.insert('t1', 'tickets', { status: 'open' });
    expect(row).toMatchObject({ status: 'open' });
    expect(pauses).toEqual([1000, 2000]);
    expect(states).toEqual([true, true]);
    expect(box.state()).toEqual({ pending: 0, retrying: false, signedOut: false });
  });

  it('stops everything when the session ends, and loses nothing', async () => {
    const sink = memorySink();
    sink.failNext(new SinkError('Sign in', 'signed-out', 401, 'UNAUTHENTICATED'));
    const box = createOutbox(sink);
    const saved = box.insert('t1', 'tickets', { status: 'open' });
    await vi.waitFor(() => expect(box.state().signedOut).toBe(true));
    expect(box.state().pending).toBe(1);
    box.resume();
    expect(await saved).toMatchObject({ status: 'open' });
    expect(box.state()).toEqual({ pending: 0, retrying: false, signedOut: false });
    // Tried twice: refused once for the session, then saved.
    expect(sink.calls).toHaveLength(2);
  });

  it('tells its listeners, and settles `idle` when a queue is empty', async () => {
    const box = createOutbox(memorySink());
    const seen: number[] = [];
    box.subscribe((state) => seen.push(state.pending));
    void box.insert('t1', 'tickets', { status: 'open' });
    void box.insert('t1', 'tickets', { status: 'open' });
    await box.idle('t1');
    await box.idle();
    expect(box.state().pending).toBe(0);
    expect(seen).toContain(2);
    expect(seen.at(-1)).toBe(0);
  });
});
