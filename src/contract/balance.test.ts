/**
 * A GIFT CARD'S BALANCE ON THE GUESTS SIDE, ON EVERY ENGINE.
 *
 * Point of Sale beside Offers & gift cards (its sample in), with the public
 * API on. The Guests side's `/gift-card` page reads through one door
 * (`guests/balance.ts`), and that door is driven here exactly as the page
 * drives it — the served customer config, the real public client, a browser's
 * origin — against the built Adminium:
 *
 *   1. Offers' entry on gift cards rides the TILL'S customer key, and Offers'
 *      own link key is handed over beside it;
 *   2. a card's balance by the code on it — typed as printed, or with dashes
 *      and spaces as the guest pleases — carried in a header, never the URL;
 *   3. a card with nothing left on it is still a balance;
 *   4. a card that cannot pay (never sold) and a code nobody issued read as
 *      the same one answer;
 *   5. a code that is not twelve characters is never asked;
 *   6. Offers brought by the app's own install has no link key, so the page
 *      is handed none and the till's key opens no link;
 *   7. a guest who keeps guessing is stopped (last: it spends the minute's
 *      guesses);
 *
 * and, in a second shop where Offers itself was installed with its public
 * access allowed:
 *
 *   8. Offers' own key is handed to the page with the add-on, and the token of
 *      a card's emailed link reads that one card through it — a token nobody
 *      was sent, and a cancelled card's, are no card;
 *   9. Offers switched off for the till: the entry leaves the till's key, and
 *      there is no door — the page is the not-found page.
 */
import { randomUUID } from 'node:crypto';

import { createPublicClient } from '@adminiumjs/public-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OFFERS_KEY, OFFERS_LINK_KEY, cardsRef, publicBalanceDoor, type BalanceDoor, type CardAnswer } from '../guests/balance';
import { resolveSurfaceConfig } from '../publicConfig';
import { addOnBundle, Caller, ENGINES, missing, ok, type Engine } from './harness';
import { cents, standUp, type Row, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['BALANCE_PORT'] ?? 8940);

/** One of Offers' sample cards: sold, never spent, $19.00 on it. */
const SAMPLE = 'GC-7K2MW3HNQ4XP';

interface Heard {
  method: string;
  url: string;
  code: string | null;
  status: number;
  error: string | undefined;
}

describe.skipIf(why !== null)(`a gift card's balance on the Guests side, on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let door: BalanceDoor;
      let served: Awaited<ReturnType<typeof resolveSurfaceConfig>>;
      const heard: Heard[] = [];
      /** As a browser on the hosted page sends it: the page's own origin; every request noted. */
      const asBrowser: typeof fetch = async (input, init) => {
        const headers: Record<string, string> = { ...(init?.headers as Record<string, string>), origin: s.server.base };
        const res = await fetch(input, { ...init, headers });
        const error = res.ok ? undefined : ((await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        heard.push({ method: init?.method ?? 'GET', url: String(input), code: headers['x-adminium-code'] ?? null, status: res.status, error });
        return res;
      };
      const card = async (code: string): Promise<Row> => (await s.rows('offers_gift_cards')).find((one) => one['code'] === code)!;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_balance_${engine}`, { addOns: ['offers'], addOnSamples: ['offers'] });
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        ok(await s.staff.put('/api/v1/public-api', { enabled: true }));
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it('Offers’ entry on gift cards rides the till’s customer key: one row, shown only with its own code', async () => {
        served = await resolveSurfaceConfig({ baked: {}, hostedCustomer: true, base: `${s.server.base}/apps/pos/customer/`, origin: s.server.base });
        if (served === null) throw new Error('the customer surface served no key');
        const raw = ok(await new Caller(s.server.base).get<Row>('/apps/pos/customer/surface-config.json'));
        const refs = ok(await new Caller(s.server.base, { authorization: `Bearer ${served.publishableKey}`, origin: s.server.base }).get<{ data: { refs: Record<string, Row> } }>('/api/v1/public/config')).data.refs;
        const said = `served: ${JSON.stringify({ addOns: raw['addOns'], publicKeys: Object.keys((raw['publicKeys'] as Row | undefined) ?? {}) }).replace(/adm_pub_\w+/g, 'adm_pub_…')}\nrefs: ${JSON.stringify(refs)}`;
        const ref = cardsRef(refs as never);
        expect(ref, said).toBe('offers_gift_cards_unlocked');
        expect(refs[ref!], said).toMatchObject({ actions: ['read'], expose: ['status', 'balance', 'expires_on'], unlock: true });
        // The public document says Offers is there.
        expect(served.addOns?.[OFFERS_KEY], said).toBeDefined();

        const client = createPublicClient({ baseUrl: served.baseUrl, publishableKey: served.publishableKey, fetch: asBrowser });
        const made = await publicBalanceDoor(client!, null);
        expect(made, said).not.toBeNull();
        door = made!;
        expect(door.currency).toBe('USD');
      }, 120_000);

      it('Offers brought by the app’s own install has no link key of its own: the page is handed none, and asks for the code', async () => {
        /*
         * Offers' link key (`offers-link`) is made when Offers ITSELF is
         * installed with its public access allowed — see the second shop
         * below. Ticked at the app's install, as here, the shop holds one
         * browser key, the till's; so the page has no link to open.
         */
        const keys = ok(await s.staff.get<{ keys: { appKey: string; purpose: string; access: { ref: string }[] }[] }>('/api/v1/public-keys')).keys;
        expect(keys.map((key) => [key.appKey, key.purpose])).toEqual([['pos', 'customer']]);
        expect(keys[0]!.access.map((entry) => entry.ref)).toContain('offers_gift_cards_unlocked');
        expect(served!.addOns?.[OFFERS_KEY]?.keys ?? {}).toEqual({});
        expect(door.byLink).toBeNull();
        // The till's own key opens no link: a token sent with it is refused, whatever it is.
        const stranger = createPublicClient({ baseUrl: served!.baseUrl, publishableKey: served!.publishableKey, fetch: asBrowser })!;
        heard.length = 0;
        await expect(stranger.openShared('not-a-token-anybody-was-sent')).rejects.toMatchObject({ status: 403, code: 'PUBLIC_CLAIM_UNAVAILABLE' });
        expect(heard.map((one) => [one.method, new URL(one.url).pathname, one.status, one.error])).toEqual([['POST', '/api/v1/public/claim/token', 403, 'PUBLIC_CLAIM_UNAVAILABLE']]);
      }, 60_000);

      it('a card’s balance by the code on it: $19.00, in a header and never the address — however the guest spaces it', async () => {
        const kept = await card(SAMPLE);
        expect([kept['status'], cents(kept['balance'])]).toEqual(['active', 1900]);
        const expires = kept['expires_on'] === null || kept['expires_on'] === undefined ? null : String(kept['expires_on']).slice(0, 10);
        for (const typed of [SAMPLE, 'gc 7k2m-w3hn q4xp', '7K2MW3HNQ4XP']) {
          heard.length = 0;
          const answer = await door.byCode(typed);
          expect(answer, `${typed}: ${JSON.stringify(heard)}`).toEqual({ kind: 'card', balance: expect.stringMatching(/^19(\.0+)?$/), expiresOn: expires });
          // One request, the code in its header, and nowhere in the address.
          expect(heard.map((one) => [one.method, one.code, one.status])).toEqual([['GET', 'GC-7K2M-W3HN-Q4XP', 200]]);
          expect(heard[0]!.url.toUpperCase()).not.toContain('7K2M');
          expect(heard[0]!.url.toUpperCase()).not.toContain('Q4XP');
        }
      }, 120_000);

      it('answers the balance and until when, and nothing else of the card', async () => {
        const reply = await fetch(heard.at(-1)!.url, { headers: { authorization: `Bearer ${served!.publishableKey}`, origin: s.server.base, 'x-adminium-code': SAMPLE } });
        const body = (await reply.json()) as { data: Row[] };
        expect(reply.status, JSON.stringify(body)).toBe(200);
        expect(body.data).toHaveLength(1);
        expect(Object.keys(body.data[0]!).sort()).toEqual(['balance', 'expires_on', 'status']);
        // Without a code the same address lists no card at all.
        const bare = await fetch(heard.at(-1)!.url, { headers: { authorization: `Bearer ${served!.publishableKey}`, origin: s.server.base } });
        expect([bare.status, ((await bare.json()) as { data?: Row[] }).data ?? []]).toEqual([200, []]);
      }, 60_000);

      it('a card with nothing left on it is still a balance: $0.00', async () => {
        // Spent to the cent at the till: a ticket of more than it holds, paid from it.
        const ticket = await s.insert('tickets', { guests: 1, status: 'open' });
        await s.insert('ticket_items', { ticket_id: ticket['id'], name: 'Hamper', qty: 1, unit_price: 40, seat: 1 });
        const paid = await s.post('payments', { id: randomUUID(), ticket_id: ticket['id'], method: 'gift_card', card_code: SAMPLE });
        expect(paid.status, JSON.stringify(paid.body).slice(0, 400)).toBe(201);
        const kept = await card(SAMPLE);
        expect([kept['status'], cents(kept['balance'])]).toEqual(['active', 0]);
        const answer = await door.byCode(SAMPLE);
        expect(answer).toMatchObject({ kind: 'card', balance: expect.stringMatching(/^0(\.0+)?$/) });
      }, 120_000);

      it('a code that is not twelve characters is never asked: no request, no guess spent', async () => {
        heard.length = 0;
        for (const typed of ['GC-7K2M', '', 'GC-7K2MW3HNQ4X', 'GC-7K2MW3HNQ4XPZ', 'hello']) expect(await door.byCode(typed), typed).toEqual({ kind: 'invalid' });
        expect(heard).toEqual([]);
      });

      const guesses: CardAnswer[] = [];
      it('a card never sold, and a code nobody issued, read as the same one answer', async () => {
        // Made at the desk and not sold: it holds nothing and cannot pay.
        const made = await s.post('offers_gift_cards', { kind: 'card' });
        expect(made.status, JSON.stringify(made.body).slice(0, 400)).toBe(201);
        const code = (made.body as unknown as { once: { column: string; value: string }[] }).once.find((entry) => entry.column === 'code')!.value;
        expect((await card(code))['status']).toBe('inactive');
        heard.length = 0;
        const unsold = await door.byCode(code);
        const nobody = await door.byCode('GC-ZZZZ-ZZZZ-ZZZZ');
        guesses.push(unsold, nobody);
        expect([unsold, nobody], JSON.stringify(heard)).toEqual([{ kind: 'invalid' }, { kind: 'invalid' }]);
        // Both were asked, and Adminium said the same of each.
        expect(heard.map((one) => [one.status, one.error])).toEqual([heard[0] === undefined ? [] : [heard[0].status, heard[0].error], heard[0] === undefined ? [] : [heard[0].status, heard[0].error]]);
      }, 60_000);

      it('a guest who keeps guessing is stopped, and told to wait', async () => {
        heard.length = 0;
        let stopped: CardAnswer | null = null;
        // Adminium allows a visitor a few wrong codes a minute; two are spent above.
        for (let i = 0; i < 12 && stopped === null; i += 1) {
          const answer = await door.byCode(`GC-QQQQ-QQQQ-${String(1000 + i)}`);
          if (answer.kind === 'wait') stopped = answer;
          else expect(answer, JSON.stringify(heard.at(-1))).toEqual({ kind: 'invalid' });
        }
        expect(stopped, JSON.stringify(heard.map((one) => [one.status, one.error]))).not.toBeNull();
        expect(heard.at(-1)).toMatchObject({ status: 429, error: 'PUBLIC_RATE_LIMITED' });
        // How long: the server says, in seconds, and it is within the minute.
        const seconds = (stopped as Extract<CardAnswer, { kind: 'wait' }>).seconds;
        expect(seconds === null || (seconds > 0 && seconds <= 60), String(seconds)).toBe(true);
        // While stopped, even the right code is not looked up.
        expect((await door.byCode(SAMPLE)).kind).toBe('wait');
      }, 120_000);
    });

    describe.skipIf(!available)(`on ${engine}, with Offers installed by itself and its public access allowed`, () => {
      let s: Stand;
      const asBrowser: typeof fetch = async (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), origin: s.server.base } });
      const servedNow = () => resolveSurfaceConfig({ baked: {}, hostedCustomer: true, base: `${s.server.base}/apps/pos/customer/`, origin: s.server.base });
      const doorNow = async (): Promise<BalanceDoor | null> => {
        const served = await servedNow();
        if (served === null) throw new Error('the customer surface served no key');
        const linkKey = served.addOns?.[OFFERS_KEY]?.keys[OFFERS_LINK_KEY];
        const client = createPublicClient({ baseUrl: served.baseUrl, publishableKey: served.publishableKey, fetch: asBrowser })!;
        const link = linkKey === undefined ? null : createPublicClient({ baseUrl: served.baseUrl, publishableKey: linkKey, fetch: asBrowser });
        return publicBalanceDoor(client, link);
      };
      /** A card sold at Offers' desk for this much, with someone to email it to: its key, its code and its link's token. */
      const cardFor = async (amount: string, to: string): Promise<{ id: unknown; code: string; token: string }> => {
        const made = await s.insert('offers_gift_cards', { kind: 'card', recipient_email: to, recipient_name: 'Ada' }, { offers_card_actions: [{ action: 'issue', amount, reason: 'Sold at the desk', paid_by: 'cash' }] });
        const kept = await s.one('offers_gift_cards', made['id']);
        expect([kept['status'], cents(kept['balance'])]).toEqual(['active', cents(amount)]);
        return { id: made['id'], code: String(kept['code']), token: String(kept['link_token']) };
      };

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_balance_link_${engine}`, { uploadOnly: ['offers'] });
        await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
        ok(await s.staff.put('/api/v1/public-api', { enabled: true }));
        // Offers, installed as an owner installs an add-on: attached to the till, its public access allowed.
        const offers = addOnBundle('offers');
        const body = { key: offers.key, version: offers.version, attachTo: ['pos'], connectionId: s.connectionId };
        const plan = ok(await s.staff.post<{ plan: { checksum?: string }; publicAccess?: { linkKey?: string; byApp?: Record<string, { adds: string[] }> } }>('/api/v1/add-ons/plan', body));
        // The check says what it would open: one entry onto the till's key, and its own link key.
        expect([plan.publicAccess?.linkKey, plan.publicAccess?.byApp?.['pos']?.adds]).toEqual([OFFERS_LINK_KEY, ['offers_gift_cards_unlocked']]);
        const installed = await s.staff.post('/api/v1/add-ons', { ...body, publicAccess: true, ...(plan.plan.checksum === undefined ? {} : { planChecksum: plan.plan.checksum }) });
        expect(installed.status, JSON.stringify(installed.body).slice(0, 800)).toBe(200);
        await s.refreshIds();
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it('Offers’ own key is handed to the till’s page with the add-on, by what it opens', async () => {
        const keys = ok(await s.staff.get<{ keys: { appKey: string; purpose: string; access: { ref: string }[] }[] }>('/api/v1/public-keys')).keys;
        expect(keys.map((key) => [key.appKey, key.purpose, key.access.map((entry) => entry.ref).filter((ref) => ref.startsWith('offers_'))]).sort()).toEqual([
          ['offers', OFFERS_LINK_KEY, ['offers_gift_cards_claimed']],
          ['pos', 'customer', ['offers_gift_cards_unlocked']],
        ]);
        const served = (await servedNow())!;
        expect(Object.keys(served.addOns?.[OFFERS_KEY]?.keys ?? {})).toEqual([OFFERS_LINK_KEY]);
        // A different key from the till's own, and never listed among the till's.
        expect(served.addOns![OFFERS_KEY]!.keys[OFFERS_LINK_KEY]).not.toBe(served.publishableKey);
        expect(served.publicKeys ?? {}).toEqual({});
      }, 60_000);

      let sold: { id: unknown; code: string; token: string };
      it('the token of a card’s emailed link reads that one card; its code reads the same', async () => {
        sold = await cardFor('25.00', `ada.${engine}@daybreak-guests.dev`);
        const door = (await doorNow())!;
        expect(door.byLink).not.toBeNull();
        expect(await door.byLink!(sold.token)).toEqual({ kind: 'card', balance: expect.stringMatching(/^25(\.0+)?$/), expiresOn: null });
        expect(await door.byCode(sold.code)).toEqual({ kind: 'card', balance: expect.stringMatching(/^25(\.0+)?$/), expiresOn: null });
      }, 120_000);

      it('a link reads its own card and no other', async () => {
        const other = await cardFor('40.00', `bea.${engine}@daybreak-guests.dev`);
        const door = (await doorNow())!;
        expect(await door.byLink!(other.token)).toMatchObject({ kind: 'card', balance: expect.stringMatching(/^40(\.0+)?$/) });
        // A new page, the first card's link: the first card.
        expect(await (await doorNow())!.byLink!(sold.token)).toMatchObject({ kind: 'card', balance: expect.stringMatching(/^25(\.0+)?$/) });
      }, 120_000);

      it('a token nobody was sent, and the link of a card since cancelled, are no card', async () => {
        const door = (await doorNow())!;
        expect(await door.byLink!('NOTATOKENANYBODYWASSENT')).toEqual({ kind: 'invalid' });
        ok(await s.staff.patch(`${s.data('offers_gift_cards')}/${String(sold.id)}`, { values: { status: 'void', void_reason: 'Lost' } }));
        expect((await s.one('offers_gift_cards', sold.id))['status']).toBe('void');
        expect(await (await doorNow())!.byLink!(sold.token)).toEqual({ kind: 'invalid' });
      }, 120_000);

      it('Offers switched off for the till: its entry leaves the till’s key, and there is no door', async () => {
        const off = ok(await s.staff.patch<{ publicAccess?: { withdrawn: string[] } }>('/api/v1/add-ons/offers', { attachedTo: 'pos', enabled: false }));
        expect(off.publicAccess?.withdrawn).toEqual(['offers_gift_cards_unlocked']);
        expect(await doorNow()).toBeNull();
        expect((await servedNow())!.addOns?.[OFFERS_KEY]).toBeUndefined();
        // Switched on again with its public access allowed, the door is back.
        const on = ok(await s.staff.patch<{ publicAccess?: { granted: string[] } }>('/api/v1/add-ons/offers', { attachedTo: 'pos', enabled: true, publicAccess: true }));
        expect(on.publicAccess?.granted).toEqual(['offers_gift_cards_unlocked']);
        expect(await doorNow()).not.toBeNull();
      }, 120_000);
    });
  });
});
