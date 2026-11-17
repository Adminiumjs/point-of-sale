/**
 * THE PAYMENTS ADMINIUM TAKES, AS THE TILL READS THEM: which way a payment was
 * taken (from its own row), which readers a till may use, what a terminal slip
 * must say, and the answers of the reader and pay-link routes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { approvalOf, chargeOf, chooseReader, chosenReader, payLinkOf, readerOf, sendsBack, slipErrors, usableReaders, wayOf, type TillReader } from './payments';

describe('which way a payment was taken', () => {
  it('reads it from the row: a reader’s carries the card’s last four, a pay link’s none, a slip an approval code', () => {
    expect(wayOf({ method: 'online', payment_last4: '4242' })).toBe('reader');
    expect(wayOf({ method: 'online', payment_last4: null })).toBe('link');
    expect(wayOf({ method: 'online', payment_last4: '' })).toBe('link');
    expect(wayOf({ method: 'card', approval_code: 'A1B2C3' })).toBe('terminal');
    // A card row from before the update: the till's own, no slip.
    expect(wayOf({ method: 'card' })).toBe('card');
    expect(wayOf({ method: 'cash' })).toBe('cash');
    expect(wayOf({ method: 'qr' })).toBe('qr');
    expect(wayOf({ method: 'gift_card' })).toBe('gift_card');
  });

  it('sends money back through the payment service only for a reader’s or a pay link’s payment', () => {
    expect([sendsBack('reader'), sendsBack('link')]).toEqual([true, true]);
    expect([sendsBack('terminal'), sendsBack('card'), sendsBack('cash'), sendsBack(undefined)]).toEqual([false, false, false, false]);
  });
});

describe('the readers a till may use', () => {
  const live: TillReader = { id: 'prd_1', label: 'Front counter', mode: 'live', online: true, lastSeenAt: 1, locationName: null };
  const test: TillReader = { ...live, id: 'prd_2', label: 'Demo reader', mode: 'test' };
  it('a live one while the till is switched on, a test one only while rehearsing', () => {
    expect(usableReaders([live, test], { on: true, online: false, test: false, refund: false })).toEqual([live]);
    expect(usableReaders([live, test], { on: false, online: false, test: true, refund: false })).toEqual([test]);
    expect(usableReaders([live, test], { on: true, online: false, test: true, refund: false })).toEqual([live, test]);
    expect(usableReaders([live, test], { on: false, online: false, test: false, refund: false })).toEqual([]);
  });
});

describe('a standalone terminal’s slip', () => {
  it('needs an approval code of up to 12 letters and digits, and exactly four digits', () => {
    expect(slipErrors('A1B2C3', '4242')).toEqual({ code: false, last4: false });
    expect(slipErrors(' 123456789012 ', ' 0000 ')).toEqual({ code: false, last4: false });
    expect(slipErrors('', '')).toEqual({ code: true, last4: true });
    expect(slipErrors('1234567890123', '424')).toEqual({ code: true, last4: true });
    expect(slipErrors('AB-12', '42a2')).toEqual({ code: true, last4: true });
  });
  it('keeps the code trimmed and in capitals', () => {
    expect(approvalOf(' ab12c ')).toBe('AB12C');
  });
});

describe('the answers of Adminium’s routes', () => {
  it('a reader, a charge and a pay link, as the till keeps them', () => {
    expect(readerOf({ id: 'prd_1', label: 'Front counter', mode: 'live', online: false, lastSeenAt: 99, locationName: 'Harbour Rd', provider: 'payments-stripe', model: 'S700' })).toEqual({
      id: 'prd_1',
      label: 'Front counter',
      mode: 'live',
      online: false,
      lastSeenAt: 99,
      locationName: 'Harbour Rd',
    });
    expect(readerOf({ label: 'no id' })).toBeNull();
    expect(chargeOf({ attemptId: 'pat_1', state: 'paid', amount: '24.14', currency: 'USD', tip: '3.35', brand: 'Visa', last4: '4242', message: null })).toEqual({
      attemptId: 'pat_1',
      state: 'paid',
      amount: 24.14,
      currency: 'USD',
      tip: 3.35,
      brand: 'Visa',
      last4: '4242',
      message: null,
    });
    expect(chargeOf({ attemptId: 'pat_1', state: 'processing', amount: '1.00' }).state).toBe('processing');
    // A state the till does not know is a failure, never a payment.
    expect(chargeOf({ attemptId: 'pat_1', state: 'weird', amount: '1.00' }).state).toBe('failed');
    expect(payLinkOf({ id: 'plk_1', url: 'https://pay.example/p/abc', mode: 'live', expiresAt: 5 })).toEqual({ id: 'plk_1', url: 'https://pay.example/p/abc', mode: 'live', expiresAt: 5 });
    expect(payLinkOf(null)).toBeNull();
  });
});

describe('this till’s reader, kept on the device', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is remembered, forgotten, and never throws where nothing is kept', () => {
    const kept = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) });
    expect(chosenReader()).toBeNull();
    expect(chooseReader('prd_1')).toBe(true);
    expect(chosenReader()).toBe('prd_1');
    chooseReader(null);
    expect(chosenReader()).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(chosenReader()).toBeNull();
    expect(chooseReader('prd_1')).toBe(false);
  });
});
