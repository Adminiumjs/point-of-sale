/**
 * TEXTS (plan 80): the till asks Adminium for a text by writing one outbox
 * row, and says what came of it — read from the row's code, never its words.
 * A pickup is noted as told only once the text went; a text that went, is
 * going, or may have gone is never asked for again. Whether a guest agreed is
 * Adminium's to say (`GET /texts/consent`), and a yes given at the counter is
 * recorded by Adminium in the box's words (`POST /texts/consent`). No screen
 * opens the device's own messages.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { memorySink, type MemorySink } from '../data/sink';
import { memoryTextLog, setTextLog, type TextAnswer, type TextLog, type TextPerson } from '../data/textLog';
import type { PickupOrder, Reservation, Sale } from '../data/types';
import { usePos } from './store';
import { boxFor, compactPhone, follow, isMainlandChina, maskPhone, maySendAgain, outcomeOf, readablePhone, samePhone, setTextPace } from './texts';
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

const MARA = '+1 415 555 0166';
const booking = (fields: Partial<Reservation> = {}): Reservation => ({
  id: '41',
  code: 'MR-AB12',
  name: 'Mara Rossi',
  mobile: MARA,
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
/** A log that answers every row the same way, and records what the till asked. */
const fixed = (row: { status: string; reason: string | null }, extra: Partial<TextLog> = {}): TextLog => ({
  ready: async () => true,
  standing: async () => null,
  record: async () => true,
  queued() {},
  read: async () => ({ ...row, error: null }),
  ...extra,
});

beforeEach(() => {
  sink = memorySink({ firstNumber: 3001 });
  setSink(sink);
  setTextLog(memoryTextLog({ after: 0 }));
  setTextPace([0, 0, 0]);
  usePos.setState(INITIAL, true);
  usePos.setState({ pickups: [], reservations: [], texts: {}, members: {}, textsReady: null, textStandings: {} });
});

describe('what a row says', () => {
  it('reads Adminium’s code beside the sentence, never the sentence', () => {
    const cases: [string, string | null, string][] = [
      ['queued', 'queued', 'sending'],
      ['sent', 'waiting', 'sending'],
      ['sent', 'sent', 'sent'],
      ['skipped', 'no-number', 'no-number'],
      ['skipped', 'no-consent', 'not-agreed'],
      ['skipped', 'unconfirmed-consent', 'not-agreed'],
      ['skipped', 'stopped', 'opted-out'],
      ['failed', 'opted-out', 'opted-out'],
      ['skipped', 'daily-limit', 'limit'],
      ['sent', 'unknown', 'unknown'],
      ['sent', 'earlier-send-open', 'unknown'],
      ['skipped', 'not-set-up', 'not-set-up'],
      ['skipped', 'unreadable-phone', 'bad-number'],
      ['skipped', 'country-blocked-cn', 'no-country'],
      ['failed', 'provider-failed', 'not-sent'],
      ['skipped', 'sample', 'not-sent'],
    ];
    for (const [status, reason, outcome] of cases) expect([status, reason, outcomeOf({ status, error: 'whatever the words say', reason })]).toEqual([status, reason, outcome]);
    expect(outcomeOf(null)).toBe('sending');
    // No code yet: a claimed row is still going, any other is not sent.
    expect(outcomeOf({ status: 'sent', error: null, reason: null })).toBe('sending');
    expect(outcomeOf({ status: 'failed', error: 'No mobile number on file', reason: null })).toBe('not-sent');
  });

  it('may be asked for again only after a refusal', () => {
    expect([undefined, 'sending', 'sent', 'unknown', 'not-agreed', 'limit'].map((o) => maySendAgain(o as never))).toEqual([true, false, false, false, true, true]);
  });

  it('follows the row until it settles, reads a sent one twice, and calls a silent one unknown', async () => {
    const answers = [null, { status: 'queued', error: null, reason: 'queued' }, { status: 'sent', error: null, reason: 'sent' }, { status: 'failed', error: null, reason: 'provider-failed' }];
    setTextPace([0, 0, 0, 0]);
    expect(await follow(async () => answers.shift() ?? null)).toBe('not-sent');
    setTextPace([0, 0]);
    expect(await follow(async () => ({ status: 'queued', error: null, reason: 'queued' }))).toBe('unknown');
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

  it('matches two writings of one number, masks it, and says which box a number gets', () => {
    expect(samePhone('+1 415 555 0166', '(415) 555-0166')).toBe(true);
    expect(samePhone('+1 415 555 0166', '+1 415 555 0167')).toBe(false);
    expect(samePhone(null, '+1 415 555 0166')).toBe(false);
    expect(maskPhone('+1 415 555 0166')).toBe('••• 0166');
    expect(['', '+1 415 555 0166', '+86 138 0013 8000', 'call me'].map(boxFor)).toEqual(['none', 'box', 'china', 'unreadable']);
  });
});

describe('telling a pickup it is ready', () => {
  it('writes one text row about the ticket, to the customer, in no cashier’s language, and notes it only once it went', async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA] }));
    usePos.setState({ pickups: [order()] });
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
    setTextLog(fixed({ status: 'sent', reason: 'unknown' }));
    usePos.setState({ pickups: [order()] });
    const first = s().notifyPickup('88');
    expect(await s().notifyPickup('88')).toBeNull();
    expect(await first).toBe('unknown');
    expect(await s().notifyPickup('88')).toBeNull();
    await settled();
    expect(messages()).toHaveLength(1);
    expect(s().pickups[0]!.notifiedAt).toBeNull();
  });

  it('reads the daily limit, a STOP and texts not set up by their codes', async () => {
    for (const [reason, outcome] of [
      ['daily-limit', 'limit'],
      ['stopped', 'opted-out'],
      ['not-set-up', 'not-set-up'],
    ] as const) {
      setTextLog(fixed({ status: 'skipped', reason }));
      usePos.setState({ pickups: [order()], texts: {} });
      expect(await s().notifyPickup('88')).toBe(outcome);
    }
  });
});

describe("reminding a booking's guest of their table", () => {
  it('writes the reminder about the booking, which Adminium sends to the number on it, and says what came of it', async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA] }));
    usePos.setState({ reservations: [booking()] });
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

describe('a yes given at the counter', () => {
  const recorder = () => {
    const asked: { person: TextPerson; answer: TextAnswer }[] = [];
    const log: TextLog = { ...fixed({ status: 'sent', reason: 'sent' }), record: async (person, answer) => (asked.push({ person, answer }), true) };
    setTextLog(log);
    return asked;
  };

  it('on a pickup order is recorded for the new customer’s row, in the box’s words and version, by phone for a phone order', async () => {
    const asked = recorder();
    s().tapTile('coldbrew');
    await s().markPickup({ name: 'Wen Li', mobile: '+44 7911 123471', channel: 'phone', textsOk: true });
    await settled();
    await Promise.resolve();
    const box = (manifest as { publicAccess: { textConsent?: { wording: { version: number; text: Record<string, string> } } }[] }).publicAccess.find((e) => e.textConsent !== undefined)!.textConsent!;
    expect(asked).toEqual([
      {
        person: { table: 'customers', row: expect.not.stringMatching(/^tmp:/), phone: '+44 7911 123471' },
        answer: { state: 'yes', how: 'phone', wording: { text: box.wording.text['en-US'], version: `v${String(box.wording.version)} en-US` } },
      },
    ]);
  });

  it('is never recorded for a box left empty, nor for a mainland China number', async () => {
    const asked = recorder();
    s().tapTile('coldbrew');
    await s().markPickup({ name: 'Ida', mobile: '+44 7911 123472', channel: 'till' });
    s().tapTile('croissant');
    await s().markPickup({ name: 'Li', mobile: '+86 138 0013 8000', channel: 'till', textsOk: true });
    await settled();
    expect(asked).toEqual([]);
  });

  it('when a member enrols, in person, for their row', async () => {
    const asked = recorder();
    expect(await s().enroll({ name: 'Oda Berg', mobile: '+44 7911 123473', email: '', textsOk: true })).toBe(true);
    await settled();
    expect(asked.map((one) => [one.person.table, one.answer.state, one.answer.how])).toEqual([['customers', 'yes', 'in-person']]);
  });
});

describe('a text receipt', () => {
  const sale = (fields: Partial<Sale> = {}): Sale => ({ rid: '90', number: 1090, table: null, items: [], subtotal: 4, discount: 0, discountLabel: '', tax: 0.33, tip: 0, total: 4.33, splits: [], change: 0, at: 0, staff: 'Sam', ...fields });

  it('is offered only once Adminium says texts are set up and this guest agreed, with its masked number', async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA] }));
    usePos.setState({ reservations: [booking(), booking({ id: '42', mobile: '+1 415 555 0177' })] });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBeNull();
    await s().loadTextsReady();
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBeNull(); // not asked yet
    await s().readStanding({ kind: 'booking', id: '41' });
    await s().readStanding({ kind: 'booking', id: '42' });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBe('••• 0166');
    expect(s().receiptPhone(sale({ reservationId: '42' }))).toBeNull();
    expect(s().receiptPhone(sale())).toBeNull();
  });

  it('is never offered while texts are not set up', async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA], ready: false }));
    usePos.setState({ reservations: [booking()] });
    await s().loadTextsReady();
    await s().readStanding({ kind: 'booking', id: '41' });
    expect(s().receiptPhone(sale({ reservationId: '41' }))).toBeNull();
  });

  it("goes to the member's own number when the sale was theirs, linked to the ticket and the member only", async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA] }));
    usePos.setState({
      members: { '7': { id: '7', memberNo: '1007', name: 'Mara Rossi', mobile: '(415) 555-0166', email: null, joinedAt: 0, points: 0, lifetime: 0, visits: 1 } },
      lastSale: sale({ customerId: '7', reservationId: '41' }),
      reservations: [booking()],
    });
    await s().loadTextsReady();
    await s().readStanding({ kind: 'customer', id: '7' });
    expect(await s().sendReceipt('text')).toBe('sent');
    await settled();
    expect(messages()).toEqual([{ id: expect.any(String), kind: 'receipt_text', status: 'queued', ticket_id: '90', customer_id: 7 }]);
  });

  it("goes to the booking's number for a sale with no member", async () => {
    setTextLog(memoryTextLog({ after: 0, agreed: [MARA] }));
    usePos.setState({ lastSale: sale({ reservationId: '41' }), reservations: [booking()] });
    await s().loadTextsReady();
    await s().readStanding({ kind: 'booking', id: '41' });
    expect(await s().sendReceipt('text')).toBe('sent');
    await settled();
    expect(messages()).toEqual([{ id: expect.any(String), kind: 'receipt_text', status: 'queued', ticket_id: '90', reservation_id: 41 }]);
  });

  it('is not sent, and nothing written, when it was not offered', async () => {
    usePos.setState({ lastSale: sale({ reservationId: '41' }), reservations: [booking()] });
    await s().loadTextsReady();
    await s().readStanding({ kind: 'booking', id: '41' });
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
