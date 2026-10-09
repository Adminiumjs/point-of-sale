/**
 * WHO IS SHOWN WHAT — the pieces of the screens, each given what the store
 * would give it for the three people a built Adminium answers for: a cashier,
 * a manager who also sits at Offers' desk, and a Super Admin. Rendered to
 * static markup (node); `state/may.test.ts` holds the reading of the session.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n';
import { CardPrintRows } from './CardPrints';
import { CardSheet } from './CardSaleModal';
import { CarryStrip } from './TicketPane';

const html = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
const doors = { onClose: () => undefined, find: async () => ({ words: '' }), sell: async () => true, topUp: () => true };

describe('the gift card sheet', () => {
  it('offers "Sell a card" only to someone Offers lets make one; a cashier gets the top-up, and is told who sells', () => {
    const forCashier = html(<CardSheet maySell={false} off={false} {...doors} />);
    expect(forCashier).not.toContain('Sell a card');
    expect(forCashier).not.toContain('Add card to ticket');
    expect(forCashier).toContain('data-sell-who');
    expect(forCashier).toContain('A new card is sold, and printed, by someone who also holds the Offers desk role · Ask the owner');
    expect(forCashier).toContain('Scan or type the card’s code');
    expect(forCashier).toContain('Add top-up to ticket');

    const forDesk = html(<CardSheet maySell off={false} {...doors} />);
    expect(forDesk).toContain('Sell a card');
    expect(forDesk).toContain('Top up');
    expect(forDesk).toContain('Add card to ticket');
    expect(forDesk).toContain('Active when this ticket is paid');
    expect(forDesk).not.toContain('data-sell-who');
  });
  it('says why it is off without a connection', () => {
    expect(html(<CardSheet maySell off {...doors} />)).toContain('Selling a card needs a connection');
  });
});

describe('a ticket opened before the update', () => {
  it('with nothing paid on it offers to move its items', () => {
    const shown = html(<CarryStrip partPaid={false} known onCarry={() => undefined} />);
    expect(shown).toContain('Opened before the update');
    expect(shown).toContain('Move the items');
  });
  it('part-paid, says who finishes it and has no button', () => {
    const shown = html(<CarryStrip partPaid known={false} onCarry={() => undefined} />);
    expect(shown).toContain('This ticket was part-paid before the update · A manager finishes it from the dashboard');
    expect(shown).not.toContain('Move the items');
    expect(shown).not.toContain('<button');
  });
  it('offers no button until Adminium has said whether anything was paid', () => {
    expect(html(<CarryStrip partPaid={false} known={false} onCarry={() => undefined} />)).not.toContain('<button');
  });
});

describe('a new card waiting to be printed', () => {
  it('is offered by its last four — neither a code nor its print ticket is on the row', () => {
    const shown = html(<CardPrintRows ready={[{ cardId: '13', print: 'a-print-ticket-that-names-nothing', last4: 'B1B7', amount: 50, at: 0, paid: true }]} busy={false} onPrint={() => undefined} />);
    expect(shown).toContain('Gift card ···· B1B7 for $50.00 is ready to print');
    expect(shown).toContain('Print the card');
    expect(shown).toContain('Its code is printed once and shown nowhere else');
    expect(shown).not.toContain('a-print-ticket');
  });
  it('shows nothing when no card waits', () => {
    expect(html(<CardPrintRows ready={[]} busy={false} onPrint={() => undefined} />)).toBe('');
  });
});
