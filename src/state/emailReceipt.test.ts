/**
 * THE RECEIPT, EMAILED TO A GUEST — one message in the outbox, nothing else.
 *
 * The till writes a single `messages` row; Adminium sends it, with the
 * receipt Invoices & Receipts draws for the ticket attached. These hold what
 * that row carries, when it is written at all, and where the guest's address
 * goes (only there).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { NO_FEATURES } from '../features';
import { SinkError, memorySink, type MemorySink } from '../data/sink';
import { isEmailAddress, usePos } from './store';
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

/** Ring up a croissant and pay for it in cash: the receipt screen, with its sale. */
async function sell(): Promise<void> {
  s().tapTile('croissant');
  s().openPay();
  usePos.setState({ payMethod: 'cash', cash: '20', tip: 0 });
  s().onCharge();
  await settled();
  expect(s().view).toBe('complete');
}

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, features: { 'emailed-receipts': true, 'shelf-labels': false } });
});

describe('emailing the receipt', () => {
  it('queues one message for the ticket that closed, to the address typed, in the till’s language', async () => {
    await sell();
    expect(s().emailReceipt('  dana.w@example.com ')).toBe('queued');
    await settled();
    const sent = sink.calls.filter((c) => c.ref === 'messages');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ op: 'insert' });
    expect(sent[0]!.values).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'receipt',
      status: 'queued',
      to_address: 'dana.w@example.com',
      language: 'en-US',
      // The ticket's row, as the server keyed it.
      ticket_id: 1,
    });
    // Written after the ticket's own writes, so the sale is saved before its receipt is asked for.
    const order = sink.calls.map((c) => c.ref);
    expect(order.indexOf('messages')).toBeGreaterThan(order.lastIndexOf('tickets'));
    expect(s().lastSale?.emailedTo).toEqual(['dana.w@example.com']);
    expect(s().toast).toMatchObject({ kind: 'success' });
  });

  it('links the member the sale was for, when there was one', async () => {
    usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [], customerId: '42' } });
    await sell();
    s().emailReceipt('dana.w@example.com');
    await settled();
    expect(sink.calls.find((c) => c.ref === 'messages')!.values).toMatchObject({ customer_id: 42 });
  });

  it('keeps the address only on the message: the ticket is not written again', async () => {
    await sell();
    const before = sink.calls.length;
    s().emailReceipt('dana.w@example.com');
    await settled();
    expect(sink.calls.slice(before).map((c) => `${c.op} ${c.ref}`)).toEqual(['insert messages']);
  });

  it('refuses what is not an address, and writes nothing', async () => {
    await sell();
    const before = sink.calls.length;
    for (const typed of ['', 'dana', 'dana@', '@example.com', 'dana w@example.com', `${'a'.repeat(250)}@example.com`]) {
      expect(s().emailReceipt(typed), typed).toBe('invalid');
    }
    await settled();
    expect(sink.calls.length).toBe(before);
  });

  it('sends nothing while Invoices & Receipts is not attached', async () => {
    await sell();
    usePos.setState({ features: NO_FEATURES });
    const before = sink.calls.length;
    expect(s().emailReceipt('dana.w@example.com')).toBe('off');
    await settled();
    expect(sink.calls.length).toBe(before);
  });

  it('has nothing to send before a sale has closed', () => {
    expect(s().emailReceipt('dana.w@example.com')).toBe('none');
  });

  it('takes the address back off the screen when the server refuses the message', async () => {
    await sell();
    sink.failNext(new SinkError('Some values were refused.', 'refused', 422, 'VALIDATION_FAILED', 'to_address'));
    s().emailReceipt('dana.w@example.com');
    await settled();
    expect(s().lastSale?.emailedTo).toEqual([]);
    expect(s().toast?.kind).toBe('error');
  });

  it('can send again to a corrected address', async () => {
    await sell();
    s().emailReceipt('dana.w@exmaple.com');
    s().emailReceipt('dana.w@example.com');
    await settled();
    expect(sink.calls.filter((c) => c.ref === 'messages').map((c) => c.values!['to_address'])).toEqual(['dana.w@exmaple.com', 'dana.w@example.com']);
    expect(s().lastSale?.emailedTo).toEqual(['dana.w@exmaple.com', 'dana.w@example.com']);
  });
});

describe('an email address', () => {
  it('is something@somewhere.tld with no spaces', () => {
    expect(isEmailAddress('a@b.co')).toBe(true);
    expect(isEmailAddress('a.b+c@mail.example.org')).toBe(true);
    expect(isEmailAddress('a@b')).toBe(false);
    expect(isEmailAddress('a b@c.de')).toBe(false);
  });
});
