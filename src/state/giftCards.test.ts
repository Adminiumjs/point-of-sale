/**
 * GIFT CARDS (wave 2, 55-T70): money goes onto a card by selling it on a
 * ticket — untaxed, undiscounted, never sent to the kitchen — and reaches the
 * card only when that ticket is paid; a card pays a ticket as a payment of its
 * own; a refund of a card-paid sale can go back onto it.
 *
 * The outbox sits on a fresh memory sink per test; the demo's book answers reads.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { demoCards, normaliseCode } from '../data/giftCards';
import { memorySink, type MemorySink } from '../data/sink';
import type { LineItem } from '../data/types';
import { discountAmt, linesTotal, netSub, regTotal, subtotal, tax } from './calc';
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
const rows = (ref: string) => sink.calls.filter((c) => c.ref === ref);
const card = demoCards()[0]!;

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, cards: { [card.id]: card }, giftSel: card.id });
});

describe('the rules', () => {
  const load = (amount: number): LineItem => ({ key: 'g', id: '', qty: 1, selection: {}, note: '', seat: 0, sent: false, giftCard: { cardId: 'c', code: 'GC-1', amount } });
  const bowl: LineItem = { key: 'b', id: 'bowl', qty: 1, selection: {}, note: '', seat: 0, sent: false };

  it('sells a load at its own price, with no tax, no discount and no tip on it', () => {
    const state = { ...s(), ticket: { items: [bowl, load(25)], table: null, seats: 2 }, discount: { kind: 'pct' as const, value: 10, label: '10%' } };
    expect(subtotal(state)).toBe(37);
    expect(discountAmt(state)).toBe(1.2); // 10% of the bowl alone
    expect(netSub(state)).toBeCloseTo(10.8);
    expect(tax(state)).toBe(0.89); // 8.25% of the bowl, after its discount
    expect(regTotal(state)).toBe(36.69);
    expect(linesTotal([bowl, load(25)])).toBe(37.99);
  });

  it('reads a code the way people type it', () => {
    expect(normaliseCode(' gc-4821 993o ')).toBe('GC-48219930');
    expect(normaliseCode('48219930')).toBe('GC-48219930');
    expect(normaliseCode('  ')).toBe('');
  });
});

describe('selling a card', () => {
  it('makes a card that waits, puts money on it through the ticket, and credits it once paid', async () => {
    await s().issueGiftCard();
    const made = s().cards[s().giftSel!]!;
    expect(made).toMatchObject({ status: 'inactive', balance: 0 });
    expect(made.code).toMatch(/^GC-[0-9A-Z]{8}$/);
    expect(rows('gift_cards')[0]?.values).toEqual({ status: 'inactive' });

    s().loadGiftCard(25);
    s().loadGiftCard(25);
    // One line per card: the second tap adds to it.
    expect(s().ticket.items).toHaveLength(1);
    expect(s().ticket.items[0]!.giftCard).toMatchObject({ cardId: made.id, amount: 50 });
    await settled();
    const line = rows('ticket_items').find((c) => c.op === 'insert')!;
    expect(line.values).toMatchObject({ menu_item_id: null, gift_card_id: Number(made.id), unit_price: 25, name: `Gift card ${made.code}` });
    expect(rows('ticket_items').find((c) => c.op === 'update')?.values).toEqual({ unit_price: 50 });

    // Nothing for the kitchen, and the card is not credited before the money is in.
    s().send();
    expect(s().kds).toEqual([]);
    expect(rows('gift_card_ledger')).toEqual([]);

    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '50', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('complete');
    expect(rows('gift_card_ledger').map((c) => c.values)).toEqual([expect.objectContaining({ card_id: Number(made.id), kind: 'issue', amount: 50, ticket_id: 1 })]);
    expect(rows('gift_cards').find((c) => c.op === 'update')?.values).toMatchObject({ status: 'active', issued_at: expect.any(String) });
    expect(s().cards[made.id]).toMatchObject({ status: 'active', balance: 50 });
    // Untaxed: 50 in, 50 paid.
    expect(s().lastSale).toMatchObject({ subtotal: 50, tax: 0, total: 50 });
  });

  it('puts more on a card already in use as a reload', async () => {
    s().loadGiftCard(10);
    s().openPay();
    usePos.setState({ payMethod: 'qr', tip: 0 });
    s().onCharge();
    await settled();
    expect(rows('gift_card_ledger')[0]?.values).toMatchObject({ card_id: 'gc-1', kind: 'reload', amount: 10 });
    expect(rows('gift_cards').filter((c) => c.op === 'update')).toEqual([]);
    expect(s().cards['gc-1']!.balance).toBe(48.5);
  });
});

describe('paying with a card', () => {
  it('pays the whole ticket when the balance covers it, as a gift card payment and a purchase on the card', async () => {
    s().tapTile('bowl'); // 12.00 + 8.25% = 12.99
    s().payWithGiftCard();
    await settled();
    expect(s().view).toBe('complete');
    expect(rows('payments')[0]?.values).toMatchObject({ method: 'gift_card', amount: 12.99, reference: 'GC-48219930' });
    expect(rows('gift_card_ledger')[0]?.values).toMatchObject({ card_id: 'gc-1', kind: 'redeem', amount: -12.99, ticket_id: 1 });
    expect(s().cards['gc-1']!.balance).toBe(25.51);
    expect(s().shiftTotals.gift).toBe(INITIAL.shiftTotals.gift + 12.99);
    expect(s().sales[0]!.giftCardCode).toBe('GC-48219930');
  });

  it('pays what the balance covers and leaves the rest for Payment', async () => {
    usePos.setState({ cards: { 'gc-1': { ...card, balance: 5 } } });
    s().tapTile('bowl');
    s().payWithGiftCard();
    await settled();
    expect(s().view).toBe('payment');
    expect(s().splits).toEqual([{ method: 'gift_card', amount: 5, reference: 'GC-48219930' }]);
    expect(s().cards['gc-1']!.balance).toBe(0);
  });

  it('will not pay with a card the ticket is loading, a card not yet sold, or an empty one', async () => {
    s().tapTile('bowl');
    s().loadGiftCard(10);
    s().payWithGiftCard();
    usePos.setState({ cards: { 'gc-1': { ...card, status: 'inactive' } } });
    s().payWithGiftCard();
    usePos.setState({ cards: { 'gc-1': { ...card, balance: 0 } }, ticket: { ...s().ticket, items: s().ticket.items.filter((x) => x.giftCard === undefined) } });
    s().payWithGiftCard();
    await settled();
    expect(rows('payments')).toEqual([]);
    expect(s().toast?.kind).toBe('error');
  });
});

describe('refunding onto a card', () => {
  it('gives the money back onto the card that paid, and never refunds a load', async () => {
    s().tapTile('bowl');
    s().loadGiftCard(10);
    s().openPay();
    usePos.setState({ payMethod: 'cash', cash: '30', tip: 0 });
    s().onCharge();
    await settled();
    // A load's line cannot be chosen for a refund.
    s().openRefund();
    s().pickRefundSale(s().sales[0]!);
    expect(s().refundSel).toEqual([0]);
    s().toggleRefundLine(1);
    expect(s().refundSel).toEqual([0]);

    // A card-paid sale refunds onto its card.
    usePos.setState({ ticket: { number: 5, table: null, seats: 2, openedAt: 0, items: [] }, view: 'register' });
    s().tapTile('croissant'); // 3.80 + tax = 4.11
    s().payWithGiftCard();
    await settled();
    const sale = s().sales[0]!;
    expect(sale.giftCardCode).toBe('GC-48219930');
    const before = s().cards['gc-1']!.balance;
    s().openRefund();
    s().pickRefundSale(sale);
    s().setRefundMethod('gift_card');
    await s().processRefund();
    await settled();
    expect(rows('gift_card_ledger').at(-1)?.values).toMatchObject({ card_id: 'gc-1', kind: 'refund', amount: 4.11 });
    expect(s().cards['gc-1']!.balance).toBe(Math.round((before + 4.11) * 100) / 100);
  });
});
