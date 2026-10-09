/**
 * A GIFT CARD'S BALANCE, THROUGH THE REAL PUBLIC CLIENT — what the door sends
 * and how it reads every answer. The server is a stand-in `fetch`; the client
 * between is the released one, so the header a code travels in and the address
 * it never reaches are the ones a browser would send.
 */
import { createPublicClient } from '@adminiumjs/public-client';
import { describe, expect, it } from 'vitest';

import { cardAsKept, cardsRef, publicBalanceDoor } from './balance';

interface Sent {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: unknown;
}

const REFS_WITH_OFFERS = {
  pos_settings: { actions: ['read'] },
  pos_reservations: { actions: ['create'] },
  offers_gift_cards_unlocked: { actions: ['read'], unlock: true as const },
};
const configOf = (refs: Record<string, unknown>, claim?: unknown) => ({ data: { version: 1, side: 'customer', timezone: 'Europe/Lisbon', currency: 'EUR', refs, ...(claim === undefined ? {} : { claim }) } });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const refusal = (code: string, status: number, headers: Record<string, string> = {}) => json({ error: { code, message: code } }, status, headers);

/** A client whose server is `answer`; everything it sent is kept. */
function clientOf(key: string, answer: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const client = createPublicClient({
    baseUrl: 'https://shop.example',
    publishableKey: key,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([name, value]) => [name.toLowerCase(), value]));
      const one: Sent = { method: init?.method ?? 'GET', path: url.pathname, query: url.search, headers, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      sent.push(one);
      return answer(one);
    }) as typeof fetch,
  })!;
  return { client, sent };
}

const shop = (cards: (sent: Sent) => Response | Promise<Response>, refs: Record<string, unknown> = REFS_WITH_OFFERS) =>
  clientOf('adm_pub_customer', (sent) => (sent.path === '/api/v1/public/config' ? json(configOf(refs)) : cards(sent)));

describe('a code as the door sends it', () => {
  it('is GC- and twelve characters in fours, however the guest typed it', () => {
    for (const typed of ['GC-7K2MW3HNQ4XP', 'gc-7k2m-w3hn-q4xp', ' GC 7K2M W3HN Q4XP ', '7K2MW3HNQ4XP', 'gc7k2mw3hnq4xp']) expect(cardAsKept(typed), typed).toBe('GC-7K2M-W3HN-Q4XP');
  });

  it('is nothing unless twelve characters follow the prefix', () => {
    for (const typed of ['', 'GC-', 'GC-7K2M-W3HN-Q4X', 'GC-7K2M-W3HN-Q4XPZ', 'MR-4829', 'hello there']) expect(cardAsKept(typed), typed).toBeNull();
  });
});

describe('which entry is Offers’ gift cards', () => {
  it('is the one a code unlocks, by the add-on’s stored table name', () => {
    expect(cardsRef(REFS_WITH_OFFERS)).toBe('offers_gift_cards_unlocked');
    expect(cardsRef({ offers_gift_cards_claimed: { actions: ['read'] } })).toBe('offers_gift_cards_claimed');
  });

  it('is none without Offers — the till’s own old card tables are never it', () => {
    expect(cardsRef({ pos_settings: { actions: ['read'] }, pos_gift_cards: { actions: ['read'] }, offers_gift_cardsx: { actions: ['read'] } })).toBeNull();
  });
});

describe('without Offers & gift cards', () => {
  it('there is no door: the page is not found, and nothing is asked', async () => {
    const { client, sent } = shop(() => json({ data: [] }), { pos_settings: { actions: ['read'] } });
    expect(await publicBalanceDoor(client)).toBeNull();
    expect(sent.map((one) => one.path)).toEqual(['/api/v1/public/config']);
  });
});

describe('a balance by the code on the card', () => {
  it('sends the code in the x-adminium-code header, never in the address, and reads the balance and the date', async () => {
    const { client, sent } = shop(() => json({ data: [{ status: 'active', balance: '19.0000', expires_on: '2027-08-03' }] }));
    const door = (await publicBalanceDoor(client))!;
    expect(door.currency).toBe('EUR');
    expect(await door.byCode('gc 7k2m w3hn q4xp')).toEqual({ kind: 'card', balance: '19.0000', expiresOn: '2027-08-03' });
    const asked = sent.at(-1)!;
    expect([asked.method, asked.path]).toEqual(['GET', '/api/v1/public/records/offers_gift_cards_unlocked']);
    expect(asked.headers['x-adminium-code']).toBe('GC-7K2M-W3HN-Q4XP');
    expect(asked.headers['authorization']).toBe('Bearer adm_pub_customer');
    expect(asked.query.toUpperCase()).not.toContain('7K2M');
    expect(asked.query).toBe('?limit=1');
    expect(asked.body).toBeNull();
  });

  it('a card with no date does not expire; a date with a time is its day', async () => {
    const answers = [{ status: 'active', balance: '5', expires_on: null }, { status: 'active', balance: '5', expires_on: '2027-01-31T00:00:00.000Z' }];
    const { client } = shop(() => json({ data: [answers.shift()] }));
    const door = (await publicBalanceDoor(client))!;
    expect(await door.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'card', balance: '5', expiresOn: null });
    expect(await door.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'card', balance: '5', expiresOn: '2027-01-31' });
  });

  it('nothing left is still a balance', async () => {
    const { client } = shop(() => json({ data: [{ status: 'active', balance: '0.0000', expires_on: null }] }));
    expect(await (await publicBalanceDoor(client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'card', balance: '0.0000', expiresOn: null });
  });

  it('any status but active, no row at all, and "not found" are the one answer', async () => {
    for (const cards of [
      () => json({ data: [{ status: 'void', balance: '19', expires_on: null }] }),
      () => json({ data: [{ status: 'expired', balance: '19', expires_on: '2020-01-01' }] }),
      () => json({ data: [{ status: 'inactive', balance: '0', expires_on: null }] }),
      () => json({ data: [] }),
      () => refusal('PUBLIC_REF_NOT_FOUND', 404),
      () => refusal('PUBLIC_ACTION_NOT_ALLOWED', 403),
    ]) {
      const { client } = shop(cards);
      expect(await (await publicBalanceDoor(client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'invalid' });
    }
  });

  it('a code that is not twelve characters is never sent', async () => {
    const { client, sent } = shop(() => json({ data: [] }));
    const door = (await publicBalanceDoor(client))!;
    const before = sent.length;
    for (const typed of ['GC-7K2M', 'GC-7K2MW3HNQ4XPZZ', '   ']) expect(await door.byCode(typed)).toEqual({ kind: 'invalid' });
    expect(sent.length).toBe(before);
  });

  it('too many tries is a wait, with the seconds the server said', async () => {
    const { client } = shop(() => refusal('PUBLIC_RATE_LIMITED', 429, { 'retry-after': '42' }));
    expect(await (await publicBalanceDoor(client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'wait', seconds: 42 });
    const quiet = shop(() => refusal('PUBLIC_RATE_LIMITED', 429));
    expect(await (await publicBalanceDoor(quiet.client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'wait', seconds: null });
  });

  it('no answer, or a server that failed, is said as that — never as a card that is not valid', async () => {
    const down = shop(() => Promise.reject(new TypeError('fetch failed')));
    expect(await (await publicBalanceDoor(down.client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'failed' });
    const broken = shop(() => json({ error: { code: 'INTERNAL', message: 'boom' } }, 500));
    expect(await (await publicBalanceDoor(broken.client))!.byCode('GC-7K2MW3HNQ4XP')).toEqual({ kind: 'failed' });
  });
});

describe('a balance by the link in the card’s email', () => {
  const linkShop = (opens: (sent: Sent) => Response, card: () => Response) =>
    clientOf('adm_pub_link', (sent) =>
      sent.path === '/api/v1/public/config'
        ? json(configOf({ offers_gift_cards_claimed: { actions: ['read'] } }, { strategy: 'token', ref: 'offers_gift_cards_claimed', match: ['link_token'] }))
        : sent.path === '/api/v1/public/claim/token'
          ? opens(sent)
          : card(),
    );

  it('is not offered where the page was handed no link key', async () => {
    const { client } = shop(() => json({ data: [] }));
    expect((await publicBalanceDoor(client))!.byLink).toBeNull();
    expect((await publicBalanceDoor(client, null))!.byLink).toBeNull();
  });

  it('opens the one card through Offers’ own key: the token in a body, then the card under the session it opened', async () => {
    const customer = shop(() => json({ data: [] }));
    const link = linkShop(
      () => json({ data: { session: 'sess_1', level: 'verified', expiresAt: Date.now() + 600_000 } }),
      () => json({ data: [{ status: 'active', balance: '25', expires_on: null }] }),
    );
    const door = (await publicBalanceDoor(customer.client, link.client))!;
    expect(await door.byLink!(' 6EMKX8GQW0WY0ZH1 ')).toEqual({ kind: 'card', balance: '25', expiresOn: null });
    // Offers' key, never the till's; the token in the body of a POST, in no address.
    expect(link.sent.map((one) => [one.method, one.path])).toEqual([
      ['POST', '/api/v1/public/claim/token'],
      ['GET', '/api/v1/public/config'],
      ['GET', '/api/v1/public/records/offers_gift_cards_claimed'],
    ]);
    expect(link.sent[0]!.body).toEqual({ token: '6EMKX8GQW0WY0ZH1' });
    for (const one of link.sent) expect(one.headers['authorization']).toBe('Bearer adm_pub_link');
    expect(link.sent[2]!.headers['x-adminium-public-session']).toBe('sess_1');
    expect(link.sent.map((one) => one.query).join('')).not.toContain('6EMK');
    expect(customer.sent.every((one) => one.path === '/api/v1/public/config')).toBe(true);
  });

  it('a token that opens nothing, a link stopped, and a card that can no longer pay are the one answer', async () => {
    const customer = shop(() => json({ data: [] }));
    for (const [opens, card] of [
      [() => refusal('PUBLIC_REF_NOT_FOUND', 404), () => json({ data: [] })],
      [() => refusal('LINK_EXPIRED', 410), () => json({ data: [] })],
      [() => json({ data: { session: 's', level: 'verified', expiresAt: Date.now() + 1000 } }), () => json({ data: [{ status: 'void', balance: '25', expires_on: null }] })],
      [() => json({ data: { session: 's', level: 'verified', expiresAt: Date.now() + 1000 } }), () => json({ data: [] })],
    ] as const) {
      const link = linkShop(opens, card);
      expect(await (await publicBalanceDoor(customer.client, link.client))!.byLink!('6EMKX8GQW0WY0ZH1')).toEqual({ kind: 'invalid' });
    }
    // An empty token is not sent at all.
    const link = linkShop(() => json({}), () => json({ data: [] }));
    expect(await (await publicBalanceDoor(customer.client, link.client))!.byLink!('  ')).toEqual({ kind: 'invalid' });
    expect(link.sent).toEqual([]);
  });

  it('too many tries on a link is a wait too', async () => {
    const customer = shop(() => json({ data: [] }));
    const link = linkShop(() => refusal('PUBLIC_RATE_LIMITED', 429, { 'retry-after': '30' }), () => json({ data: [] }));
    expect(await (await publicBalanceDoor(customer.client, link.client))!.byLink!('6EMKX8GQW0WY0ZH1')).toEqual({ kind: 'wait', seconds: 30 });
  });
});
