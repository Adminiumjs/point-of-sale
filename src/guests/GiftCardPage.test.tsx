/**
 * THE GIFT CARD BALANCE PAGE — what it shows for each answer, and that the
 * code is never left on it once Adminium has answered.
 *
 * Rendered to static markup (this suite runs in node).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { I18nProvider } from '../i18n';
import { MESSAGES } from '../i18n/messages';
import { GIFT_CARD_PATH } from '../surface-nav';
import { BalanceView, GuestNotFound, askCard, type Asked } from './GiftCardPage';
import { GuestsScreen } from './GuestsApp';
import type { CardAnswer } from './balance';

const view = (asked: Asked, code = '', currency: string | null = 'USD') =>
  renderToStaticMarkup(
    <I18nProvider>
      <BalanceView asked={asked} code={code} currency={currency} venueName="Daybreak Coffee" onCode={() => {}} onAsk={() => {}} onAnother={() => {}} />
    </I18nProvider>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('the field', () => {
  it('is one field for the code as it is printed, labelled, with nothing to press until something is typed', () => {
    const html = view({ kind: 'idle' });
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toContain('placeholder="GC-0000-0000-0000"');
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Card code<\/label>/);
    expect(html).toContain('autoComplete="off"');
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(text(html)).toContain('Check balance');
    // No answer yet: nothing is said.
    expect(html).not.toContain('role="alert"');
  });

  it('can be pressed once something is typed, and says it is checking while it asks', () => {
    expect(view({ kind: 'idle' }, 'GC-7K2M')).not.toMatch(/<button type="submit"[^>]*disabled=""/);
    const busy = view({ kind: 'busy' }, 'GC-7K2MW3HNQ4XP');
    expect(text(busy)).toContain('Checking…');
    expect(busy).toMatch(/<button type="submit"[^>]*disabled=""/);
  });

  it('keeps the code out of a name, a form address and anything a browser would store', () => {
    const html = view({ kind: 'idle' }, 'GC-7K2MW3HNQ4XP');
    expect(html).not.toContain('name=');
    expect(html).not.toContain('action=');
    expect(html).not.toContain('method=');
  });
});

describe('what it says', () => {
  it('a card: the balance in the shop’s money and one line — until when', () => {
    const html = view({ kind: 'card', balance: '19.0000', expiresOn: '2027-08-03' });
    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Balance $19.00 Use it by August 3, 2027');
    // The balance and one line: no rows, no holder, no code, no field.
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<li');
    expect(text(html)).toContain('Check another card');
  });

  it('a card with no date', () => {
    expect(text(view({ kind: 'card', balance: '45.75', expiresOn: null }))).toContain('Balance $45.75 Does not expire');
  });

  it('nothing left on it is a balance, not a refusal', () => {
    const html = view({ kind: 'card', balance: '0', expiresOn: null });
    expect(text(html)).toContain('Balance $0.00 Does not expire');
    expect(html).not.toContain('role="alert"');
  });

  it('a card that cannot pay: the one sentence, tied to the field', () => {
    const html = view({ kind: 'invalid' }, 'GC-7K2M');
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('That code is not valid');
    expect(html).toContain('aria-invalid="true"');
    const said = /aria-describedby="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`id="${said}"`);
  });

  it('too many tries: the app’s own words, with the minutes the server said', () => {
    expect(text(view({ kind: 'wait', seconds: 42 }))).toContain('Too many tries. Wait 1 minute and try again.');
    expect(text(view({ kind: 'wait', seconds: null }))).toContain('Too many tries. Wait 1 minute and try again.');
    expect(text(view({ kind: 'wait', seconds: 150 }))).toContain('Too many tries. Wait 3 minutes and try again.');
    expect(text(view({ kind: 'wait', seconds: 42 }))).not.toContain('not valid');
  });

  it('nobody answered: said as that, never as a card that is not valid', () => {
    const said = text(view({ kind: 'failed' }, 'GC-7K2MW3HNQ4XP'));
    expect(said).toContain('Couldn’t reach Daybreak Coffee. Try again.');
    expect(said).not.toContain('not valid');
  });
});

describe('the code after the answer', () => {
  const door = (answer: CardAnswer) => {
    const asked: string[] = [];
    return {
      asked,
      byCode: async (typed: string) => {
        asked.push(typed);
        return answer;
      },
    };
  };

  it('is gone from the field once Adminium has answered — a balance, not valid, or wait', async () => {
    for (const answer of [{ kind: 'card', balance: '19', expiresOn: null }, { kind: 'invalid' }, { kind: 'wait', seconds: 30 }] as CardAnswer[]) {
      expect(await askCard(door(answer), 'GC-7K2MW3HNQ4XP')).toEqual({ answer, code: '' });
    }
  });

  it('stays only when nobody answered, to be sent again', async () => {
    expect(await askCard(door({ kind: 'failed' }), 'GC-7K2MW3HNQ4XP')).toEqual({ answer: { kind: 'failed' }, code: 'GC-7K2MW3HNQ4XP' });
  });

  it('a code that is not twelve characters is never asked: it stays to be put right', async () => {
    const d = door({ kind: 'card', balance: '19', expiresOn: null });
    expect(await askCard(d, 'GC-7K2M')).toEqual({ answer: { kind: 'invalid' }, code: 'GC-7K2M' });
    expect(d.asked).toEqual([]);
  });
});

describe('without Offers & gift cards', () => {
  it('the address is the not-found page, with the way to the booking page', () => {
    // The Guests side's store starts with no door: a shop whose key carries no such entry.
    const html = renderToStaticMarkup(
      <I18nProvider>
        <GuestsScreen view="balance" />
      </I18nProvider>,
    );
    expect(html).toContain('data-guest-not-found');
    expect(text(html)).toContain('Page not found');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('GC-0000');
    const alone = text(renderToStaticMarkup(<I18nProvider><GuestNotFound onBook={() => {}} /></I18nProvider>));
    expect(alone).toContain('There is nothing at this address.');
    expect(alone).toContain('Book a table');
  });
});

describe('where the page is', () => {
  it('is the manifest’s customer route `giftCard` — where Offers’ email links', () => {
    const customer = (manifest as unknown as { frontends: { side: string; routes: Record<string, string> }[] }).frontends.find((frontend) => frontend.side === 'customer')!;
    expect(customer.routes['giftCard']).toBe(`/${GIFT_CARD_PATH}`);
  });
});

describe('in every language', () => {
  it('the one sentence, the two lines under a balance and the not-found page are translated', () => {
    const keys = ['guest.cardTitle', 'guest.cardLede', 'guest.cardLabel', 'guest.cardCheck', 'guest.cardChecking', 'guest.cardInvalid', 'guest.cardBalance', 'guest.cardUseBy', 'guest.cardNoExpiry', 'guest.cardAnother', 'guest.notFoundTitle', 'guest.notFoundBody'];
    const english = MESSAGES['en-US'];
    for (const [locale, bundle] of Object.entries(MESSAGES)) {
      for (const key of keys) {
        expect(bundle[key], `${locale} ${key}`).toBeTruthy();
        if (locale !== 'en-US') expect(bundle[key], `${locale} ${key}`).not.toBe(english[key]);
      }
      expect(bundle['guest.cardUseBy'], locale).toContain('{date}');
    }
  });
});
