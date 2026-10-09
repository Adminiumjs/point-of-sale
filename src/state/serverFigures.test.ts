/**
 * ADMINIUM DECIDES THE FIGURES; THE TILL SHOWS AN ESTIMATE UNTIL THEY ARE IN.
 *
 * The store over a memory sink (the outbox's writes, in order) and a stand-in
 * desk (the doors that are never queued: a ticket read, a dry run, a code, a
 * gift card). What the desk answers is what the screens then show — the
 * figures here are deliberately not what the till's own arithmetic would give,
 * so a pass can only mean the server's answer was the one used.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setDesk, type Desk, type DeskReply } from '../data/desk';
import { SinkError, memorySink, type DataSink, type MemorySink, type SinkRow } from '../data/sink';
import { NO_FEATURES } from '../features';
import type { PastSale } from '../data/types';
import { isEstimate, payDue, regTotal, remaining, tipFor } from './calc';
import { cardPrints, dropCardPrint } from './cardPrints';
import { cardState, foldApplied, isOffline, nameOf, partPaidBefore, showsEstimate, usePos } from './store';
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

/** A ticket's row as Adminium answers it: every figure its own. */
const TICKET: SinkRow = { id: 1, status: 'open', tax_rate_bp: 825, subtotal: '90.00', goods: '90.00', own_discount: '0.00', discount: '5.00', net: '85.00', tax: '7.01', total: '92.01', due: '92.01', paid: '0.00' };

interface Call {
  op: string;
  ref: string;
  id?: unknown;
  values?: SinkRow;
  children?: unknown;
}

function standIn(over: Partial<Desk> = {}, ticket: () => SinkRow = () => TICKET): Desk & { calls: Call[] } {
  const calls: Call[] = [];
  const reply = (data: SinkRow = {}): DeskReply => ({ data });
  const desk: Desk & { calls: Call[] } = {
    calls,
    one: async (ref, id) => {
      calls.push({ op: 'one', ref, id });
      return ticket();
    },
    rows: async (ref) => {
      calls.push({ op: 'rows', ref });
      return [];
    },
    create: async (ref, values, children) => {
      calls.push({ op: 'create', ref, values, children });
      return reply(values);
    },
    patch: async (ref, id, values) => {
      calls.push({ op: 'patch', ref, id, values });
      return reply(values);
    },
    dryCreate: async (ref, values, children) => {
      calls.push({ op: 'dryCreate', ref, values, children });
      return reply(values);
    },
    dryUpdate: async (ref, id, values) => {
      calls.push({ op: 'dryUpdate', ref, id, values });
      return reply(values);
    },
    oneByOne: async () => ({ results: [], notRun: 0 }),
    lookUp: async () => ({ found: false }),
    stockWords: async () => [],
    cardPrintUrl: async () => '/api/v1/documents/print-once/a-ticket',
    ...over,
  };
  // Recorded even when a test answers the call itself.
  for (const op of ['create', 'patch', 'dryCreate', 'dryUpdate'] as const) {
    const given = over[op];
    if (given === undefined) continue;
    (desk as unknown as Record<string, unknown>)[op] = async (...args: unknown[]) => {
      calls.push({ op, ref: args[0] as string, ...(op === 'create' || op === 'dryCreate' ? { values: args[1] as SinkRow, children: args[2] } : { id: args[1], values: args[2] as SinkRow }) });
      return (given as (...a: unknown[]) => Promise<DeskReply>)(...args);
    };
  }
  return desk;
}

const refusal = (code: string, details: Record<string, unknown> = {}, status = 409) => new SinkError('no', 'refused', status, code, null, details);

const connect = (desk: Desk, features: Partial<typeof NO_FEATURES> = {}, more: Partial<ReturnType<typeof usePos.getState>> = {}) => {
  setDesk(desk);
  usePos.setState({ connected: true, features: { ...NO_FEATURES, ...features }, ...more });
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

describe('the estimate, and the swap to Adminium’s figures', () => {
  it('shows the till’s estimate, labelled, while a change is unsaved — then the server’s figures', async () => {
    const desk = standIn();
    connect(desk);
    s().tapTile('croissant');
    // Unsaved: the till's own arithmetic, and the screens say so.
    expect(s().ticketBusy).toBe(true);
    expect(showsEstimate(s())).toBe(true);
    expect(isEstimate(s())).toBe(true);
    expect(regTotal(s())).toBeCloseTo(4.11, 2);
    await settled();
    // Saved: one read of the ticket, and its figures are the ones on screen.
    expect(desk.calls.filter((c) => c.op === 'one')).toEqual([{ op: 'one', ref: 'tickets', id: 1 }]);
    expect(showsEstimate(s())).toBe(false);
    expect(s().ticket.server).toMatchObject({ subtotal: 90, discount: 0, net: 85, tax: 7.01, total: 92.01, due: 92.01 });
    expect(regTotal(s())).toBe(92.01);
    expect(remaining(s())).toBe(92.01);
  });

  it('takes a tip preset as a percent of the server’s net', async () => {
    connect(standIn());
    s().tapTile('croissant');
    await settled();
    // 10 % of Adminium's $85.00, not of the till's own $3.80.
    expect(tipFor(s(), 1)).toBe(8.5);
  });

  it('drops the server’s figures the moment the ticket changes again', async () => {
    connect(standIn());
    s().tapTile('croissant');
    await settled();
    expect(s().ticket.server).toBeDefined();
    s().inc(s().ticket.items[0]!.key);
    expect(s().ticket.server).toBeUndefined();
    expect(showsEstimate(s())).toBe(true);
    await settled();
    expect(showsEstimate(s())).toBe(false);
  });

  it('with Offers the reduction is the whole of it, and its lines are Offers’ own rows, folded', async () => {
    const desk = standIn({
      rows: async (ref) =>
        ref === 'offers:applied'
          ? [
              { name: { 'en-US': 'Voucher · One croissant' }, kind: 'voucher', amount: '2.00' },
              { name: { 'en-US': 'Voucher · One croissant' }, kind: 'voucher', amount: '1.80' },
              { name: { 'en-US': 'Staff · Goodwill' }, kind: 'staff', amount: '1.20' },
            ]
          : ref === 'ticket_codes'
            ? [{ id: 7, typed: 'AUTUMN5' }]
            : [],
    });
    connect(desk, { offers: true, 'gift-cards': true });
    s().tapTile('croissant');
    await settled();
    expect(s().ticket.server!.discount).toBe(5);
    expect(s().ticket.server!.applied).toEqual([
      { name: 'Voucher · One croissant', kind: 'voucher', amount: 3.8 },
      { name: 'Staff · Goodwill', kind: 'staff', amount: 1.2 },
    ]);
    expect(s().ticket.codes).toEqual([{ id: '7', typed: 'AUTUMN5' }]);
  });

  it('is never labelled in the demo, which has no server: its estimate is its figures', async () => {
    s().tapTile('croissant');
    await settled();
    expect(s().connected).toBe(false);
    expect(showsEstimate(s())).toBe(false);
    expect(s().ticket.server).toBeUndefined();
    expect(regTotal(s())).toBeCloseTo(4.11, 2);
  });
});

describe('offline', () => {
  it('keeps the label, and neither a code nor a gift card is tried', async () => {
    const desk = standIn();
    connect(desk, { offers: true, 'gift-cards': true }, { cardsMoved: true });
    s().tapTile('croissant');
    await settled();
    usePos.setState({ online: false });
    expect(isOffline(s())).toBe(true);
    const before = desk.calls.length;
    await s().applyCode('AUTUMN5');
    // Said under the field it was typed in, not in a toast.
    expect(s().codeSaid).toEqual({ ok: false, words: 'Codes need a connection' });
    await s().quoteCard('GC-7K2MW3HNQ4XP');
    expect(s().cardPayWords).toBe('A gift card needs a connection');
    expect(s().cardPay).toBeNull();
    expect(await s().giveDiscount('pct', 10, '10% off', '3')).toBe('Discounts need a connection');
    expect(desk.calls.length).toBe(before);
  });

  it('a write waiting to try again leaves the figures an estimate', async () => {
    connect(standIn());
    sink.failNext(new SinkError('down', 'offline', 0, 'NETWORK'), 1);
    s().tapTile('croissant');
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s().sync.retrying).toBe(true);
    expect(isOffline(s())).toBe(true);
    expect(showsEstimate(s())).toBe(true);
  });
});

describe('the register’s Pay button', () => {
  it('asks for the total until a payment is saved, then for what Adminium says is still owing', async () => {
    let row: SinkRow = TICKET;
    connect(standIn({}, () => row));
    s().tapTile('croissant');
    await settled();
    expect([regTotal(s()), payDue(s())]).toEqual([92.01, 92.01]);
    // A gift card paid $19.00 of it (on this till, or before a reload): the ticket's own row says what is left.
    row = { ...TICKET, paid: '19.00', due: '73.01' };
    await s().refreshTicket();
    expect([regTotal(s()), payDue(s())]).toEqual([92.01, 73.01]);
  });
});

describe('a reduction’s name', () => {
  it('is read by locale whether it came as an object or — from an engine that keeps JSON as text — as the text of one', () => {
    const byLocale = { 'en-US': 'Croissants, a tenth off', 'de-DE': 'Croissants, ein Zehntel weniger' };
    expect(nameOf(byLocale)).toBe('Croissants, a tenth off');
    expect(nameOf(JSON.stringify(byLocale))).toBe('Croissants, a tenth off');
    expect(nameOf('Staff · Goodwill')).toBe('Staff · Goodwill');
    // Text that only looks like an object is shown as it is.
    expect(nameOf('{half off}')).toBe('{half off}');
    // Offers keeps a row per line an offer touched: folded into one line under the one name.
    expect(foldApplied([{ name: JSON.stringify(byLocale), kind: 'offer', amount: '0.38' }, { name: byLocale, kind: 'offer', amount: '0.38' }])).toEqual([{ name: 'Croissants, a tenth off', kind: 'offer', amount: 0.76 }]);
  });
});

describe('a ticket opened before the update', () => {
  it('is marked, cannot be paid, and its lines move to a new ticket with their quantity and price', async () => {
    connect(standIn({}, () => ({ ...TICKET, tax_rate_bp: null })));
    s().tapTile('croissant');
    s().tapTile('croissant');
    await settled();
    expect(s().ticket.rateless).toBe(true);
    s().openPay();
    expect(s().view).toBe('register');
    expect(s().toast?.msg).toBe('Opened before the update');

    const old = s().ticket.rid;
    const before = sink.calls.length;
    s().carryOver();
    await settled();
    const calls = sink.calls.slice(before);
    expect(calls.map((c) => `${c.op} ${c.ref}`)).toEqual(['insert tickets', 'update ticket_items', 'update tickets']);
    // qty and unit_price are sent again: a line that only changed hands would be missing from the new ticket's goods.
    expect(calls[1]!.values).toEqual({ ticket_id: 2, qty: 2, unit_price: 3.8 });
    expect(calls[2]).toMatchObject({ id: 1, values: { status: 'void', merged_into_id: 2 } });
    expect(s().ticket.rid).not.toBe(old);
    expect(s().ticket.items).toHaveLength(1);
  });

  it('one that already holds payments has no button: its money cannot move, and nothing is written', async () => {
    const desk = standIn({ rows: async (ref) => (ref === 'payments' ? [{ id: 'p1', ticket_id: 1, method: 'cash', amount: '5.00' }] : []) }, () => ({ ...TICKET, tax_rate_bp: null }));
    connect(desk);
    s().tapTile('croissant');
    await settled();
    expect([s().ticket.rateless, s().ticket.partPaid, partPaidBefore(s())]).toEqual([true, true, true]);
    const before = sink.calls.length;
    s().carryOver();
    await settled();
    expect(sink.calls.length).toBe(before);
    expect(s().toast?.msg).toBe('This ticket was part-paid before the update · A manager finishes it from the dashboard');
  });

  it('one with nothing paid on it is known as such only once Adminium has answered', async () => {
    connect(standIn({}, () => ({ ...TICKET, tax_rate_bp: null })));
    s().tapTile('croissant');
    await settled();
    expect([s().ticket.partPaid, partPaidBefore(s())]).toEqual([false, false]);
    // Until the answer is in, the button is not offered.
    expect(partPaidBefore({ ticket: { ...s().ticket, partPaid: undefined }, splits: [] })).toBe(true);
  });

  it('a close refused for want of a rate marks the ticket rather than printing a receipt', async () => {
    // A read that does not carry the rate at all: the refusal is what says so.
    const { tax_rate_bp: _rate, ...bare } = TICKET;
    connect(standIn({}, () => bare));
    const closing: DataSink = {
      insert: (ref, values, children) => sink.insert(ref, values, children),
      remove: (ref, id) => sink.remove(ref, id),
      update: (ref, id, patch) => (patch['status'] === 'paid' ? Promise.reject(refusal('STATE_MOVE_REFUSED', { requires: 'tax_rate_bp' })) : sink.update(ref, id, patch)),
    };
    setSink(closing);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '100', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().lastSale).toBeNull();
    expect(s().ticket.rateless).toBe(true);
    expect(s().view).toBe('register');
  });
});

describe('closing a ticket', () => {
  it('a close refused with something owing re-reads the ticket and says what is owing — no receipt', async () => {
    let due = '92.01';
    connect(standIn({}, () => ({ ...TICKET, due })));
    const closing: DataSink = {
      insert: (ref, values, children) => sink.insert(ref, values, children),
      remove: (ref, id) => sink.remove(ref, id),
      update: (ref, id, patch) => (patch['status'] === 'paid' ? Promise.reject(refusal('STATE_MOVE_REFUSED', { requires: 'due' })) : sink.update(ref, id, patch)),
    };
    setSink(closing);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '92.01', tip: 0 });
    due = '12.00';
    s().onCharge();
    await settled();
    expect(s().view).toBe('payment');
    expect(s().lastSale).toBeNull();
    expect(s().ticket.server?.due).toBe(12);
    expect(s().toast?.msg).toBe('$12.00 is still to pay');
    // What was paid stays on the ledger.
    expect(s().splits).toHaveLength(1);
  });

  it('prints the figures Adminium closed the sale with', async () => {
    connect(standIn());
    const closing: DataSink = {
      insert: (ref, values, children) => sink.insert(ref, values, children),
      remove: (ref, id) => sink.remove(ref, id),
      update: async (ref, id, patch) => (patch['status'] === 'paid' ? { ...TICKET, status: 'paid', due: '0.00', charged: '92.01' } : sink.update(ref, id, patch)),
    };
    setSink(closing);
    s().tapTile('croissant');
    await settled();
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '100', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('complete');
    expect(s().lastSale).toMatchObject({ subtotal: 90, tax: 7.01, total: 92.01 });
    expect(s().lastSale!.estimate).toBeUndefined();
  });

  it('will not take money while the total is still on its way', async () => {
    connect(standIn());
    s().tapTile('croissant');
    await settled();
    s().openPay();
    s().inc(s().ticket.items[0]!.key);
    usePos.setState({ payMethod: 'cash', cash: '100' });
    const before = sink.calls.length;
    s().onCharge();
    expect(s().toast?.msg).toBe('The total is on its way');
    await settled();
    expect(sink.calls.slice(before).some((c) => c.ref === 'payments')).toBe(false);
  });
});

describe('Offers on the ticket', () => {
  const OFFERS = { offers: true, 'gift-cards': true } as const;

  it('tries a staff discount before saving it, and shows Adminium’s answer', async () => {
    const desk = standIn({
      dryUpdate: async () => ({ data: { ...TICKET, discount: '8.78', net: '44.82', tax: '3.70', total: '48.52' }, applied: [{ name: 'Staff · Goodwill', kind: 'staff', amount: '4.98' }] }),
    });
    connect(desk, OFFERS);
    s().tapTile('croissant');
    await settled();
    const preview = await s().previewDiscount('pct', 10, '3');
    expect(preview).toEqual({ ok: true, discount: 8.78, tax: 3.7, total: 48.52, applied: [{ name: 'Staff · Goodwill', kind: 'staff', amount: 4.98 }] });
    const dry = desk.calls.find((c) => c.op === 'dryUpdate')!;
    expect(dry).toMatchObject({ ref: 'tickets', id: 1, values: { discount_kind: 'percent', discount_value: 10, discount_reason_id: 3 } });
    // Nothing was saved by the try.
    expect(desk.calls.some((c) => c.op === 'patch')).toBe(false);
  });

  it('says a refused discount in plain words', async () => {
    const over = refusal('ADJUST_REFUSED', { reason: 'over-ceiling', max: 10 });
    connect(standIn({ dryUpdate: () => Promise.reject(over), patch: () => Promise.reject(over) }), OFFERS);
    s().tapTile('croissant');
    await settled();
    expect(await s().previewDiscount('pct', 20, '3')).toEqual({ ok: false, words: 'You can give up to 10 % · Ask a manager' });
    expect(await s().giveDiscount('pct', 20, '20% off', '3')).toBe('You can give up to 10 % · Ask a manager');
    expect(s().discount).toBeNull();
  });

  it('taking a discount off that is not yours to take off asks for a manager', async () => {
    connect(standIn({ patch: () => Promise.reject(refusal('ADJUST_REFUSED', { reason: 'not-allowed' })) }), OFFERS);
    s().tapTile('croissant');
    usePos.setState({ discount: { kind: 'pct', value: 30, label: '30% off' } });
    await settled();
    s().clearDiscount();
    await settled();
    expect(s().toast?.msg).toBe('Ask a manager to sign in');
    expect(s().discount).not.toBeNull();
  });

  it('saves a typed code under the ticket, and says when a better offer won', async () => {
    const desk = standIn({ create: async (_ref, values) => ({ data: values, told: [{ note: 'better-offer-applied', name: '20 % for regulars' }] }) });
    connect(desk, OFFERS);
    s().tapTile('croissant');
    await settled();
    await s().applyCode(' REGULAR20 ');
    expect(desk.calls.find((c) => c.op === 'create')).toMatchObject({ ref: 'ticket_codes', values: { ticket_id: 1, typed: 'REGULAR20' } });
    expect(s().codeSaid).toEqual({ ok: true, words: 'A better offer was applied: 20 % for regulars' });
  });

  it('a code for a named customer asks for one on the ticket, and is tried again once a member is on it', async () => {
    let named = false;
    const desk = standIn({ create: async (_ref, values) => (named ? { data: values } : Promise.reject(refusal('ADJUST_REFUSED', { column: 'typed', reason: 'needs-customer' }))) });
    connect(desk, OFFERS);
    s().tapTile('croissant');
    await settled();
    await s().applyCode('WELCOME10');
    expect(s().codeAsk).toEqual({ typed: 'WELCOME10', noEmail: false });
    named = true;
    usePos.setState({ members: { '9': { id: '9', memberNo: null, name: 'Ama Boateng', mobile: null, email: 'ama@till-members.dev', joinedAt: 0, points: 0, lifetime: 0, visits: 0 } } });
    s().attachMember('9');
    await settled();
    expect(desk.calls.filter((c) => c.op === 'create' && c.ref === 'ticket_codes')).toHaveLength(2);
    expect(s().codeAsk).toBeNull();
    // The member's own save went first.
    expect(sink.calls.some((c) => c.op === 'update' && c.ref === 'tickets' && c.values!['customer_id'] === 9)).toBe(true);
  });

  it('a member with no email is asked for one', async () => {
    connect(standIn({ create: () => Promise.reject(refusal('ADJUST_REFUSED', { reason: 'needs-customer' })) }), OFFERS);
    s().tapTile('croissant');
    usePos.setState((st) => ({ ticket: { ...st.ticket, customerId: '9' } }));
    await settled();
    await s().applyCode('WELCOME10');
    expect(s().codeAsk).toEqual({ typed: 'WELCOME10', noEmail: true });
  });

  it('takes a code off by stamping its row, never by deleting it', async () => {
    const desk = standIn();
    connect(desk, OFFERS);
    s().tapTile('croissant');
    await settled();
    await s().removeCode('7');
    const patch = desk.calls.find((c) => c.op === 'patch')!;
    expect(patch).toMatchObject({ ref: 'ticket_codes', id: '7' });
    expect(Object.keys(patch.values!)).toEqual(['removed_at']);
  });

  it('a scanner burst that is no item’s barcode is tried as a code', async () => {
    const desk = standIn();
    connect(desk, OFFERS);
    s().tapTile('croissant');
    await settled();
    s().scanCode('AUTUMN5');
    await settled();
    expect(desk.calls.find((c) => c.op === 'create')).toMatchObject({ ref: 'ticket_codes', values: { typed: 'AUTUMN5' } });
  });

  it('with Offers attached but unable to answer, a refused line says so', async () => {
    connect(standIn(), OFFERS);
    sink.failNext(new SinkError('no', 'refused', 409, 'POSTING_REFUSED', null, { reason: 'add-on-unavailable' }), 1);
    s().tapTile('croissant');
    await settled();
    expect(s().toast?.msg).toBe('Offers can’t answer right now, so this can’t be saved. Ask the owner.');
  });
});

describe('gift cards kept by Offers', () => {
  const MOVED = { offers: true, 'gift-cards': true } as const;

  it('knows its three states', () => {
    expect(cardState({ features: NO_FEATURES, cardsMoved: false })).toBe(1);
    expect(cardState({ features: { ...NO_FEATURES, ...MOVED }, cardsMoved: false })).toBe(2);
    expect(cardState({ features: { ...NO_FEATURES, ...MOVED }, cardsMoved: true })).toBe(3);
  });

  it('asks what the card covers, then takes exactly that — and never names an amount', async () => {
    const desk = standIn({
      dryCreate: async () => ({ data: {}, payment: { amount: '18.60', due: '0.00' } }),
      create: async (_ref, values) => ({ data: { ...values, card_amount: '18.60', card_last4: 'Q4XP', card_balance_after: '31.40' }, payment: { amount: '18.60', due: '0.00' } }),
    });
    connect(desk, MOVED, { cardsMoved: true });
    s().tapTile('croissant');
    await settled();
    s().openPay();
    await s().quoteCard('GC-7K2MW3HNQ4XP');
    expect(s().cardPay).toEqual({ code: 'GC-7K2MW3HNQ4XP', covers: 18.6, due: 0 });
    const dry = desk.calls.find((c) => c.op === 'dryCreate')!;
    expect(dry.ref).toBe('payments');
    expect(dry.values).toMatchObject({ ticket_id: 1, method: 'gift_card', card_code: 'GC-7K2MW3HNQ4XP' });
    expect(Object.keys(dry.values!)).not.toContain('amount');

    usePos.setState({ payMethod: 'gift_card' });
    s().onCharge();
    await settled();
    const paid = desk.calls.find((c) => c.op === 'create')!;
    expect(paid.ref).toBe('payments');
    expect(Object.keys(paid.values!).sort()).toEqual(['card_code', 'id', 'method', 'staff_id', 'ticket_id']);
    // Nothing owing after it: the ticket closes, and the receipt says what the card has left.
    expect(s().view).toBe('complete');
    expect(s().lastSale!.cardBalances).toEqual([{ last4: 'Q4XP', left: 31.4 }]);
    // The till wrote nothing to its own card tables.
    expect(sink.calls.some((c) => c.ref === 'gift_card_ledger' || c.ref === 'gift_cards')).toBe(false);
  });

  it('leaves the rest for another payment when the card does not cover it all', async () => {
    const desk = standIn({
      dryCreate: async () => ({ data: {}, payment: { amount: '10.00', due: '82.01' } }),
      create: async (_ref, values) => ({ data: { ...values, card_amount: '10.00', card_last4: 'Q4XP', card_balance_after: '0.00' }, payment: { amount: '10.00', due: '82.01' } }),
    });
    connect(desk, MOVED, { cardsMoved: true });
    s().tapTile('croissant');
    await settled();
    s().openPay();
    await s().quoteCard('GC-7K2MW3HNQ4XP');
    await s().payCard();
    await settled();
    expect(s().view).toBe('payment');
    expect(s().splits).toMatchObject([{ method: 'gift_card', amount: 10, reference: 'Q4XP', cardLeft: 0 }]);
    expect(s().lastSale).toBeNull();
  });

  it('says why a card cannot pay', async () => {
    connect(standIn({ dryCreate: () => Promise.reject(refusal('POSTING_REFUSED', { reason: 'empty' })) }), MOVED, { cardsMoved: true });
    s().tapTile('croissant');
    await settled();
    await s().quoteCard('GC-7K2MW3HNQ4XP');
    expect(s().cardPayWords).toBe('This card is empty');
    expect(s().cardPay).toBeNull();
  });

  it('a typed gift card is kept for Payment, not saved as a code', async () => {
    const desk = standIn({ lookUp: async () => ({ found: true, kind: 'gift-card', last4: 'Q4XP', record: { status: 'active', balance: '31.40' } }) });
    connect(desk, MOVED, { cardsMoved: true });
    s().tapTile('croissant');
    await settled();
    await s().applyCode('GC-7K2MW3HNQ4XP');
    expect(s().ticket.card).toEqual({ code: 'GC-7K2MW3HNQ4XP', last4: 'Q4XP', balance: 31.4 });
    expect(desk.calls.some((c) => c.op === 'create')).toBe(false);
  });

  it('sells a new card as a line that names it by its last four; the receipt lists it, and it waits to be printed', async () => {
    const desk = standIn({ create: async (ref, values) => (ref === 'offers:gift_cards' ? { data: { id: 41, kind: 'card', label: 'D9ZZ' }, once: [{ column: 'code', key: '41', print: 'ticket-that-prints-card-41' }] } : { data: values }) });
    connect(desk, MOVED, { cardsMoved: true });
    expect(await s().sellCard(50)).toBe(true);
    await settled();
    const line = sink.calls.find((c) => c.ref === 'ticket_items')!;
    expect(line.values).toMatchObject({ name: 'Gift card ···· D9ZZ', qty: 1, unit_price: 50, card_id: 41, menu_item_id: null });
    expect(Object.keys(line.values!)).not.toContain('gift_card_id');
    // Not paid yet: nothing is on the card, so there is nothing to print.
    expect(s().cardPrints.map((one) => [one.cardId, one.paid])).toEqual([['41', false]]);
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '200', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().lastSale!.newCards).toEqual([{ cardId: '41', last4: 'D9ZZ', amount: 50 }]);
    expect(s().cardPrints.map((one) => [one.cardId, one.paid])).toEqual([['41', true]]);
    // Adminium loads the card when the ticket is paid: the till writes no ledger row.
    expect(sink.calls.some((c) => c.ref === 'gift_card_ledger')).toBe(false);
  });

  it('a new card whose line is taken off the ticket has nothing left to print', async () => {
    const desk = standIn({ create: async (ref, values) => (ref === 'offers:gift_cards' ? { data: { id: 42, label: 'K7QP' }, once: [{ column: 'code', print: 'ticket-42' }] } : { data: values }) });
    connect(desk, MOVED, { cardsMoved: true });
    expect(await s().sellCard(25)).toBe(true);
    await settled();
    expect(s().cardPrints).toHaveLength(1);
    s().removeKey('gift:42');
    expect(s().cardPrints).toEqual([]);
  });

  it('tops up a card the customer holds: looked up by its code, sold as a line that names the card', async () => {
    const desk = standIn({ lookUp: async () => ({ found: true, kind: 'gift-card', table: 'gift_cards', key: '2', last4: '2HVT', record: { status: 'active', balance: 35.75 } }) });
    connect(desk, MOVED, { cardsMoved: true });
    const found = await s().findCardToTopUp(' GC-M9RD5PTC2HVT ');
    expect(found).toEqual({ cardId: '2', last4: '2HVT', balance: 35.75 });
    if ('words' in found) throw new Error('not found');
    expect(s().topUpCard(found, 25)).toBe(true);
    await settled();
    const line = sink.calls.find((c) => c.ref === 'ticket_items')!;
    expect(line.values).toMatchObject({ name: 'Gift card ···· 2HVT', qty: 1, unit_price: 25, card_id: 2, menu_item_id: null });
    // A top-up makes no card: nothing waits to be printed, and the typed code is kept nowhere.
    expect(desk.calls.some((c) => c.op === 'create')).toBe(false);
    expect(s().cardPrints).toEqual([]);
    expect(JSON.stringify([s().ticket, sink.calls])).not.toContain('GC-M9RD5PTC2HVT');
    // The same card is not put on the ticket twice.
    expect(s().topUpCard(found, 10)).toBe(false);
    expect(s().toast?.msg).toBe('This card is already on the ticket');
  });

  it('a top-up needs a card Offers knows, one that is still good, and a connection', async () => {
    connect(standIn({ lookUp: async () => ({ found: false }) }), MOVED, { cardsMoved: true });
    expect(await s().findCardToTopUp('GC-NOPE')).toEqual({ words: 'No gift card has that code' });
    connect(standIn({ lookUp: async () => ({ found: true, kind: 'code', key: '2' }) }), MOVED, { cardsMoved: true });
    expect(await s().findCardToTopUp('AUTUMN5')).toEqual({ words: 'No gift card has that code' });
    connect(standIn({ lookUp: async () => ({ found: true, kind: 'gift-card', key: '9', last4: 'AAAA', record: { status: 'void', balance: 0 } }) }), MOVED, { cardsMoved: true });
    expect(await s().findCardToTopUp('GC-GONE')).toEqual({ words: 'This card was cancelled' });
    usePos.setState({ online: false });
    expect(await s().findCardToTopUp('GC-7K2MW3HNQ4XP')).toEqual({ words: 'A gift card needs a connection' });
  });

  it('a cashier who may not make a card is told who can', async () => {
    connect(standIn({ create: () => Promise.reject(refusal('FORBIDDEN', {}, 403)) }), MOVED, { cardsMoved: true });
    expect(await s().sellCard(25)).toBe(false);
    expect(s().toast?.msg).toBe('Only someone with the Offers desk role can sell a new card');
    expect(s().ticket.items).toHaveLength(0);
  });

  it('a late write to the closed card tables asks for a reload', async () => {
    connect(standIn(), MOVED, { cardsMoved: false });
    sink.failNext(refusal('RECORD_LOCKED'), 1);
    await s().issueGiftCard();
    await settled();
    expect(s().mustReload).toBe(true);
  });
});

describe('a refund', () => {
  const SALE: PastSale = {
    rid: '77',
    number: 1040,
    table: null,
    closedAt: 0,
    method: 'cash',
    lines: [
      { rid: '701', name: 'Stoneware mug', qty: 2, unit: 14, line: 28, mod: '', refunded: 0 },
      { rid: '702', name: 'Tote bag', qty: 1, unit: 18, line: 18, mod: '', refunded: 0 },
    ],
    subtotal: 46,
    discount: 0,
    tax: 3.8,
    total: 49.8,
    refunded: 0,
    payments: [
      { id: 'pay-cash', method: 'cash', amount: 39.8 },
      { id: 'pay-card', method: 'gift_card', amount: 10, last4: 'Q4XP' },
    ],
  };

  it('is quoted by Adminium, sends no money, and goes back to the payment it names', async () => {
    const desk = standIn({
      dryCreate: async () => ({ data: { amount: '10.00', tax: '0.76' }, refund: { payments: [{ key: 'pay-card', took: '10.00', max: '10.00' }, { key: 'pay-cash', took: '39.80', max: '39.80' }] } }),
    });
    connect(desk, { offers: true, 'gift-cards': true }, { cardsMoved: true });
    s().openRefund();
    s().pickRefundSale(SALE);
    await settled();
    // A card's payment first.
    expect(s().refundPayment).toBe('pay-card');
    expect(s().refundMethod).toBe('gift_card');
    expect(s().refundQuote).toEqual({ amount: 10, tax: 0.76, payments: [{ key: 'pay-card', took: 10, max: 10 }, { key: 'pay-cash', took: 39.8, max: 39.8 }] });
    const dry = desk.calls.find((c) => c.op === 'dryCreate')!;
    expect(dry.ref).toBe('refunds');
    expect(Object.keys(dry.values!).sort()).toEqual(['id', 'method', 'payment_id', 'staff_id', 'ticket_id']);

    await s().processRefund();
    const saved = sink.calls.find((c) => c.ref === 'refunds')!;
    expect(Object.keys(saved.values!).sort()).toEqual(['id', 'method', 'payment_id', 'staff_id', 'ticket_id']);
    expect(saved.values).toMatchObject({ ticket_id: '77', method: 'gift_card', payment_id: 'pay-card' });
    for (const row of saved.children![0]!.rows) expect(Object.keys(row).sort()).toEqual(['id', 'qty', 'ticket_item_id']);
    // The figure on screen is the server's, and the till credits no card of its own.
    expect(s().refundDone).toEqual({ total: 10, count: 2 });
    expect(sink.calls.some((c) => c.ref === 'gift_card_ledger')).toBe(false);
  });

  it('with Inventory in retail, each line says where the thing goes: the shelf unless told otherwise', async () => {
    const desk = standIn({ dryCreate: async () => ({ data: { amount: '49.80', tax: '3.80' } }) });
    connect(desk, { stock: true }, { mode: 'retail' });
    s().pickRefundSale(SALE);
    s().setRefundGoes(1, 'none');
    await settled();
    await s().processRefund();
    const rows = sink.calls.find((c) => c.ref === 'refunds')!.children![0]!.rows;
    expect(rows[0]).toMatchObject({ ticket_item_id: '701', qty: 2, back_to: 'shelf' });
    expect(rows[0]).not.toHaveProperty('not_back_at');
    // Not returned is said both ways.
    expect(rows[1]).toMatchObject({ ticket_item_id: '702', back_to: 'none', not_back_at: expect.any(String) });
  });

  it('in a restaurant nothing goes back on a shelf, and nobody is asked', async () => {
    connect(standIn({ dryCreate: async () => ({ data: { amount: '49.80', tax: '3.80' } }) }), { stock: true }, { mode: 'restaurant' });
    s().pickRefundSale(SALE);
    await settled();
    await s().processRefund();
    for (const row of sink.calls.find((c) => c.ref === 'refunds')!.children![0]!.rows) expect(row).toMatchObject({ back_to: 'none', not_back_at: expect.any(String) });
  });

  it('says why a refund over what the payment took cannot be made', async () => {
    connect(standIn({ dryCreate: () => Promise.reject(refusal('POSTING_REFUSED', { reason: 'refund-over', left: '4.84' })) }), { offers: true, 'gift-cards': true }, { cardsMoved: true });
    s().pickRefundSale(SALE);
    await settled();
    expect(s().refundQuote).toBeNull();
    expect(s().refundWords).toBe('Only $4.84 can go back this way');
    // With no quote there is nothing to issue.
    await s().processRefund();
    expect(sink.calls.some((c) => c.ref === 'refunds')).toBe(false);
  });
});

describe('stock words', () => {
  it('reads them for the tiles shown, and a sale of something out still goes through with a word of warning', async () => {
    const desk = standIn({ stockWords: async (ids) => ids.map((id) => ({ id, state: id === 'croissant' ? ('out' as const) : ('low' as const), exact: id === 'croissant' ? '0' : '3' })) });
    connect(desk, { stock: true });
    await s().loadStock(['croissant', 'muffin']);
    expect(s().stock).toEqual({ croissant: { state: 'out', exact: 0 }, muffin: { state: 'low', exact: 3 } });
    s().tapTile('croissant');
    expect(s().ticket.items).toHaveLength(1);
    expect(s().toast?.msg).toBe('Croissant shows none in stock, and the sale still goes through');
  });

  it('asks nothing without Inventory', async () => {
    let asked = 0;
    connect(standIn({ stockWords: async () => ((asked += 1), []) }));
    await s().loadStock(['croissant']);
    expect(asked).toBe(0);
  });
});
