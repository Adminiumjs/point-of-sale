/**
 * A CARD AT THE TILL THROUGH ADMINIUM, AND A PAY LINK.
 *
 * The store over a memory sink, a stand-in desk and a stand-in of Adminium's
 * reader and link routes, as the till drives them:
 *
 *   - the till's reader takes what is due: the charge is followed until the
 *     payment is in the till's table, then the ticket closes with the tip the
 *     guest chose on the reader — the till's own tip set aside meanwhile;
 *   - a part of the balance goes on the reader, and the rest is cash;
 *   - declined, cancelled, a cancel that lost the race to the card, a reader
 *     busy at another till, no internet: each said, and none closes the
 *     ticket on a payment that was not taken;
 *   - a standalone terminal's slip: both fields required, then a `card`
 *     payment with the approval code and the last four, never a reference;
 *   - the QR tab: the ticket's pay link, closed by Cancel, and the ticket
 *     closed when the guest pays it; "Mark paid" as always while guests
 *     cannot pay online;
 *   - payments off, or no reader for this till: the card tab is a standalone
 *     terminal, and the tip stays the till's.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setDesk, type Desk, type DeskReply } from '../data/desk';
import { setPayDesk, type PayDesk } from '../data/payDesk';
import type { ChargeView, PayLink, TillReader } from '../data/payments';
import { SinkError, memorySink, type DataSink, type MemorySink, type SinkRow } from '../data/sink';
import { remaining, tipAmt } from './calc';
import { usePos } from './store';
import { cardPanel, qrPanel, TIMING } from './tillPay';
import { setSink } from './writes';
import { outbox } from './writes';

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
const until = async (check: () => boolean, label: string) => {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`waited for ${label}`);
};

/** The ticket as Adminium reads it: 24.14 owing until a payment is in. */
const TICKET = (due: string, paid = '0.00'): SinkRow => ({ id: 1, status: 'open', tax_rate_bp: 825, subtotal: '22.30', goods: '22.30', own_discount: '0.00', net: '22.30', tax: '1.84', total: '24.14', due, paid });
const READER: TillReader = { id: 'prd_1', label: 'Front counter', mode: 'live', online: true, lastSeenAt: 0, locationName: null };

interface Ledger {
  due: string;
  payments: SinkRow[];
}

function standInDesk(ledger: Ledger): Desk {
  const reply = (data: SinkRow = {}): DeskReply => ({ data });
  return {
    one: async () => TICKET(ledger.due),
    rows: async (ref, where) => {
      if (ref !== 'payments') return [];
      const w = JSON.stringify(where ?? {});
      const ref_ = /"payment_ref","op":"eq","value":"([^"]+)"/.exec(w)?.[1];
      if (ref_ !== undefined) return ledger.payments.filter((p) => p['payment_ref'] === ref_);
      if (w.includes('not_null')) return ledger.payments.filter((p) => p['payment_ref'] !== null && p['payment_ref'] !== undefined);
      return ledger.payments;
    },
    create: async (_ref, values) => reply(values),
    patch: async (_ref, _id, values) => reply(values),
    dryCreate: async (_ref, values) => reply(values),
    dryUpdate: async (_ref, _id, values) => reply(values),
    oneByOne: async () => ({ results: [], notRun: 0 }),
    lookUp: async () => ({ found: false }),
    stockWords: async () => [],
    cardPrintUrl: async () => '',
  };
}

/** Adminium's reader and link routes, scripted: what each poll answers, and what was asked. */
function standInPay(over: Partial<PayDesk> = {}): PayDesk & { asked: { op: string; args: unknown[] }[] } {
  const asked: { op: string; args: unknown[] }[] = [];
  const base: PayDesk = {
    readers: async () => [READER],
    charge: async () => view('on_reader'),
    charged: async () => view('on_reader'),
    cancel: async () => view('cancelled'),
    payLink: async () => link(),
    closeLink: async () => undefined,
    ...over,
  };
  const spy = <K extends keyof PayDesk>(op: K) =>
    (async (...args: unknown[]) => {
      asked.push({ op, args });
      return (base[op] as (...a: unknown[]) => unknown)(...args);
    }) as PayDesk[K];
  return { asked, readers: spy('readers'), charge: spy('charge'), charged: spy('charged'), cancel: spy('cancel'), payLink: spy('payLink'), closeLink: spy('closeLink') };
}
const view = (state: ChargeView['state'], more: Partial<ChargeView> = {}): ChargeView => ({ attemptId: 'pat_1', state, amount: 24.14, currency: 'USD', tip: null, last4: null, message: null, ...more });
const link = (): PayLink => ({ id: 'plk_1', url: 'https://pay.example/pay/abcdef', mode: 'live', expiresAt: Date.now() + 3_600_000 });

/** A sink that answers the close the way Adminium does: paid once nothing is owing. */
function closingSink(ledger: Ledger): DataSink {
  return {
    insert: (ref, values, children) => sink.insert(ref, values, children),
    remove: (ref, id) => sink.remove(ref, id),
    update: async (ref, id, patch) =>
      patch['status'] === 'paid'
        ? Number(ledger.due) > 0
          ? Promise.reject(new SinkError('owing', 'refused', 409, 'STATE_MOVE_REFUSED'))
          : { ...TICKET('0.00', '24.14'), status: 'paid', charged: (24.14 + Number(patch['tip'] ?? 0)).toFixed(2), tip: patch['tip'] }
        : sink.update(ref, id, patch),
  };
}

let ledger: Ledger;
const connect = (pay: PayDesk, more: Partial<ReturnType<typeof usePos.getState>> = {}) => {
  setDesk(standInDesk(ledger));
  setPayDesk(pay);
  setSink(closingSink(ledger));
  usePos.setState({ connected: true, payments: { on: true, online: false, test: false, refund: true }, readers: [READER], readerId: READER.id, ...more });
};
/** A ticket of 24.14 on the register, on Payment. */
const toPayment = async () => {
  s().tapTile('croissant');
  await settled();
  s().openPay();
  await settled();
};

beforeEach(() => {
  TIMING.poll = 5;
  TIMING.linkPoll = 5;
  TIMING.shown = 5;
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  setDesk(null);
  setPayDesk(null);
  ledger = { due: '24.14', payments: [] };
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, view: 'register', cardPrints: [] });
});
afterEach(() => {
  setDesk(null);
  setPayDesk(null);
});

describe('the till’s card reader', () => {
  it('takes what is due, follows the charge until the payment is in, and closes the ticket with the reader’s tip', async () => {
    let polls = 0;
    const pay = standInPay({
      charged: async () => {
        polls += 1;
        if (polls < 3) return view('on_reader');
        // The reader took it: Adminium writes the payment into the till's table, tip beside it.
        if (ledger.payments.length === 0) {
          ledger.payments.push({ id: 'p-reader', ticket_id: 1, method: 'online', amount: '24.14', tip: '3.35', payment_ref: 'pat_1', payment_last4: '4242', paid_with: 'Visa ••4242', approval_code: 'DEMO01' });
          ledger.due = '0.00';
        }
        return view('paid', { tip: 3.35, last4: '4242' });
      },
    });
    connect(pay);
    // The guest chose a tip on the display; the reader asks for its own.
    usePos.setState({ tip: 2 });
    await toPayment();
    expect(cardPanel(s())).toBe('reader');
    expect(tipAmt(s())).toBe(0);
    expect(s().tipBefore).toEqual({ tip: 2, tipCustom: '' });
    expect(remaining(s())).toBe(24.14);

    s().onCharge();
    await until(() => s().charge?.phase === 'on_reader', 'the reader to hold the amount');
    // The whole balance: no amount named, Adminium reads what is due itself.
    expect(pay.asked.find((a) => a.op === 'charge')!.args).toEqual([1, 'prd_1', null]);
    await until(() => s().view === 'complete', 'the sale to close');
    expect(s().lastSale).toMatchObject({ tip: 3.35, total: 27.49 });
    expect(s().lastSale!.splits).toEqual([{ method: 'card', via: 'reader', amount: 27.49, tip: 3.35, reader: 'Front counter', id: 'p-reader', last4: '4242', paidWith: 'Visa ••4242' }]);
    // The till wrote no payment of its own: Adminium did.
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);
    // And the next guest's tip is theirs again.
    expect(s().tipBefore).toBeNull();
    expect(s().charge).toBeNull();
  });

  it('puts a part on the reader, and the rest is cash', async () => {
    const pay = standInPay({
      charge: async () => view('on_reader', { amount: 12.07 }),
      charged: async () => {
        if (ledger.payments.length === 0) {
          ledger.payments.push({ id: 'p-half', ticket_id: 1, method: 'online', amount: '12.07', tip: '2.00', payment_ref: 'pat_1', payment_last4: '4242' });
          ledger.due = '12.07';
        }
        return view('paid', { amount: 12.07, tip: 2 });
      },
    });
    connect(pay);
    await toPayment();
    s().setSplitFraction(0.5);
    s().onCharge();
    await until(() => s().splits.length === 1 && s().charge === null, 'the reader’s part');
    expect(pay.asked.find((a) => a.op === 'charge')!.args).toEqual([1, 'prd_1', '12.07']);
    expect(s().splits[0]).toMatchObject({ via: 'reader', amount: 14.07, tip: 2 });
    await settled();
    // What is left is the goods' balance.
    expect(remaining(s())).toBe(12.07);
    expect(s().view).toBe('payment');
  });

  it('says a declined card, a cancel and a busy reader, and closes nothing', async () => {
    let answer: ChargeView = view('declined');
    connect(standInPay({ charged: async () => answer }));
    await toPayment();
    s().onCharge();
    await until(() => s().charge?.phase === 'declined', 'the decline');
    expect(s().view).toBe('payment');

    // Try again: a new charge, then the cashier cancels it on the till.
    answer = view('on_reader');
    s().onCharge();
    await until(() => s().charge?.phase === 'on_reader', 'the second charge');
    s().cancelCharge();
    answer = view('cancelled');
    await until(() => s().charge?.phase === 'cancelled', 'the cancel');
    expect(s().view).toBe('payment');
    expect(s().splits).toEqual([]);

    // Another till holds the reader.
    setPayDesk(standInPay({ charge: async () => Promise.reject(new SinkError('busy', 'refused', 409, 'CONFLICT', null, { reason: 'reader-busy' })) }));
    s().onCharge();
    await until(() => s().charge?.phase === 'busy', 'the busy reader');
  });

  it('a cancel that lost the race to the card is a payment, and it is recorded', async () => {
    let tapped = false;
    const pay = standInPay({
      charged: async () => (tapped ? view('paid', { tip: 0 }) : view('on_reader')),
      cancel: async () => {
        tapped = true;
        ledger.payments.push({ id: 'p-race', ticket_id: 1, method: 'online', amount: '24.14', tip: '0.00', payment_ref: 'pat_1', payment_last4: '4242' });
        ledger.due = '0.00';
        return view('paid');
      },
    });
    connect(pay);
    await toPayment();
    s().onCharge();
    await until(() => s().charge?.phase === 'on_reader', 'the charge');
    s().cancelCharge();
    await until(() => s().charge?.race === true, 'the race');
    await until(() => s().view === 'complete', 'the sale to close');
    expect(s().lastSale!.splits[0]).toMatchObject({ via: 'reader', amount: 24.14 });
  });

  it('without the internet the reader is refused, and the cashier is sent to a standalone terminal', async () => {
    connect(standInPay());
    await toPayment();
    usePos.setState({ online: false });
    s().onCharge();
    expect(s().charge?.phase).toBe('nonet');
    s().useTerminal();
    await settled();
    expect(cardPanel(s())).toBe('terminal');
    // The till's tip is the till's again on a standalone terminal.
    expect(s().tipBefore).toBeNull();
  });

  it('a ticket the reader paid while the till was away only closes: nothing is charged again', async () => {
    const pay = standInPay();
    connect(pay);
    await toPayment();
    // Read back after a reload: the reader's payment is on the ticket, and nothing is owing.
    ledger.due = '0.00';
    await s().refreshTicket(s().ticket.rid);
    usePos.setState({ splits: [{ id: 'p-earlier', method: 'card', via: 'reader', amount: 24.14, tip: 0 }] });
    s().onCharge();
    await until(() => s().view === 'complete', 'the sale to close');
    expect(pay.asked.some((a) => a.op === 'charge')).toBe(false);
  });

  it('keeps the cashier on the charge: another tab waits until it ends', async () => {
    connect(standInPay());
    await toPayment();
    s().onCharge();
    await until(() => s().charge?.phase === 'on_reader', 'the charge');
    s().setMethod('cash');
    expect(s().payMethod).toBe('card');
  });
});

describe('a standalone terminal', () => {
  it('records what the terminal took from its slip: both fields required, a card payment with the code and the last four', async () => {
    connect(standInPay(), { readerId: null });
    await toPayment();
    expect(cardPanel(s())).toBe('terminal');
    s().onCharge();
    await settled();
    expect(s().slip.tried).toBe(true);
    expect(sink.calls.some((c) => c.ref === 'payments')).toBe(false);

    s().setSlip('code', ' ab-12c9 ');
    s().setSlip('last4', '42 42x');
    expect(s().slip).toMatchObject({ code: 'ab12c9', last4: '4242' });
    ledger.due = '0.00';
    s().onCharge();
    await until(() => s().view === 'complete', 'the sale to close');
    const paid = sink.calls.find((c) => c.ref === 'payments')!;
    expect(paid.values).toMatchObject({ method: 'card', amount: 24.14, approval_code: 'AB12C9', payment_last4: '4242' });
    expect(Object.keys(paid.values!)).not.toContain('payment_ref');
    expect(s().lastSale!.splits[0]).toMatchObject({ method: 'card', via: 'terminal', last4: '4242' });
  });

  it('is the card tab whenever payments are off: no reader is offered, and the tip stays the till’s', async () => {
    connect(standInPay(), { payments: { on: false, online: false, test: false, refund: false } });
    usePos.setState({ tip: 2 });
    await toPayment();
    expect(cardPanel(s())).toBe('terminal');
    expect(s().tipBefore).toBeNull();
    expect(tipAmt(s())).toBeGreaterThan(0);
  });

  it('a test reader is offered only to someone rehearsing', async () => {
    const test: TillReader = { ...READER, id: 'prd_t', mode: 'test' };
    connect(standInPay(), { readers: [test], readerId: test.id });
    expect(cardPanel(s())).toBe('terminal');
    usePos.setState({ payments: { on: false, online: false, test: true, refund: false } });
    expect(cardPanel(s())).toBe('reader');
  });
});

describe('the QR tab', () => {
  it('shows the ticket’s pay link while guests can pay online, and closes the ticket when it is paid', async () => {
    const pay = standInPay();
    connect(pay, { payments: { on: true, online: true, test: false, refund: true } });
    await toPayment();
    expect(qrPanel(s())).toBe('link');
    s().setMethod('qr');
    await until(() => s().link?.phase === 'waiting', 'the link');
    expect(s().link).toMatchObject({ amount: 24.14, link: { url: 'https://pay.example/pay/abcdef' } });
    // The guest pays on their phone: Adminium writes the payment.
    ledger.payments.push({ id: 'p-link', ticket_id: 1, method: 'online', amount: '24.14', tip: '0.00', payment_ref: 'pat_9', payment_last4: null, provider: 'Stripe' });
    ledger.due = '0.00';
    await until(() => s().view === 'complete', 'the sale to close');
    expect(s().lastSale!.splits).toEqual([{ method: 'online', via: 'link', amount: 24.14, id: 'p-link', provider: 'Stripe' }]);
    expect(s().lastSale!.tip).toBe(0);
  });

  it('Cancel closes the link; leaving the tab closes it too', async () => {
    const pay = standInPay();
    connect(pay, { payments: { on: true, online: true, test: false, refund: true } });
    await toPayment();
    s().setMethod('qr');
    await until(() => s().link?.phase === 'waiting', 'the link');
    s().closeLink();
    await settled();
    expect(s().link?.phase).toBe('closed');
    expect(pay.asked.filter((a) => a.op === 'closeLink')).toHaveLength(1);
    s().newLink();
    await until(() => s().link?.phase === 'waiting', 'a new link');
    s().setMethod('cash');
    await settled();
    expect(s().link).toBeNull();
    expect(pay.asked.filter((a) => a.op === 'closeLink')).toHaveLength(2);
  });

  it('marks the ticket paid by hand, as always, while guests cannot pay online', async () => {
    connect(standInPay(), { payments: { on: true, online: false, test: false, refund: true } });
    await toPayment();
    expect(qrPanel(s())).toBe('mark');
    ledger.due = '0.00';
    s().setMethod('qr');
    s().onCharge();
    await until(() => s().view === 'complete', 'the sale to close');
    expect(sink.calls.find((c) => c.ref === 'payments')!.values).toMatchObject({ method: 'qr' });
  });
});
