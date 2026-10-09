/**
 * WHAT BELONGS TO ONE TICKET DOES NOT REACH THE NEXT — and money is taken once.
 *
 * The store over a memory sink and a stand-in desk, as `serverFigures.test.ts`
 * drives it. Each case is one a review of the screens found: a gift card
 * checked for one customer and offered on the next one's ticket, a card
 * payment pressed twice after its reply was lost, a card's code saved as a
 * discount code because the look-up had no answer, older figures landing over
 * newer ones.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setDesk, type Desk, type DeskReply } from '../data/desk';
import { SinkError, memorySink, type MemorySink, type SinkRow } from '../data/sink';
import { NO_FEATURES } from '../features';
import { cardPrints, dropCardPrint } from './cardPrints';
import { usePos } from './store';
import { outbox, setSink } from './writes';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
const CODE = 'GC-7K2MW3HNQ4XP';
let sink: MemorySink;

const settled = async () => {
  for (let i = 0; i < 30; i += 1) {
    await outbox().idle();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const TICKET: SinkRow = { id: 1, status: 'open', tax_rate_bp: 825, subtotal: '90.00', goods: '90.00', own_discount: '0.00', discount: '0.00', net: '90.00', tax: '7.43', total: '97.43', due: '97.43', paid: '0.00' };

interface Call {
  op: string;
  ref: string;
  values?: SinkRow;
}

function standIn(over: Partial<Desk> = {}): Desk & { calls: Call[] } {
  const calls: Call[] = [];
  const reply = (data: SinkRow = {}): DeskReply => ({ data });
  const base: Desk = {
    one: async () => TICKET,
    rows: async () => [],
    create: async (_ref, values) => reply(values),
    patch: async (_ref, _id, values) => reply(values),
    dryCreate: async (ref, values) => (ref === 'payments' ? { data: values, payment: { amount: '19.00', due: '78.43' } } : reply(values)),
    dryUpdate: async (_ref, _id, values) => reply(values),
    oneByOne: async () => ({ results: [], notRun: 0 }),
    lookUp: async () => ({ found: false }),
    stockWords: async () => [],
    cardPrintUrl: async () => '/print',
  };
  const desk = { ...base, ...over, calls } as Desk & { calls: Call[] };
  for (const op of ['create', 'dryCreate'] as const) {
    const inner = desk[op].bind(desk);
    desk[op] = async (ref, values, children) => {
      calls.push({ op, ref, values });
      return inner(ref, values, children);
    };
  }
  const look = desk.lookUp.bind(desk);
  desk.lookUp = async (value) => {
    calls.push({ op: 'lookUp', ref: 'offers' });
    return look(value);
  };
  return desk;
}

const MOVED = { offers: true, 'gift-cards': true };
const connect = (desk: Desk) => {
  setDesk(desk);
  usePos.setState({ connected: true, cardsMoved: true, features: { ...NO_FEATURES, ...MOVED } });
};
/** Everything of the store a card's code could be left in. */
const kept = () => JSON.stringify(s(), (_key, value: unknown) => (typeof value === 'function' ? undefined : value));
const noCardLeft = () => {
  expect([s().cardPay, s().cardPayWords, s().cardDraft, s().cardAsked, s().codeAsk, s().codeDraft]).toEqual([null, null, '', null, null, '']);
  expect(kept()).not.toContain(CODE);
};
/** A's ticket, with A's gift card checked at Pay: the quote is on the Gift card tab. */
const checkedAtPay = async () => {
  s().tapTile('croissant');
  await settled();
  s().openPay();
  s().setMethod('gift_card');
  s().setCardDraft(CODE);
  await s().quoteCard(CODE);
  expect(s().cardPay).toMatchObject({ code: CODE, covers: 19, rid: s().ticket.rid });
};

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  setDesk(null);
  for (const one of cardPrints()) dropCardPrint(one.cardId);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, view: 'register', cardPrints: [] });
});
afterEach(() => setDesk(null));

describe('a gift card checked for one ticket', () => {
  it('is gone once that ticket is paid another way: the next ticket is offered nothing of it', async () => {
    const desk = standIn();
    connect(desk);
    await checkedAtPay();
    // A pays cash instead.
    usePos.setState({ payMethod: 'cash', cash: '200', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().lastSale).not.toBeNull();
    noCardLeft();
    // On B's ticket a tap on "Use … from the card" has nothing to use.
    s().newOrder();
    s().tapTile('croissant');
    await settled();
    const before = desk.calls.length;
    await s().payCard();
    expect(desk.calls.slice(before).filter((c) => c.ref === 'payments')).toEqual([]);
    noCardLeft();
  });

  it('is gone when the ticket is held, and stays gone when another is recalled', async () => {
    connect(standIn());
    await checkedAtPay();
    usePos.setState({ view: 'register' });
    s().hold();
    await settled();
    noCardLeft();
    const parked = s().held[0]!;
    s().resumeHeld(parked.number);
    await settled();
    noCardLeft();
  });

  it('a quote that is somehow for another ticket pays nothing here', async () => {
    const desk = standIn();
    connect(desk);
    s().tapTile('croissant');
    await settled();
    usePos.setState({ cardPay: { code: CODE, covers: 19, due: 0, rid: 'tmp:another-ticket', paymentId: 'p-a' } });
    await s().payCard();
    expect(desk.calls.filter((c) => c.op === 'create' && c.ref === 'payments')).toEqual([]);
    expect(s().cardPay).toBeNull();
    expect(s().splits).toEqual([]);
  });
});

describe('a card payment whose reply was lost', () => {
  it('pressed again is the same payment: one key, one split, read back — never a second spend', async () => {
    const sent: SinkRow[] = [];
    const saved: SinkRow = { card_amount: '19.00', card_last4: 'Q4XP', card_balance_after: '0.00', method: 'gift_card' };
    const desk = standIn({
      create: async (ref, values) => {
        if (ref !== 'payments') return { data: values };
        sent.push(values);
        // The first press is saved by the server and its reply never arrives; the second meets the key it made.
        if (sent.length === 1) throw new SinkError('no answer', 'offline', 0, 'NETWORK');
        throw new SinkError('that key is there already', 'refused', 409, 'UNIQUE_VIOLATION');
      },
      one: async (ref, id) => (ref === 'payments' ? { ...saved, id } : { ...TICKET, paid: '19.00', due: '78.43' }),
    });
    connect(desk);
    await checkedAtPay();
    await s().payCard();
    // No answer: nothing is on the ticket's payments yet, and the quote — with its key — is still there to press.
    expect(s().splits).toEqual([]);
    expect(s().cardPayWords).toBe('A gift card needs a connection');
    expect(s().cardPay).not.toBeNull();
    await s().payCard();
    await settled();
    expect(sent).toHaveLength(2);
    expect(sent[0]!['id']).toBe(sent[1]!['id']);
    expect(s().splits).toEqual([{ id: String(sent[0]!['id']), method: 'gift_card', amount: 19, reference: 'Q4XP', cardLeft: 0 }]);
    // What is left is the server's word, read again.
    expect(s().ticket.server?.due).toBe(78.43);
    expect(kept()).not.toContain(CODE);
  });
});

describe('a code that asked for a named customer', () => {
  it('is that ticket’s: on the next one, adding its member applies nothing', async () => {
    const needs = new SinkError('no', 'refused', 409, 'ADJUST_REFUSED', null, { reason: 'needs-customer' });
    const desk = standIn({ create: async (ref, values) => (ref === 'ticket_codes' ? Promise.reject(needs) : { data: values }) });
    connect(desk);
    usePos.setState({ cardsMoved: false });
    s().tapTile('croissant');
    await settled();
    await s().applyCode('WELCOME10');
    expect(s().codeAsk).toMatchObject({ typed: 'WELCOME10', rid: s().ticket.rid });
    s().hold();
    await settled();
    expect(s().codeAsk).toBeNull();
    // Even a prompt left over by some other road names its ticket, and is not applied to this one.
    s().tapTile('croissant');
    await settled();
    usePos.setState({ codeAsk: { typed: 'WELCOME10', noEmail: false, rid: 'tmp:the-ticket-before' }, members: { m1: { id: 'm1', name: 'Ada Lin', mobile: '', email: 'ada@shop.test', points: 0, lifetime: 0, visits: 0, joined: 0, no: 'M1' } as never } });
    const before = desk.calls.length;
    s().attachMember('m1');
    await settled();
    expect(desk.calls.slice(before).filter((c) => c.ref === 'ticket_codes')).toEqual([]);
    expect(s().codeAsk).toBeNull();
  });
});

describe('a typed value Offers could not look up', () => {
  it('is not saved as a ticket’s code on a guess: with no answer it says it could not be checked, and stops', async () => {
    const desk = standIn({ lookUp: () => Promise.reject(new SinkError('too many', 'offline', 429, 'RATE_LIMITED')) });
    connect(desk);
    s().tapTile('croissant');
    await settled();
    await s().applyCode(CODE);
    expect(desk.calls.filter((c) => c.ref === 'ticket_codes')).toEqual([]);
    expect(s().codeSaid).toEqual({ ok: false, words: 'Codes need a connection' });
    expect(s().codeSaid!.words).not.toContain(CODE);
    expect(JSON.stringify(s().ticket)).not.toContain(CODE);
  });

  it('shaped like a gift card’s code and no card Offers knows, it is never sent to the ticket’s codes', async () => {
    for (const lookUp of [async () => ({ found: false }), () => Promise.reject(new SinkError('forbidden', 'refused', 403, 'FORBIDDEN'))] as Desk['lookUp'][]) {
      const desk = standIn({ lookUp });
      connect(desk);
      s().tapTile('croissant');
      await settled();
      await s().applyCode('gc-NOSUCHCARD00');
      expect(desk.calls.filter((c) => c.ref === 'ticket_codes')).toEqual([]);
      expect(s().codeSaid?.ok).toBe(false);
      expect(s().codeSaid!.words).not.toMatch(/NOSUCHCARD/i);
    }
  });

  it('an ordinary code still goes to Offers when the look-up is only refused', async () => {
    const desk = standIn({ lookUp: () => Promise.reject(new SinkError('forbidden', 'refused', 403, 'FORBIDDEN')) });
    connect(desk);
    s().tapTile('croissant');
    await settled();
    await s().applyCode('AUTUMN5');
    expect(desk.calls.filter((c) => c.ref === 'ticket_codes').map((c) => c.values!['typed'])).toEqual(['AUTUMN5']);
  });
});

describe('figures from a write’s reply', () => {
  it('are not put back by a read of the ticket that began before them and lands after', async () => {
    let answerOld!: (row: SinkRow) => void;
    let slow = false;
    const after: SinkRow = { ...TICKET, discount: '9.00', net: '81.00', tax: '6.68', total: '87.68', due: '87.68' };
    const desk = standIn({
      one: () => (slow ? new Promise<SinkRow>((resolve) => (answerOld = resolve)) : Promise.resolve(TICKET)),
      patch: async () => ({ data: after, applied: [{ name: 'Staff · Goodwill', kind: 'staff', amount: '9.00' }] }),
    });
    connect(desk);
    s().tapTile('croissant');
    await settled();
    expect(s().ticket.server?.total).toBe(97.43);
    // A read begins…
    slow = true;
    const reading = s().refreshTicket();
    await Promise.resolve();
    // …a discount is given and answered with the new figures…
    expect(await s().giveDiscount('pct', 10, '10% off', '2')).toBeNull();
    expect(s().ticket.server?.total).toBe(87.68);
    // …and the read lands with what the ticket was before.
    answerOld(TICKET);
    await reading;
    expect(s().ticket.server?.total).toBe(87.68);
    expect(s().ticket.server?.applied).toEqual([{ name: 'Staff · Goodwill', kind: 'staff', amount: 9 }]);
  });
});
