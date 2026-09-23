/**
 * THE CUSTOMER DISPLAY (wave 2, 55-T72): the guest's tip is the till's tip —
 * Payment keeps it (the plan's fix 7) — the custom pad works from both, and
 * Done saves the signature's time and the receipt choice on the ticket.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { memorySink, type MemorySink } from '../data/sink';
import { tipAmt } from './calc';
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

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null });
});

describe('the tip', () => {
  it('chosen on the display is the one Payment opens with', () => {
    s().tapTile('bowl');
    s().go('display');
    s().displayTip(2); // the demo's 15%
    s().openPay();
    expect(s().view).toBe('payment');
    expect(s().tip).toBe(2);
    expect(tipAmt(s())).toBe(1.8);
  });

  it('a custom amount comes from the pad, typed', () => {
    s().tapTile('bowl');
    s().displayTip('custom');
    for (const key of ['2', '.', '5', '0', '0']) s().tipPadPush(key); // a third decimal is ignored
    s().tipPadPush('back');
    expect(s().tipPad).toBe('2.5');
    s().applyTipPad();
    expect(s().tipPad).toBeNull();
    expect(s().tip).toBe('c');
    expect(tipAmt(s())).toBe(2.5);
  });

  it('is the next guest’s own again once the ticket is paid', async () => {
    s().tapTile('bowl');
    s().displayTip(3);
    s().openPay();
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    await settled();
    expect(s().lastSale?.tip).toBe(2.4);
    expect(s().tip).toBe(0);
  });
});

describe('signing and the receipt', () => {
  it('needs something to sign for, and a signature before Done', async () => {
    s().displayContinue();
    expect(s().display.step).toBe('order');
    s().tapTile('croissant');
    s().displayContinue();
    expect(s().display.step).toBe('sign');
    s().displayDone(); // not signed: nothing
    await settled();
    expect(sink.calls.some((c) => c.ref === 'tickets' && c.op === 'update')).toBe(false);
  });

  it('asks where an emailed receipt goes, then saves the signature and the choice on the ticket', async () => {
    s().tapTile('croissant');
    s().displayContinue();
    s().displaySign();
    s().displayReceipt('email');
    s().displayDone();
    expect(s().toast?.kind).toBe('error');
    s().displayReceiptTo(' dana.w@example.com ');
    s().displayDone();
    await settled();
    expect(sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'update').at(-1)?.values).toEqual({
      signed_at: expect.any(String),
      receipt_via: 'email',
      receipt_to: 'dana.w@example.com',
    });
    expect(s().display).toMatchObject({ step: 'order', signed: false });
    // The receipt screen says what the guest asked for.
    s().openPay();
    usePos.setState({ payMethod: 'qr' });
    s().onCharge();
    await settled();
    expect(s().lastSale?.receipt).toEqual({ via: 'email', to: 'dana.w@example.com' });
    expect(s().display.receipt).toBe('');
  });

  it('a printed or no receipt needs nowhere to send it', async () => {
    s().tapTile('croissant');
    s().displayContinue();
    s().displaySign();
    s().displayReceipt('print');
    s().displayDone();
    await settled();
    expect(sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'update').at(-1)?.values).toMatchObject({ receipt_via: 'print', receipt_to: null });
  });
});
