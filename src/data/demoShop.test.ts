/**
 * THE DEMO'S OWN SHOP — codes, offers, staff discounts, a gift card, refunds
 * and stock, on the screens' own store, answered from memory.
 *
 * The store is driven as the demo drives it, over `openDemoShop()`. Every
 * figure asserted is the demo's own arithmetic (`estimate()`), and `fetch` is
 * a trap for the whole file: the demo asks no server, and no add-on, anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_FEATURES } from '../features';
import { estimate, lineUnit, regTotal, remaining } from '../state/calc';
import { cardState, refundMoney, showsEstimate, usePos } from '../state/store';
import { outbox, setSink } from '../state/writes';
import { DEMO_CEILING, DEMO_CODE, DEMO_GIFT_CARD, DEMO_OFFER, DEMO_REASONS, DEMO_STOCK, seedTicket } from './demo';
import { demoShop, openDemoShop, type DemoShop } from './demoShop';
import { setDesk } from './desk';
import { memorySink, type MemorySink } from './sink';
import { source } from './source';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
let sink: MemorySink;
let shop: DemoShop;
let close: () => void;
const asked = vi.fn(() => Promise.reject(new Error('the demo asked a server')));

const settled = async () => {
  for (let i = 0; i < 30; i += 1) {
    await outbox().idle();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** The till's own arithmetic for the ticket on the register, with this much taken off. */
const worked = (off: number) =>
  estimate(
    s().ticket.items.map((li) => ({ unit: lineUnit(li), qty: li.qty, load: li.giftCard !== undefined })),
    off > 0 ? { kind: 'amt', value: off } : null,
    source.taxRate(),
  );
const croissants = () => s().ticket.items.filter((li) => li.id === DEMO_OFFER.item).reduce((sum, li) => sum + lineUnit(li) * li.qty, 0);
const offer = () => Math.round(croissants() * DEMO_OFFER.percent) / 100;
const applied = () => (s().ticket.server?.applied ?? []).map((line) => [line.kind, line.name, line.amount]);

/** Pay what is owing in cash, to the cent, and wait for the receipt. */
const payCash = async () => {
  s().openPay();
  await settled();
  s().setMethod('cash');
  s().cashPreset(remaining(s()));
  s().onCharge();
  await settled();
};

beforeEach(async () => {
  asked.mockClear();
  vi.stubGlobal('fetch', asked);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: seedTicket(), view: 'register' });
  sink = memorySink();
  shop = demoShop(sink);
  close = openDemoShop(shop);
  await settled();
});

afterEach(() => {
  // Whatever a test did, nobody was asked.
  expect(asked).not.toHaveBeenCalled();
  close();
  setDesk(null);
  setSink(memorySink());
  vi.unstubAllGlobals();
});

describe('the demo as it opens', () => {
  it('has the features of a shop with Offers & gift cards and Inventory, and gift cards with no move', () => {
    expect(s().features).toEqual(DEMO_FEATURES);
    expect([DEMO_FEATURES.offers, DEMO_FEATURES['gift-cards'], DEMO_FEATURES.stock]).toEqual([true, true, true]);
    // State 3 from the start: there never was a card of the till's own to bring in.
    expect(cardState(s())).toBe(3);
    expect(s().connected).toBe(true);
  });

  it('shows the offer on the ticket it opens on, from the first look', () => {
    // Two croissants, a tenth off each: its own line, and the demo's own arithmetic for the rest.
    expect(croissants()).toBeCloseTo(7.6, 2);
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
    const mine = worked(0.76);
    expect(s().ticket.server).toMatchObject({ subtotal: mine.subtotal, discount: 0.76, net: mine.net, tax: mine.tax, total: mine.total, due: mine.total });
    expect(regTotal(s())).toBe(mine.total);
  });

  it('never calls a figure an estimate: the demo’s figures are its own', async () => {
    expect(showsEstimate(s())).toBe(false);
    s().tapTile('croissant');
    // Not while a change is on its way either.
    expect(showsEstimate(s())).toBe(false);
    await settled();
    expect(showsEstimate(s())).toBe(false);
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 1.14]]);
  });

  it('a ticket with no croissant on it has no offer', async () => {
    s().emptyTicket();
    await settled();
    // Emptied, nothing of the last ticket's figures is left on it.
    expect([applied(), regTotal(s())]).toEqual([[], 0]);
    s().tapTile('banana');
    await settled();
    expect(applied()).toEqual([]);
    expect(s().ticket.server).toMatchObject({ discount: 0, total: worked(0).total });
  });

  it('the seeded ticket put back by the demo card shows its offer again', async () => {
    s().emptyTicket();
    await settled();
    s().resetTicket();
    await settled();
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
  });
});

describe('a code', () => {
  it('the café’s own comes off as a line, and the total is the till’s arithmetic with it', async () => {
    await s().applyCode(' daybreak5 ');
    await settled();
    expect(s().codeSaid).toEqual({ ok: true, words: 'Discount code · daybreak5 applied' });
    expect(applied()).toEqual([
      ['offer', DEMO_OFFER.name, 0.76],
      ['code', '$5.00 off', 5],
    ]);
    expect(s().ticket.codes).toEqual([{ id: expect.any(String), typed: DEMO_CODE.code }]);
    expect(s().ticket.server).toMatchObject({ discount: 5.76, total: worked(5.76).total });
  });

  it('one nobody issued is refused in the field’s own words, and nothing changes', async () => {
    const before = regTotal(s());
    await s().applyCode('NOSUCHCODE');
    expect(s().codeSaid).toEqual({ ok: false, words: 'No code or voucher matches NOSUCHCODE' });
    expect(regTotal(s())).toBe(before);
  });

  it('is taken once on a ticket, and comes off again', async () => {
    await s().applyCode(DEMO_CODE.code);
    await settled();
    await s().applyCode(DEMO_CODE.code);
    expect(s().codeSaid?.ok).toBe(false);
    expect(applied()).toHaveLength(2);
    await s().removeCode(s().ticket.codes![0]!.id);
    await settled();
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
    expect(s().ticket.codes).toEqual([]);
  });

  it('typed and not applied, Pay applies it first — the amount asked is the reduced one', async () => {
    s().setCodeDraft(DEMO_CODE.code);
    s().openPay();
    await settled();
    expect(s().view).toBe('payment');
    expect(remaining(s())).toBe(worked(5.76).total);
  });

  it('never takes more than is left of the goods', async () => {
    s().emptyTicket();
    await settled();
    s().tapTile('banana');
    await settled();
    await s().applyCode(DEMO_CODE.code);
    await settled();
    // Banana bread is $4.20: the code takes that, not five.
    expect(applied()).toEqual([['code', '$5.00 off', 4.2]]);
    expect(s().ticket.server).toMatchObject({ discount: 4.2, net: 0, tax: 0, total: 0 });
  });
});

describe('a staff discount', () => {
  it('offers the café’s own reasons', async () => {
    s().loadReasons();
    await settled();
    expect(s().reasons).toEqual(DEMO_REASONS);
    expect(DEMO_REASONS.length).toBeGreaterThanOrEqual(2);
  });

  it('over the ten percent the person at the till may give is refused, with how far they may go', async () => {
    expect(DEMO_CEILING).toBe(10);
    expect(await s().previewDiscount('pct', 20, '2')).toEqual({ ok: false, words: 'You can give up to 10 % · Ask a manager' });
    expect(await s().giveDiscount('pct', 15, '15 % off', '2')).toBe('You can give up to 10 % · Ask a manager');
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
  });

  it('an amount is held to the same tenth, said in money; a comp is not theirs to give', async () => {
    const base = Math.round((worked(0).goods - 0.76) * 100);
    const most = Math.floor((2 * base * DEMO_CEILING + 100) / 200) / 100;
    const over = await s().previewDiscount('amt', 20, '1');
    expect(over).toEqual({ ok: false, words: `You can give up to $${most.toFixed(2)} · Ask a manager` });
    const comp = await s().previewDiscount('comp', 0, '1');
    expect(comp.ok).toBe(false);
    expect((comp as { words: string }).words).toContain('comp');
  });

  it('within it, the try says what it would take off, and giving it puts it on the ticket under its reason', async () => {
    const base = worked(0).goods - 0.76;
    const takes = Math.round(base * 10) / 100;
    const tried = await s().previewDiscount('pct', 10, '2');
    expect(tried).toMatchObject({ ok: true, discount: Math.round((0.76 + takes) * 100) / 100, total: worked(0.76 + takes).total });
    // Trying wrote nothing.
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
    expect(await s().giveDiscount('pct', 10, '10 % off', '2')).toBeNull();
    await settled();
    expect(applied()).toEqual([
      ['offer', DEMO_OFFER.name, 0.76],
      ['staff', 'Goodwill', takes],
    ]);
    expect(regTotal(s())).toBe(worked(0.76 + takes).total);
    // Taken off again at a tap.
    s().clearDiscount();
    await settled();
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
    expect(s().discount).toBeNull();
  });
});

describe('the gift card', () => {
  it('typed on the ticket, is kept for Pay by its last four — never saved as a code', async () => {
    await s().applyCode(DEMO_GIFT_CARD.code);
    expect(s().ticket.card).toEqual({ code: DEMO_GIFT_CARD.code, last4: DEMO_GIFT_CARD.last4, balance: 25 });
    expect(s().codeSaid?.ok).toBe(true);
    expect(s().ticket.codes ?? []).toEqual([]);
  });

  it('pays what it covers, cash the rest; the receipt says its last four, what is left on it, and the offer', async () => {
    const total = worked(0.76).total;
    expect(total).toBeGreaterThan(25);
    await s().applyCode(DEMO_GIFT_CARD.code);
    s().openPay();
    await settled();
    expect([s().view, s().payMethod, s().cardDraft]).toEqual(['payment', 'gift_card', DEMO_GIFT_CARD.code]);
    // Asked first: what it covers, and what is then left — nothing taken yet.
    s().onCharge();
    await settled();
    expect(s().cardPay).toMatchObject({ code: DEMO_GIFT_CARD.code, covers: 25, due: Math.round((total - 25) * 100) / 100 });
    expect(shop.cardBalance()).toBe(25);
    s().onCharge();
    await settled();
    expect(s().splits).toMatchObject([{ method: 'gift_card', amount: 25, reference: DEMO_GIFT_CARD.last4, cardLeft: 0 }]);
    expect(shop.cardBalance()).toBe(0);
    expect(remaining(s())).toBe(Math.round((total - 25) * 100) / 100);
    // The rest in cash.
    s().setMethod('cash');
    s().cashPreset(remaining(s()));
    s().onCharge();
    await settled();
    const sale = s().lastSale!;
    expect(s().view).toBe('complete');
    expect(sale.total).toBe(total);
    expect(sale.discount).toBe(0.76);
    expect(sale.reductions).toEqual([{ kind: 'offer', name: DEMO_OFFER.name, amount: 0.76 }]);
    expect(sale.cardBalances).toEqual([{ last4: DEMO_GIFT_CARD.last4, left: 0 }]);
    expect(sale.estimate).toBeUndefined();
    // The code is in nothing the receipt or the shift kept.
    expect(JSON.stringify([sale, s().sales, s().splits, s().shiftTotals])).not.toContain(DEMO_GIFT_CARD.code);
  });

  it('never pays the tip, and an empty card says so', async () => {
    s().emptyTicket();
    await settled();
    s().tapTile('banana');
    await settled();
    s().openPay();
    s().setTip(3);
    s().setCardDraft(DEMO_GIFT_CARD.code);
    s().setMethod('gift_card');
    s().onCharge();
    await settled();
    // $4.20 and its tax: the card covers that, and the tip is somebody else's to take.
    expect(s().cardPay).toMatchObject({ covers: worked(0).total, due: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('payment');
    expect(shop.cardBalance()).toBe(Math.round((25 - worked(0).total) * 100) / 100);
  });

  it('a card with nothing on it cannot pay, in the till’s own words', async () => {
    await s().applyCode(DEMO_GIFT_CARD.code);
    s().openPay();
    await settled();
    s().onCharge();
    await settled();
    s().onCharge();
    await settled();
    expect(shop.cardBalance()).toBe(0);
    s().setCardDraft(DEMO_GIFT_CARD.code);
    s().setMethod('gift_card');
    s().onCharge();
    await settled();
    expect(s().cardPayWords).toBe('This card is empty');
  });

  it('a new card is sold as a line on the ticket, named by four characters — no code anywhere', async () => {
    expect(await s().sellCard(30)).toBe(true);
    await settled();
    const line = s().ticket.items.find((li) => li.giftCard !== undefined)!;
    expect(line.giftCard).toMatchObject({ amount: 30, offers: true });
    expect(line.giftCard!.code).toMatch(/^\d{4}$/);
    // Money for a card is not goods: untaxed, and no offer or code touches it.
    expect(s().ticket.server).toMatchObject({ total: Math.round((worked(0.76).total) * 100) / 100 });
    expect(s().cardPrints).toEqual([]);
  });
});

describe('a refund', () => {
  it('is the till’s own sum of what is given back, and goes back to the payment that took it — never more', async () => {
    await payCash();
    const sold = s().sales[0]!;
    expect(sold.rid).toBeDefined();
    s().newOrder();
    s().openRefund();
    s().pickRefundSale(sold);
    await settled();
    const mine = refundMoney(sold, s().refundSel);
    expect(s().refundQuote).toEqual({ amount: mine.total, tax: mine.tax, payments: [{ key: sold.payments![0]!.id, took: sold.total, max: sold.total }] });
    expect(mine.total).toBe(sold.total);
    // One line only: its share of the reduction and its tax, by the same arithmetic.
    s().toggleRefundLine(0);
    await settled();
    const rest = refundMoney(sold, s().refundSel);
    expect(s().refundQuote).toMatchObject({ amount: rest.total, tax: rest.tax });
    expect(rest.total).toBeLessThan(sold.total);
    await s().processRefund();
    await settled();
    expect(s().refundDone).toEqual({ total: rest.total, count: s().refundSale!.lines.length - 1 });
    // Nothing that was sent carried money: the demo works a refund out as Adminium does, from its lines.
    const sent = sink.calls.find((call) => call.ref === 'refunds')!;
    expect(Object.keys(sent.values!)).not.toContain('amount');
  });
});

describe('stock words', () => {
  const words = async (ids: string[]) => {
    await s().loadStock(ids);
    return Object.fromEntries(ids.map((id) => [id, s().stock[id]]));
  };

  it('a few shelves are counted: one running low, one out, the rest unsaid', async () => {
    expect(Object.keys(DEMO_STOCK).length).toBeGreaterThanOrEqual(3);
    expect(await words(['croissant', 'muffin', 'sparkling', 'espresso'])).toEqual({
      croissant: { state: 'in', exact: null },
      muffin: { state: 'low', exact: 3 },
      sparkling: { state: 'out', exact: 0 },
      espresso: undefined,
    });
  });

  it('a sale takes what it sold off the shelf, and something out still sells', async () => {
    s().emptyTicket();
    await settled();
    s().tapTile('muffin');
    s().tapTile('muffin');
    s().tapTile('sparkling');
    await settled();
    await payCash();
    expect(s().view).toBe('complete');
    expect(await words(['muffin', 'sparkling'])).toEqual({ muffin: { state: 'low', exact: 1 }, sparkling: { state: 'out', exact: 0 } });
  });
});

describe('offline', () => {
  it('a code and a gift card need a connection, as on a real till — and nothing is asked', async () => {
    s().toggleOnline();
    await s().applyCode(DEMO_CODE.code);
    expect(s().codeSaid).toEqual({ ok: false, words: 'Codes need a connection' });
    expect(applied()).toEqual([['offer', DEMO_OFFER.name, 0.76]]);
  });
});
