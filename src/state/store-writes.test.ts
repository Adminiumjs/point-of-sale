/**
 * EVERY ACTION AT THE TILL IS SAVED — the table in plan §3.3, action by action.
 *
 * The store saves through the outbox; here the outbox sits on a fresh memory
 * sink per test, so what reached "the server" can be read back in order: the
 * table, the operation, the values, and which key each write named.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { demoGroupId, demoSelection } from '../data/demo';
import { SinkError, memorySink, type MemorySink } from '../data/sink';
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
const calls = () => sink.calls.map((c) => `${c.op} ${c.ref}`);

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null });
});

describe('what the till saves', () => {
  it('opens the ticket on its first line, then adds the line under the ticket’s key', async () => {
    s().tapTile('croissant');
    await settled();
    expect(calls()).toEqual(['insert tickets', 'insert ticket_items']);
    expect(sink.calls[0]!.values).toMatchObject({ status: 'open', held: false, guests: 2 });
    expect(sink.calls[1]!.values).toMatchObject({ ticket_id: 1, menu_item_id: 'croissant', qty: 1, unit_price: 3.8 });
    // The server's number replaces the till's own.
    expect(s().ticket.number).toBe(2001);
  });

  it('saves a line’s chosen options with it, in the same write, at their own prices', async () => {
    s().tapTile('latte');
    const extras = demoGroupId('latte', 'extras');
    for (const option of demoSelection('latte', { milk: 'Oat', extras: ['Vanilla'] })[demoGroupId('latte', 'milk')]!) s().toggleOption(demoGroupId('latte', 'milk'), option);
    s().toggleOption(extras, demoSelection('latte', { extras: ['Vanilla'] })[extras]![0]!);
    s().sheetAdd();
    await settled();
    expect(calls()).toEqual(['insert tickets', 'insert ticket_items']);
    // Medium (the size's free default), oat milk and vanilla — one row each, under the line.
    expect(sink.calls[1]!.children).toEqual([
      {
        ref: 'ticket_item_modifiers',
        via: 'ticket_item_id',
        rows: [
          { modifier_id: 'latte:size:m', price_delta: 0 },
          { modifier_id: 'latte:milk:oat', price_delta: 0.6 },
          { modifier_id: 'latte:extras:vanilla', price_delta: 0.5 },
        ],
      },
    ]);
    expect(sink.calls[1]!.values).toMatchObject({ menu_item_id: 'latte', unit_price: 5.9 });
  });

  it('writes no children for a line with no options', async () => {
    s().tapTile('croissant');
    await settled();
    expect(sink.calls[1]!.children).toBeUndefined();
  });

  it('changes a quantity on the line’s row, and deletes an unsent line it takes off', async () => {
    s().tapTile('croissant');
    s().tapTile('croissant');
    const key = s().ticket.items[0]!.key;
    s().dec(key);
    s().dec(key);
    await settled();
    expect(calls()).toEqual(['insert tickets', 'insert ticket_items', 'update ticket_items', 'update ticket_items', 'remove ticket_items']);
    expect(sink.calls.map((c) => c.values?.['qty'])).toEqual([undefined, 1, 2, 1, undefined]);
    expect(sink.rows.get('ticket_items')).toEqual([]);
  });

  it('sends: the lines are stamped, and the ticket goes to the kitchen', async () => {
    s().tapTile('croissant');
    s().send();
    await settled();
    expect(calls().slice(2)).toEqual(['update ticket_items', 'update tickets']);
    expect(sink.calls[2]!.values).toHaveProperty('sent_at');
    expect(sink.calls[3]!.values).toMatchObject({ status: 'sent', kitchen_status: 'new' });
    // The kitchen card knows its ticket, so a bump is saved on it.
    const card = s().kds.at(-1)!;
    s().bumpK(card.number);
    await settled();
    expect(sink.calls.at(-1)!.values).toEqual({ kitchen_status: 'cooking' });
  });

  it('holds and resumes on the ticket’s row', async () => {
    s().tapTile('croissant');
    s().hold();
    const number = s().held[0]!.number;
    s().resumeHeld(number);
    await settled();
    expect(sink.calls.slice(2).map((c) => c.values)).toEqual([{ held: true }, { held: false }]);
  });

  it('records a discount in the words the table takes, and clears it', async () => {
    s().tapTile('croissant');
    s().applyDiscount('pct', 10, '10% off');
    s().clearDiscount();
    await settled();
    expect(sink.calls.slice(2).map((c) => c.values)).toEqual([
      { discount_kind: 'percent', discount_value: 10, discount_reason: '10% off' },
      { discount_kind: null, discount_value: null, discount_reason: null },
    ]);
  });

  it('voids a sent line on the record and never deletes it', async () => {
    s().tapTile('croissant');
    s().send();
    const key = s().ticket.items[0]!.key;
    s().openVoid(key);
    s().setVoidText('VOID');
    s().confirmVoid();
    await settled();
    expect(calls()).not.toContain('remove ticket_items');
    expect(sink.calls.at(-1)!.values).toHaveProperty('voided_at');
    expect(sink.rows.get('ticket_items')).toHaveLength(1);
  });

  it('opens the shift, and later tickets belong to it', async () => {
    usePos.setState({ drawer: 150 });
    s().openShift();
    s().tapTile('croissant');
    await settled();
    expect(calls().slice(0, 2)).toEqual(['insert shifts', 'insert tickets']);
    expect(sink.calls[0]!.values).toMatchObject({ opening_float: 150 });
    expect(sink.calls[1]!.values).toMatchObject({ shift_id: 1 });
  });
});

describe('money waits for the server', () => {
  it('saves the payment, then closes the ticket with its tax and total — and only then shows the receipt', async () => {
    s().tapTile('croissant');
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '20', tip: 0 });
    s().onCharge();
    // Nothing is shown as paid before the server has it.
    expect(s().view).toBe('payment');
    await settled();
    expect(s().view).toBe('complete');
    const [payment, closed] = sink.calls.slice(2);
    expect(payment).toMatchObject({ op: 'insert', ref: 'payments' });
    expect(payment!.values).toMatchObject({ ticket_id: 1, method: 'cash', tendered: 20, tip: 0 });
    expect(String(payment!.values!['id'])).toMatch(/^[0-9a-f-]{36}$/);
    expect(closed).toMatchObject({ op: 'update', ref: 'tickets' });
    expect(closed!.values).toMatchObject({ status: 'paid', tax: expect.any(Number), total: expect.any(Number) });
  });

  it('keeps the ticket open when the payment is refused', async () => {
    s().tapTile('croissant');
    s().openPay();
    await settled();
    sink.failNext(new SinkError('Some values were refused.', 'refused', 422, 'VALIDATION_FAILED', 'amount'));
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    await settled();
    expect(s().view).toBe('payment');
    expect(s().splits).toEqual([]);
    expect(s().toast?.kind).toBe('error');
  });
});

describe('a change the server refuses comes off the screen', () => {
  it('takes a refused line back off the ticket, and says so', async () => {
    s().tapTile('croissant');
    await settled();
    sink.failNext(new SinkError('Some values were refused.', 'refused', 422, 'VALIDATION_FAILED', 'qty'));
    s().tapTile('banana');
    expect(s().ticket.items).toHaveLength(2);
    await settled();
    expect(s().ticket.items.map((x) => x.id)).toEqual(['croissant']);
    expect(s().toast).toMatchObject({ kind: 'error' });
  });

  it('shows what is still waiting to be saved', async () => {
    sink.failNext(new SinkError('Failed to fetch', 'offline', 0, 'NETWORK'));
    setSink(sink);
    s().tapTile('croissant');
    await Promise.resolve();
    expect(s().sync.pending).toBeGreaterThan(0);
  });
});

describe('the floor lives in the store', () => {
  it('takes a table when it is seated, frees the old one on a move, and frees it when paid', async () => {
    const tableOf = (label: string) => s().floor.find((tb) => tb.label === label)!;
    expect(tableOf('W3').status).toBe('open');
    s().openTable(tableOf('W3'));
    expect(tableOf('W3').status).toBe('occupied');
    s().tapTile('croissant');
    s().doMove('B2');
    expect(tableOf('W3').status).toBe('open');
    expect(tableOf('B2').status).toBe('occupied');
    s().openPay();
    usePos.setState({ payMethod: 'qr', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('complete');
    expect(tableOf('B2').status).toBe('open');
  });

  it('starts from the bookings the till read', () => {
    expect(s().reservations.map((r) => r.code)).toContain('MR-4829');
  });
});
