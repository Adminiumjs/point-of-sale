/**
 * EVERY REFUSAL HAS ITS OWN PLAIN SENTENCE.
 *
 * Adminium refuses with a code and a reason; the person at the till reads
 * words. Each reason the till knows is held to its sentence here, and a reason
 * it does not know still gets a sentence — never the code.
 */
import { describe, expect, it } from 'vitest';

import { SinkError } from '../data/sink';
import { cardRefusal, codeRefusal, discountRefusal, refundRefusal, unavailableWords } from './refusals';

const refused = (code: string, details: Record<string, unknown> = {}) => new SinkError('no', 'refused', 409, code, null, details);
const down = new SinkError('down', 'offline', 0, 'NETWORK');
const UNAVAILABLE = 'Offers can’t answer right now, so this can’t be saved. Ask the owner.';

describe('a staff discount', () => {
  it('over the ceiling says how much may be given, and who to ask', () => {
    expect(discountRefusal(refused('ADJUST_REFUSED', { reason: 'over-ceiling', max: '10' }))).toBe('You can give up to 10 % · Ask a manager');
    // A comp has no percent to name.
    expect(discountRefusal(refused('ADJUST_REFUSED', { reason: 'over-ceiling' }))).toBe('That is more than you can give · Ask a manager');
  });
  it('not allowed asks for a manager', () => {
    expect(discountRefusal(refused('ADJUST_REFUSED', { reason: 'not-allowed' }))).toBe('Ask a manager to sign in');
  });
  it('needs a connection, and Offers to answer', () => {
    expect(discountRefusal(down)).toBe('Discounts need a connection');
    expect(discountRefusal(refused('ADJUST_REFUSED', { reason: 'add-on-unavailable' }))).toBe(UNAVAILABLE);
    expect(unavailableWords()).toBe(UNAVAILABLE);
  });
});

describe('a code or a voucher', () => {
  const words = (reason: string, more: Record<string, unknown> = {}) => codeRefusal(refused('ADJUST_REFUSED', { column: 'typed', reason, ...more }), 'AUTUMN5');
  it('names the code and says why, reason by reason', () => {
    expect(words('unknown')).toBe('No code or voucher matches AUTUMN5');
    expect(words('used-up')).toBe('AUTUMN5 has been used up');
    expect(words('expired')).toBe('AUTUMN5 has expired');
    expect(words('inactive')).toBe('AUTUMN5 is not active');
    expect(words('void')).toBe('AUTUMN5 was cancelled');
    expect(words('not-yet')).toBe('AUTUMN5 is not valid yet');
    expect(words('over-limit')).toBe('AUTUMN5 has reached its limit');
    expect(words('needs-minimum', { amount: '20.00' })).toBe('AUTUMN5 needs a ticket of at least $20.00');
    expect(words('needs-minimum')).toBe('AUTUMN5 needs a larger ticket');
    expect(words('not-for-these-items')).toBe('AUTUMN5 is not for these items');
    expect(words('needs-customer')).toBe('AUTUMN5 is for a named customer');
    expect(words('add-on-unavailable')).toBe(UNAVAILABLE);
  });
  it('a reason the till has never heard of is still a sentence, never the code', () => {
    const said = words('something-new');
    expect(said).toBe('AUTUMN5 can’t be used on this ticket');
    expect(said).not.toMatch(/ADJUST_REFUSED|something-new/);
  });
  it('needs a connection', () => {
    expect(codeRefusal(down, 'AUTUMN5')).toBe('Codes need a connection');
  });
});

describe('a gift card that cannot pay', () => {
  const words = (reason: string) => cardRefusal(refused('POSTING_REFUSED', { reason }));
  it('says why, reason by reason', () => {
    expect(words('not-valid')).toBe('No gift card has that code');
    expect(words('inactive')).toBe('This card has not been sold yet');
    expect(words('void')).toBe('This card was cancelled');
    expect(words('expired')).toBe('This card has expired');
    expect(words('empty')).toBe('This card is empty');
    expect(words('card-pays-card')).toBe('A gift card can’t pay for a gift card');
    expect(words('not-allowed')).toBe('Ask a manager to take this gift card');
    expect(words('add-on-unavailable')).toBe(UNAVAILABLE);
    expect(words('something-new')).toBe('This card can’t pay this ticket');
  });
  it('is never tried without a connection', () => {
    expect(cardRefusal(down)).toBe('A gift card needs a connection');
  });
});

describe('a refund', () => {
  it('over what the payment took says how much can still go back', () => {
    expect(refundRefusal(refused('POSTING_REFUSED', { reason: 'refund-over', left: '4.84' }))).toBe('Only $4.84 can go back this way');
    expect(refundRefusal(refused('BALANCE_EXCEEDED', { column: 'amount', balance: '10.00' }))).toBe('Only $10.00 can go back this way');
    expect(refundRefusal(refused('BALANCE_EXCEEDED'))).toBe('That is more than this payment took');
  });
  it('anything else is a plain "can’t", and offline says so', () => {
    expect(refundRefusal(refused('COLUMN_FORBIDDEN'))).toBe('This refund can’t be made');
    expect(refundRefusal(down)).toBe('A refund needs a connection');
  });
});
