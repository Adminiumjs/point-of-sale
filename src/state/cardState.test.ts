/**
 * WHOSE THE GIFT CARDS ARE — one decision, from three facts.
 *
 * A shop that attached Offers & gift cards before it ever sold a card of its
 * own has nothing to bring in: its cards are Offers' from the start, with no
 * move and no banner. One that did sell its own keeps its old screens until
 * the move is run.
 */
import { toolsFor } from '../components/TillNav';
import { describe, expect, it } from 'vitest';

import { NO_FEATURES } from '../features';
import { cardState, cardStateOf } from './store';

describe('the three gift card states', () => {
  it('1 — without Offers, and the cards never moved, the till keeps its own cards', () => {
    for (const own of [null, 0, 3]) expect(cardStateOf({ offers: false, moved: false, own })).toBe(1);
  });

  it('4 — the cards were moved and Offers is switched off: the old tables are closed, so the old screens do not come back', () => {
    for (const own of [null, 0, 3]) expect(cardStateOf({ offers: false, moved: true, own })).toBe(4);
    expect(cardState({ features: NO_FEATURES, cardsMoved: true, ownCards: 0 })).toBe(4);
    // Nothing of the old screen, and nothing of Offers' either.
    expect(toolsFor(false, NO_FEATURES, false, true).some((x) => x.v === 'giftcards')).toBe(false);
    expect(toolsFor(false, NO_FEATURES, false, false).some((x) => x.v === 'giftcards')).toBe(true);
  });

  it('2 — Offers attached, and the till still holds a card of its own that has not moved', () => {
    expect(cardStateOf({ offers: true, moved: false, own: 1 })).toBe(2);
    expect(cardStateOf({ offers: true, moved: false, own: 40 })).toBe(2);
  });

  it('2 — not knowing is never read as "none": the old screens stay until the count is in', () => {
    expect(cardStateOf({ offers: true, moved: false, own: null })).toBe(2);
  });

  it('3 — the move is done', () => {
    for (const own of [null, 0, 3]) expect(cardStateOf({ offers: true, moved: true, own })).toBe(3);
  });

  it('3 — Offers attached and no card of the till’s own: nothing to move, so no move is asked for', () => {
    expect(cardStateOf({ offers: true, moved: false, own: 0 })).toBe(3);
  });

  it('the till reads its own state from its features, its settings and its count', () => {
    const on = { ...NO_FEATURES, offers: true, 'gift-cards': true };
    expect(cardState({ features: NO_FEATURES, cardsMoved: false, ownCards: 0 })).toBe(1);
    expect(cardState({ features: on, cardsMoved: false, ownCards: 2 })).toBe(2);
    expect(cardState({ features: on, cardsMoved: false })).toBe(2);
    expect(cardState({ features: on, cardsMoved: false, ownCards: 0 })).toBe(3);
    expect(cardState({ features: on, cardsMoved: true, ownCards: 2 })).toBe(3);
  });
});
