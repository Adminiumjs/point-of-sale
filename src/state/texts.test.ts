/**
 * TEXTS (plan 80): the till asks Adminium for a text by writing one outbox
 * row, and says what came of it — never more than that. A pickup is noted as
 * told only once the text went; a text that went, is going, or may have gone
 * is never asked for again; a receipt is offered only to a number the guest
 * agreed to texts for. No screen opens the device's own messages.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { memorySink, type MemorySink } from '../data/sink';
import { memoryTextLog, setTextLog, type TextLog } from '../data/textLog';
import type { PickupOrder, Reservation, Sale } from '../data/types';
import { usePos } from './store';
import { compactPhone, follow, isMainlandChina, maskPhone, maySendAgain, outcomeOf, readablePhone, samePhone, setTextPace, textable } from './texts';
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
const messages = () => sink.calls.filter((c) => c.ref === 'messages' && c.op === 'insert').map((c) => c.values);

const booking = (fields: Partial<Reservation> = {}): Reservation => ({
  id: '41',
  code: 'MR-AB12',
  name: 'Mara Rossi',
  mobile: '+1 415 555 0166',
  email: null,
  partySize: 2,
  startsAt: Date.parse('2026-11-24T19:00:00Z'),
  status: 'confirmed',
  channel: 'online',
  tableId: null,
  occasion: null,
  request: null,
  note: null,
  ...fields,
});
const order = (fields: Partial<PickupOrder> = {}): PickupOrder => ({
  rid: '88',
  number: 1088,
  name: 'Mara R.',
  mobile: '(415) 555-0166',
  customerId: '7',
  channel: 'till',
  stage: 'ready',
  placedAt: 0,
  readyAt: 0,
  notifiedAt: null,
  items: ['Latte'],
  ...fields,
});

beforeEach(() => {
  sink = memorySink({ firstNumber: 3001 });
  setSink(sink);
  setTextLog(memoryTextLog({ after: 0 }));
  setTextPace([0, 0, 0]);
  usePos.setState(INITIAL, true);
  usePos.setState({ pickups: [], reservations: [], texts: {}, members: {} });
});

describe('what a row says', () => {
  it('reads each of Adminium’s sentences as the result staff see', () => {
    const cases: [string, string | null, string][] = [
      ['queued', null, 'sending'],
      ['sent', null, 'sent'],
      ['skipped', 'No mobile number on file', 'no-number'],
      ['skipped', 'Not sent: this person has not agreed to texts', 'not-agreed'],
      ['skipped', 'Not sent: this person has not confirmed their yes', 'not-agreed'],
      ['skipped', 'Not sent: this person replied STOP', 'opted-out'],
      ['failed', 'Not sent: this person opted out at the provider', 'opted-out'],
      ['skipped', 'Not sent: the daily text limit is reached', 'limit'],
      ['sent', 'Unknown: check with the provider before resending', 'unknown'],
      ['sent', 'An earlier send is still open: check it before resending', 'unknown'],
      ['skipped', 'No text provider is connected', 'not-set-up'],
      ['skipped', 'Not sent: the mobile number cannot be read', 'bad-number'],
      ['skipped', 'Not sent: no texts go to this country', 'no-country'],
      ['failed', 'Not delivered: the provider reports it failed', 'not-sent'],
      ['failed', null, 'not-sent'],
    ];
    for (const [status, error, outcome] of cases) expect([status, error, outcomeOf({ status, error })]).toEqual([status, error, outcome]);
    expect(outcomeOf(null)).toBe('sending');
    // A row that reads `sent` with any other sentence has not settled as sent: nobody can tell.
    expect(outcomeOf({ status: 'sent', error: 'Waiting for the sending hours: goes at 2026-11-25 08:00 UTC' })).toBe('unknown');
  });

  it('may be asked for again only after a refusal', () => {
    expect([undefined, 'sending', 'sent', 'unknown', 'not-agreed', 'limit'].map((o) => maySendAgain(o as never))).toEqual([true, false, false, false, true, true]);
  });

  it('follows the row until it settles, reads a sent one twice, and calls a silent one unknown', async () => {
    const answers = [null, { status: 'queued', error: null }, { status: 'sent', error: null }, { status: 'failed', error: 'Not delivered: the provider reports it failed' }];
    setTextPace([0, 0, 0, 0]);
    expect(await follow(async () => answers.shift() ?? null)).toBe('not-sent');
    setTextPace([0, 0]);
    expect(await follow(async () => ({ status: 'queued', error: null }))).toBe('unknown');
    expect(await follow(async () => Promise.reject(new Error('offline')))).toBe('unknown');
  });
});

describe('what the till can tell of a number', () => {
  it('knows mainland China from Hong Kong and Taiwan', () => {
    expect(['+86 138 0013 8000', '0086 138 0013 8000', '+8613800138000'].map(isMainlandChina)).toEqual([true, true, true]);
    expect(['+852 5123 4567', '+886 912 345 678', '+1 415 555 0166', '(415) 555-0166'].map(isMainlandChina)).toEqual([false, false, false, false]);
    expect(compactPhone(' (415) 555-0166 ')).toBe('4155550166');
  });

  it('reads a number, or says it cannot', () => {
    expect(['+1 415 555 0166', '(415) 555-0166', '07700 900123'].map(readablePhone)).toEqual([true, true, true]);
    expect(['12', 'call me', '+1 415 555 0166 ext 2', '1234567890123456'].map(readablePhone)).toEqual([false, false, false, false]);
  });

  it('matches two writings of one number, and masks it for the guest’s screen', () => {
    expect(samePhone('+1 415 555 0166', '(415) 555-0166')).toBe(true);
    expect(samePhone('+1 415 555 0166', '+1 415 555 0167')).toBe(false);
    expect(samePhone(null, '+1 415 555 0166')).toBe(false);
    expect(maskPhone('+1 415 555 0166')).toBe('••• 0166');
  });

  it('offers a text only to a number that reads, outside mainland China, with a yes', () => {
    const yes = () => true;
    expect(textable('+1 415 555 0166', yes)).toBe(true);
    expect(textable('+1 415 555 0166', () => false)).toBe(false);
    expect(textable('+86 138 0013 8000', yes)).toBe(false);
    expect(textable('call me', yes)).toBe(false);
    expect(textable(null, yes)).toBe(false);
  });
});

describe('telling a pickup it is ready', () => {
  it('writes one text row about the ticket, to the customer, in no cashier’s language, and notes it only once it went', async () => {
    usePos.setState({ pickups: [order()], reservations: [booking({ textsOk: true })] });
    const going = s().notifyPickup('88');
    expect(s().texts['pickup:88']).toBe('sending');
    expect(s().pickups[0]!.notifiedAt).toBeNull();
    expect(await going).toBe('sent');
    await settled();
    expect(messages()).toEqual([{ id: expect.any(String), kind: 'pickup_ready', status: 'queued', ticket_id: '88', customer_id: 7 }]);
    expect(s().pickups[0]!.notifiedAt).toEqual(expect.any(Number));
    expect(sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'update').map((c) => c.values)).toEqual([{ notified_at: expect.any(String) }]);
    // Gone: not asked for again.
    expect(await s().notifyPickup('88')).toBeNull();
    expect(messages()).toHaveLength(1);
  });

  it('says so when they have not agreed, leaves the order untold, and may try again', async () => {
    usePos.setState({ pickups: [order()] });
    expect(await s().notifyPickup('88')).toBe('not-agreed');
    expect(s().pickups[0]!.notifiedAt).toBeNull();
    expect(maySendAgain(s().texts['pickup:88'])).toBe(true);
    await settled();
    expect(sink.calls.some((c) => c.ref === 'tickets')).toBe(false);
  });

  it('writes nothing for an order with nobody on file', async () => {
    usePos.setState({ pickups: [order({ customerId: undefined, mobile: null })] });
    expect(await s().notifyPickup('88')).toBe('no-number');
    await settled();
    expect(messages()).toEqual([]);
  });

  it('is never pressed twice while one is going, and never again when nobody can tell', async () => {
    const unknown: TextLog = { queued() {}, read: async () => ({ status: 'sent', error: 'Unknown: check with the provider before resending' }) };
    setTextLog(unknown);
    usePos.setState({ pickups: [order()] });
    const first = s().notifyPickup('88');
    expect(await s().notifyPickup('88')).toBeNull();
    expect(await first).toBe('unknown');
    expect(await s().notifyPickup('88')).toBeNull();
    await settled();
    expect(messages()).toHaveLength(1);
    expect(s().pickups[0]!.notifiedAt).toBeNull();
  });

  it('reads the daily limit and a STOP as Adminium wrote them', async () => {
    for (const [error, outcome] of [
      ['Not sent: the daily text limit is reached', 'limit'],
      ['Not sent: this person replied STOP', 'opted-out'],
    ] as const) {
      setTextLog({ queued() {}, read: async () => ({ status: 'skipped', error }) });
      usePos.setState({ pickups: [order()], texts: {} });
      expect(await s().notifyPickup('88')).toBe(outcome);
    }
  });
});

describe("reminding a booking's guest of their table", () => {
  it('writes the reminder about the booking, to the number on it, and says what came of it', async () => {
    usePos.setState({ reservations: [booking({ textsOk: true })] });
    expect(await s().messageBooking('41')).toBe('sent');
    await settled();
    expect(messages()).toEqual([{ id: expect.any(String), kind: 'table_reminder', status: 'queued', reservation_id: 41 }]);
    expect(s().texts['booking:41']).toBe('sent');
  });

  it('says there is no number for a booking without one, and writes nothing', async () => {
    usePos.setState({ reservations: [booking({ mobile: null })] });
    expect(await s().messageBooking('41')).toBe('no-number');
    await settled();
    expect(messages()).toEqual([]);
  });
});

describe('a text receipt', () => {
  const sale = (fields: Partial<Sale> = {}): Sale => ({ rid: '90', number: 1090, table: null, items: [], subtotal: 4, discount: 0, discountLabel: '', tax: 0.33, tip: 0, total: 4.33, splits: [], change: 0, at: 0, staff: 'Sam', ...fields });

  it('is offered only to a number the guest agreed to texts for', () => {
    usePos.setState({ reservations: [booking({ textsOk: true })] });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBe('+1 415 555 0166');
    usePos.setState({ reservations: [booking()] });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBeNull();
    // A mainland China number: never offered, even with a yes.
    usePos.setState({ reservations: [booking({ textsOk: true, mobile: '+86 138 0013 8000' })] });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBeNull();
    expect(s().receiptPhone(sale())).toBeNull();
  });

  it("goes to the member's own number when the sale was theirs, linked to the ticket", async () => {
    usePos.setState({
      reservations: [booking({ id: '42', textsOk: true })],
      members: { '7': { id: '7', memberNo: '1007', name: 'Mara Rossi', mobile: '(415) 555-0166', email: null, joinedAt: 0, points: 0, lifetime: 0, visits: 1 } },
      lastSale: sale({ customerId: '7' }),
    });
    expect(await s().sendReceipt('text')).toBe('sent');
    await settled();
    expect(messages()).toEqual([{ id: expect.any(String), kind: 'receipt_text', status: 'queued', ticket_id: '90', customer_id: 7 }]);
  });

  it('is not sent, and nothing written, when it was not offered', async () => {
    usePos.setState({ lastSale: sale({ reservationId: '41' }), reservations: [booking()] });
    expect(await s().sendReceipt('text')).toBeNull();
    await settled();
    expect(messages()).toEqual([]);
  });
});

describe('the device’s own messages', () => {
  it('are never opened: no screen links to sms:', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'testing' ? [] : files(path);
        return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
      });
    expect(files(root).filter((path) => /['"`]sms:/.test(readFileSync(path, 'utf8')))).toEqual([]);
  });
});
