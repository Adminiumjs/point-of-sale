/**
 * WHAT IS TYPED AND NOT APPLIED IS NEVER DROPPED AT PAY.
 *
 * A code left in the ticket's field when Pay is pressed is applied first:
 * refused, nothing is paid and the field says why; taken, Payment opens on
 * the figures Adminium worked out with it. A gift card typed there is kept
 * for Payment's tab; and one typed in Payment's own field is asked what it
 * covers before any other payment is taken.
 *
 * The store over a memory sink and a stand-in desk, as `serverFigures.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setDesk, type Desk, type DeskReply } from '../data/desk';
import { SinkError, memorySink, type MemorySink, type SinkRow } from '../data/sink';
import { NO_FEATURES } from '../features';
import { chargeTarget, regTotal, remaining } from './calc';
import { showsEstimate, usePos } from './store';
import { outbox, setSink } from './writes';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
let sink: MemorySink;

const settled = async () => {
  for (let i = 0; i < 30; i += 1) {
    await outbox().idle();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const FULL: SinkRow = { id: 1, status: 'open', tax_rate_bp: 825, subtotal: '43.60', goods: '43.60', own_discount: '0.00', discount: '0.76', net: '42.84', tax: '3.53', total: '46.37', due: '46.37', paid: '0.00' };
const WITH_CODE: SinkRow = { ...FULL, discount: '5.76', net: '37.84', tax: '3.12', total: '40.96', due: '40.96' };

interface Call {
  op: string;
  ref: string;
  values?: SinkRow;
}

function standIn(over: Partial<Desk>, ticket: () => SinkRow): Desk & { calls: Call[] } {
  const calls: Call[] = [];
  const reply = (data: SinkRow = {}): DeskReply => ({ data });
  const base: Desk = {
    one: async () => ticket(),
    rows: async () => [],
    create: async (_ref, values) => reply(values),
    patch: async (_ref, _id, values) => reply(values),
    dryCreate: async (_ref, values) => reply(values),
    dryUpdate: async (_ref, _id, values) => reply(values),
    oneByOne: async () => ({ results: [], notRun: 0 }),
    lookUp: async () => ({ found: false }),
    stockWords: async () => [],
    cardPrintUrl: async () => '',
    ...over,
  };
  return {
    ...base,
    calls,
    create: async (ref, values, children) => {
      calls.push({ op: 'create', ref, values });
      return base.create(ref, values, children);
    },
    dryCreate: async (ref, values, children) => {
      calls.push({ op: 'dryCreate', ref, values });
      return base.dryCreate(ref, values, children);
    },
  };
}

const refusal = (code: string, details: Record<string, unknown> = {}) => new SinkError('no', 'refused', 409, code, null, details);
const OFFERS = { offers: true, 'gift-cards': true };

const connect = (desk: Desk, more: Partial<ReturnType<typeof usePos.getState>> = {}) => {
  setDesk(desk);
  usePos.setState({ connected: true, features: { ...NO_FEATURES, ...OFFERS }, cardsMoved: true, ...more });
};

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  setDesk(null);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, view: 'register', cardPrints: [] });
});

afterEach(() => setDesk(null));

describe('a code typed on the ticket and not applied, when Pay is pressed', () => {
  it('is applied first: Payment opens on the total Adminium worked out with it, and that is what is asked', async () => {
    let coded = false;
    const desk = standIn(
      {
        create: async (_ref, values) => {
          coded = true;
          return { data: values, applied: [{ name: '$5.00 off', kind: 'code', amount: '5.00', typed: true }] };
        },
      },
      () => (coded ? WITH_CODE : FULL),
    );
    connect(desk);
    s().tapTile('croissant');
    await settled();
    expect(regTotal(s())).toBe(46.37);

    s().setCodeDraft(' AUTUMN5 ');
    s().openPay();
    // Nothing moves until Offers has answered.
    expect(s().view).toBe('register');
    await settled();

    expect(desk.calls.filter((c) => c.op === 'create')).toMatchObject([{ ref: 'ticket_codes', values: { ticket_id: 1, typed: 'AUTUMN5' } }]);
    expect(s().view).toBe('payment');
    expect(s().codeDraft).toBe('');
    // The server's figures with the code on, not the ones read before it.
    expect(showsEstimate(s())).toBe(false);
    expect(s().ticket.server).toMatchObject({ discount: 5.76, total: 40.96, due: 40.96 });
    expect(remaining(s())).toBe(40.96);
    expect(chargeTarget(s())).toBe(40.96);
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
  });

  it('a code that is taken leaves no figure from before it on screen, even when the new ones do not arrive', async () => {
    let coded = false;
    const desk = standIn(
      {
        create: async (_ref, values) => {
          coded = true;
          return { data: values };
        },
        one: async () => (coded ? Promise.reject(new Error('no answer')) : FULL),
      },
      () => FULL,
    );
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().setCodeDraft('AUTUMN5');
    s().openPay();
    await settled();
    // The old total is gone: what shows is an estimate, labelled, and money waits for the server's.
    expect(s().ticket.server).toBeUndefined();
    expect(showsEstimate(s())).toBe(true);
    s().setMethod('cash');
    s().cashPreset(50);
    s().onCharge();
    await settled();
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
  });

  it('refused: nothing is paid, the cashier stays on the ticket, and the field says why in its own words', async () => {
    const desk = standIn({ create: () => Promise.reject(refusal('ADJUST_REFUSED', { column: 'typed', reason: 'unknown' })) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().setCodeDraft('NOSUCHCODE');
    s().openPay();
    await settled();
    expect(s().view).toBe('register');
    expect(s().codeSaid).toEqual({ ok: false, words: 'No code or voucher matches NOSUCHCODE' });
    // Still in the field, to be put right.
    expect(s().codeDraft).toBe('NOSUCHCODE');
    expect(s().splits).toEqual([]);
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
    expect(regTotal(s())).toBe(46.37);

    // Pressed again with the same refused text still there: it has had its answer, so it is not asked twice, and Pay goes on.
    s().openPay();
    await settled();
    expect(desk.calls.filter((c) => c.ref === 'ticket_codes')).toHaveLength(1);
    expect(s().view).toBe('payment');
    expect(remaining(s())).toBe(46.37);
  });

  it('a refused code put right is tried again', async () => {
    let tries = 0;
    const desk = standIn({ create: async (_ref, values) => ((tries += 1) === 1 ? Promise.reject(refusal('ADJUST_REFUSED', { column: 'typed', reason: 'unknown' })) : { data: values }) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().setCodeDraft('AUTUNM5');
    s().openPay();
    await settled();
    expect(s().view).toBe('register');
    s().setCodeDraft('AUTUMN5');
    s().openPay();
    await settled();
    expect(desk.calls.filter((c) => c.ref === 'ticket_codes').map((c) => c.values!['typed'])).toEqual(['AUTUNM5', 'AUTUMN5']);
    expect(s().view).toBe('payment');
  });

  it('without a connection it is not dropped either: nothing is paid, and the field says a code needs one', async () => {
    connect(standIn({}, () => FULL));
    s().tapTile('croissant');
    await settled();
    usePos.setState({ online: false });
    s().setCodeDraft('AUTUMN5');
    s().openPay();
    await settled();
    expect(s().view).toBe('register');
    expect(s().codeSaid?.ok).toBe(false);
    expect(s().codeDraft).toBe('AUTUMN5');
    // No answer is not a refusal: pressing again asks again, and still nothing is paid past it.
    s().openPay();
    await settled();
    expect(s().view).toBe('register');
  });

  it('a code for a named customer is asked for on the ticket, not paid past', async () => {
    const desk = standIn({ create: () => Promise.reject(refusal('ADJUST_REFUSED', { column: 'typed', reason: 'needs-customer' })) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().setCodeDraft('FIRSTORDER');
    s().openPay();
    await settled();
    expect(s().view).toBe('register');
    expect(s().codeAsk).toEqual({ typed: 'FIRSTORDER', noEmail: false, rid: s().ticket.rid });
  });

  it('a gift card typed there is kept for Payment’s tab: its code is in that field, and no code row is written', async () => {
    const desk = standIn({ lookUp: async () => ({ found: true, kind: 'gift-card', last4: 'Q4XP', record: { status: 'active', balance: '19.00' } }) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().setCodeDraft('GC-7K2MW3HNQ4XP');
    s().openPay();
    await settled();
    expect(desk.calls.some((c) => c.ref === 'ticket_codes')).toBe(false);
    expect(s().ticket.card).toEqual({ code: 'GC-7K2MW3HNQ4XP', last4: 'Q4XP', balance: 19 });
    expect(s().view).toBe('payment');
    expect(s().payMethod).toBe('gift_card');
    expect(s().cardDraft).toBe('GC-7K2MW3HNQ4XP');
    expect(s().codeDraft).toBe('');
    // Nothing is taken from it until it is asked what it covers and used.
    expect(desk.calls.some((c) => c.ref === 'payments')).toBe(false);
  });

  it('with nothing typed, Pay opens Payment as it always did', async () => {
    const desk = standIn({}, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    expect(s().view).toBe('payment');
    expect(s().payMethod).toBe('card');
    expect(desk.calls).toEqual([]);
  });
});

describe('a gift card typed in Payment’s field and not used, when another payment is charged', () => {
  const paysPart: Partial<Desk> = {
    dryCreate: async () => ({ data: {}, payment: { amount: '19.00', due: '27.37' } }),
    create: async (_ref, values) => ({ data: { ...values, card_amount: '19.00', card_last4: 'Q4XP', card_balance_after: '0.00' }, payment: { amount: '19.00', due: '27.37' } }),
  };

  it('is asked what it covers first: the cash is not taken, and the answer is on the gift card tab', async () => {
    const desk = standIn(paysPart, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().setCardDraft('GC-7K2MW3HNQ4XP');
    s().setMethod('cash');
    s().cashPreset(50);
    s().onCharge();
    await settled();
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
    expect(s().splits).toEqual([]);
    expect(s().payMethod).toBe('gift_card');
    expect(s().cardPay).toMatchObject({ code: 'GC-7K2MW3HNQ4XP', covers: 19, due: 27.37 });
    expect(s().toast?.msg).toBe('A gift card is typed in · It was checked first, and nothing was charged');
    expect(desk.calls.map((c) => `${c.op} ${c.ref}`)).toEqual(['dryCreate payments']);

    // Used: the card pays what Adminium said, and the field is empty for the rest.
    s().onCharge();
    await settled();
    expect(desk.calls.map((c) => `${c.op} ${c.ref}`)).toEqual(['dryCreate payments', 'create payments']);
    expect(s().splits).toMatchObject([{ method: 'gift_card', amount: 19, reference: 'Q4XP' }]);
    expect(s().cardDraft).toBe('');
  });

  it('refused: nothing is paid, and the tab says why', async () => {
    const desk = standIn({ dryCreate: () => Promise.reject(refusal('POSTING_REFUSED', { reason: 'empty' })) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().setCardDraft('GC-7K2MW3HNQ4XP');
    s().onCharge();
    await settled();
    expect(s().payMethod).toBe('gift_card');
    expect(s().cardPayWords).toBe('This card is empty');
    expect(s().splits).toEqual([]);
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
  });

  it('typed and never asked, a cash charge stops for it even when it will be refused — and the next cash charge goes through', async () => {
    const desk = standIn({ dryCreate: () => Promise.reject(refusal('POSTING_REFUSED', { reason: 'empty' })) }, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().setCardDraft('GC-7K2MW3HNQ4XP');
    s().setMethod('cash');
    s().cashPreset(20);
    s().onCharge();
    await settled();
    expect(s().payMethod).toBe('gift_card');
    expect(s().cardPayWords).toBe('This card is empty');
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
    s().setMethod('cash');
    s().cashPreset(20);
    s().onCharge();
    await settled();
    expect(sink.calls.filter((c) => c.ref === 'payments')).toHaveLength(1);
  });

  it('once the cashier has the card’s answer the choice is theirs: charging another way then goes through, and the card is not spent', async () => {
    const desk = standIn(paysPart, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().setCardDraft('GC-7K2MW3HNQ4XP');
    await s().quoteCard('GC-7K2MW3HNQ4XP');
    expect(s().cardPay).not.toBeNull();
    s().setMethod('cash');
    s().cashPreset(20);
    s().onCharge();
    await settled();
    expect(desk.calls.map((c) => `${c.op} ${c.ref}`)).toEqual(['dryCreate payments']);
    expect(sink.calls.filter((c) => c.ref === 'payments')).toHaveLength(1);
    expect(s().splits).toMatchObject([{ method: 'cash', amount: 20 }]);
  });

  it('cleared, the other payment goes through', async () => {
    const desk = standIn(paysPart, () => FULL);
    connect(desk);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().setCardDraft('GC-7K2MW3HNQ4XP');
    s().setCardDraft('');
    s().setMethod('cash');
    s().cashPreset(20);
    s().onCharge();
    await settled();
    expect(desk.calls).toEqual([]);
    expect(sink.calls.filter((c) => c.ref === 'payments')).toHaveLength(1);
  });
});
