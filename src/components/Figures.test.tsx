/**
 * WHAT THE SCREENS SAY ABOUT MONEY, piece by piece.
 *
 * Rendered to static markup (this suite runs in node). Each piece is given
 * what the store would give it: the word "Estimate" is there exactly while the
 * figures are the till's own, and a figure Adminium answered is printed as it
 * came.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n';
import { toolsFor } from './TillNav';
import { NO_FEATURES } from '../features';
import { ReductionRows, TotalLabel } from './Figures';
import { CardMoveStrip } from './CardMoveBanner';
import { ReceiptCards, ReceiptReductions } from '../screens/Complete';
import { CardMovePanel } from '../screens/GiftCards';
import { RefundFigures } from '../screens/Refund';
import { StockChip } from '../screens/Register';
import { t } from '../i18n/ambient';

const html = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
const usd = (n: number) => `$${n.toFixed(2)}`;

describe('the total', () => {
  it('says "Estimate" beside "Total" while the figures are the till’s own', () => {
    const shown = html(<TotalLabel estimate />);
    expect(shown).toContain('Total');
    expect(shown).toContain('data-estimate');
    expect(shown).toContain('>Estimate<');
  });
  it('says nothing more once Adminium’s figures are in', () => {
    const shown = html(<TotalLabel estimate={false} />);
    expect(shown).toContain('Total');
    expect(shown).not.toContain('Estimate');
  });
});

describe('the reductions', () => {
  const lines = [
    { name: 'Voucher · One croissant', kind: 'voucher', amount: 3.8 },
    { name: 'Staff · Goodwill', kind: 'staff', amount: 4.98 },
  ];
  it('are Adminium’s lines, a row each, and only one that can be taken off has its ×', () => {
    const shown = html(<ReductionRows lines={lines} onRemove={(line) => (line.kind === 'staff' ? () => undefined : undefined)} />);
    expect(shown).toContain('Voucher · One croissant');
    expect(shown).toContain('−$3.80');
    expect(shown).toContain('−$4.98');
    expect(shown.match(/aria-label="Remove /g)).toHaveLength(1);
    expect(shown).toContain('aria-label="Remove Staff · Goodwill"');
  });
  it('print on the receipt in place of the till’s one discount row', () => {
    const offers = html(<ReceiptReductions sale={{ discount: 8.78, discountLabel: '10% off', reductions: lines }} />);
    expect(offers).toContain('Staff · Goodwill');
    expect(offers).not.toContain('10% off');
    const own = html(<ReceiptReductions sale={{ discount: 5.36, discountLabel: '10% off' }} />);
    expect(own).toContain('10% off');
    expect(own).toContain('−$5.36');
    expect(html(<ReceiptReductions sale={{ discount: 0, discountLabel: '' }} />)).toBe('');
  });
});

describe('gift cards on the receipt', () => {
  it('prints what a card that paid has left, and a new card by its last four — never a code', () => {
    const shown = html(<ReceiptCards sale={{ cardBalances: [{ last4: 'Q4XP', left: 31.4 }], newCards: [{ cardId: '13', last4: 'B1B7', amount: 50 }] }} />);
    expect(shown).toContain('Gift card balance left');
    expect(shown).toContain('$31.40');
    // Two cards paid: each balance says whose it is.
    const two = html(<ReceiptCards sale={{ cardBalances: [{ last4: 'Q4XP', left: 0 }, { last4: '2HVT', left: 7.95 }] }} />);
    expect(two).toContain('Gift card balance left · Gift card ···· Q4XP');
    expect(two).toContain('Gift card balance left · Gift card ···· 2HVT');
    expect(shown).toContain('New gift card · Gift card ···· B1B7');
    expect(shown).toContain('$50.00');
    expect(shown).toContain('Its code is printed once and shown nowhere else');
  });
  it('prints nothing for a sale no card touched', () => {
    expect(html(<ReceiptCards sale={{}} />)).toBe('');
  });
});

describe('the refund’s figures', () => {
  const estimate = { sub: 23.0, tax: 1.9, total: 24.9 };
  it('are Adminium’s quote once it is in — never the till’s own sum', () => {
    const shown = html(<RefundFigures count={2} quote={{ amount: 10, tax: 0.76 }} estimate={estimate} asked />);
    expect(shown).toContain('$10.00');
    expect(shown).toContain('$0.76');
    expect(shown).not.toContain('$24.90');
    expect(shown).not.toContain('$23.00');
    expect(shown).not.toContain('Estimate');
  });
  it('are an estimate, labelled, until the quote is in', () => {
    const shown = html(<RefundFigures count={2} quote={null} estimate={estimate} asked />);
    expect(shown).toContain('$24.90');
    expect(shown).toContain('>Estimate<');
  });
  it('are the estimate, unlabelled, where there is no server to ask', () => {
    const shown = html(<RefundFigures count={2} quote={null} estimate={estimate} asked={false} />);
    expect(shown).toContain('$24.90');
    expect(shown).not.toContain('Estimate');
  });
});

describe('a tile’s stock word', () => {
  it('says how many are left when it runs low, and "Out" at none', () => {
    expect(html(<StockChip word={{ state: 'low', exact: 3 }} />)).toContain('Only 3 left<');
    expect(html(<StockChip word={{ state: 'out', exact: 0 }} />)).toContain('>Out<');
  });
  it('says nothing while there is plenty, or nobody counts it', () => {
    expect(html(<StockChip word={{ state: 'in', exact: 40 }} />)).toBe('');
    expect(html(<StockChip word={undefined} />)).toBe('');
  });
});

describe('bringing the gift cards into Offers', () => {
  const noop = () => undefined;
  const panel = (outcome: Parameters<typeof CardMovePanel>[0]['outcome'], more: Partial<Parameters<typeof CardMovePanel>[0]> = {}) =>
    html(<CardMovePanel moved={false} busy={false} progress={{ moved: 0, of: 0 }} outcome={outcome} failed={false} onRun={noop} onReload={noop} {...more} />);

  it('the banner says how many cards hold money, and how much in all', () => {
    const shown = html(<CardMoveStrip figures={{ count: 4, cents: 12350 }} onLater={noop} onOpen={noop} money={usd} t={t} />);
    expect(shown).toContain('Bring your gift cards into Offers');
    expect(shown).toContain('4 cards, $123.50 in total');
    expect(shown).toContain('>Later<');
    expect(shown).toContain('>Open<');
    expect(html(<CardMoveStrip figures={{ count: 1, cents: 3850 }} onLater={noop} onOpen={noop} money={usd} t={t} />)).toContain('1 card, $38.50 in total');
  });
  it('names the tickets that block it', () => {
    expect(panel({ state: 'blocked', tickets: [{ id: 4, number: '1041' }, { id: 9, number: '1046' }] })).toContain('Finish or void these tickets first: #1041, #1046');
  });
  it('tells anyone but the owner who to ask', () => {
    expect(panel({ state: 'ask-owner' })).toContain('Ask the owner to run this');
  });
  it('says where it stopped, and that pressing again goes on', () => {
    const shown = panel({ state: 'row-refused', card: 'GC-48219930', code: 'POSTING_REFUSED', reason: 'paused', moved: 3 });
    expect(shown).toContain('Stopped at card GC-48219930 (paused)');
    expect(shown).toContain('Press again to go on');
  });
  it('lists the cards whose balances differ', () => {
    const shown = panel({ state: 'mismatch', cards: [{ code: 'GC-48219930', here: 3850, inOffers: 3800 }, { code: 'GC-1', here: 500, inOffers: null }] });
    expect(shown).toContain('These balances differ, so nothing was closed');
    expect(shown).toContain('GC-48219930: $38.50 here, $38.00 in Offers');
    expect(shown).toContain('GC-1: $5.00 here, not there in Offers');
  });
  it('says every balance matches, and offers the reload', () => {
    const shown = panel({ state: 'done', cards: 4, rows: 9, cents: 12350, alreadyDone: false });
    expect(shown).toContain('All balances match');
    expect(shown).toContain('4 cards, $123.50 in total');
    expect(shown).toContain('>Reload the till<');
    // Done: there is nothing left to run.
    expect(shown).not.toContain('>Bring them in<');
  });
  it('a run that lost its connection says so', () => {
    expect(panel(null, { failed: true })).toContain('The move stopped before it finished');
  });
  it('once moved, the old Gift cards screen leaves the menu', () => {
    const on = { ...NO_FEATURES, offers: true, 'gift-cards': true };
    expect(toolsFor(false, on, false).some((x) => x.v === 'giftcards')).toBe(true);
    expect(toolsFor(false, on, true).some((x) => x.v === 'giftcards')).toBe(false);
    // Without Offers the till keeps its own cards, whatever the flag says.
    expect(toolsFor(false, NO_FEATURES, true).some((x) => x.v === 'giftcards')).toBe(true);
  });
});
