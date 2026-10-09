/**
 * A GIFT CARD'S BALANCE — the Guests side's door on Offers & gift cards.
 *
 * The till keeps no gift card of its own once Offers & gift cards is attached:
 * the cards are Offers', and Offers opens exactly two things to the public,
 * both on its `gift_cards` table and both answering `status`, `balance` and
 * `expires_on` and nothing else:
 *
 *   by code   an entry that rides THIS app's customer key while Offers is
 *             attached. It lists nothing, except the one row whose own code
 *             the request carries in the `x-adminium-code` header — never in
 *             the URL, which logs and proxies keep.
 *   by link   an entry on Offers' own key (`offers-link`, handed to the page
 *             in its served config as `addOns.offers.keys["offers-link"]`
 *             when the shop has one): the link in the card's email
 *             (`/gift-card#<token>`) opens that one card. A shop without that
 *             key has no link to open — the email then carries the code, and
 *             the page asks for it.
 *
 * Adminium decides what a card holds; this file only says it. Any card that
 * cannot pay — unknown, cancelled, not yet sold, past its date — reads as the
 * same one answer, so the page tells a stranger nothing about which codes
 * exist. A wrong code is a guess, and Adminium allows a visitor only a few a
 * minute: a code that is not twelve characters after its prefix is therefore
 * refused HERE, without asking, and spends none.
 *
 * Without Offers there is neither entry, and `publicBalanceDoor` answers null:
 * the page is then the not-found page.
 */
import { PublicApiError, type PublicClient, type Row } from '@adminiumjs/public-client';

/** Offers' gift cards, as its entries on a key are named (by the table's stored name). */
export const OFFERS_CARDS = 'offers_gift_cards';
/** The add-on's key, as the page's served config lists it. */
export const OFFERS_KEY = 'offers';
/** What Offers' own browser key opens — its name under the add-on in the page's served config. */
export const OFFERS_LINK_KEY = 'offers-link';

export type CardAnswer =
  /** A card that can pay. `balance` is the server's figure as it sent it; nothing is a balance too. */
  | { kind: 'card'; balance: string; expiresOn: string | null }
  /** Not a card that can pay — one sentence for every reason. */
  | { kind: 'invalid' }
  /** Too many tries: seconds until the next, when the server said. */
  | { kind: 'wait'; seconds: number | null }
  /** Adminium did not answer. */
  | { kind: 'failed' };

export interface BalanceDoor {
  /** ISO-4217, for the figure. */
  currency: string | null;
  byCode(typed: string): Promise<CardAnswer>;
  /** The emailed link's read; null when the page was handed no link key. */
  byLink: ((token: string) => Promise<CardAnswer>) | null;
}

/**
 * A card's code as the door sends one: `GC-` and twelve characters, in groups
 * of four. Dashes and spaces are the guest's to leave out or put in. Null when
 * it is not that.
 */
export function cardAsKept(text: string): string | null {
  const bare = text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^GC/, '');
  return bare.length === 12 ? `GC-${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8)}` : null;
}

/** Offers' cards entry on a key: the one a code unlocks when there is a choice. */
export function cardsRef(refs: Readonly<Record<string, { actions?: readonly string[]; unlock?: true } | undefined>>): string | null {
  const named = Object.keys(refs).filter((name) => name === OFFERS_CARDS || name.startsWith(`${OFFERS_CARDS}_`));
  return named.find((name) => refs[name]?.unlock === true) ?? named[0] ?? null;
}

function read(card: Row | undefined): CardAnswer {
  // Any state but "active" reads as no card at all; a balance of nothing is a balance.
  if (card === undefined || (card['status'] !== undefined && card['status'] !== null && card['status'] !== 'active')) return { kind: 'invalid' };
  const expires = card['expires_on'] ?? null;
  return { kind: 'card', balance: String(card['balance'] ?? '0'), expiresOn: expires === null || expires === '' ? null : String(expires).slice(0, 10) };
}

function refused(error: unknown): CardAnswer {
  if (!(error instanceof PublicApiError)) return { kind: 'failed' };
  if (error.code === 'PUBLIC_RATE_LIMITED') return { kind: 'wait', seconds: error.retryAfterSeconds ?? null };
  if (error.code === 'PUBLIC_NETWORK_UNAVAILABLE' || error.code === 'PUBLIC_UPSTREAM_UNAVAILABLE' || error.status === 0 || error.status >= 500) return { kind: 'failed' };
  // `PUBLIC_REF_NOT_FOUND` and every other refusal: nothing here that can pay.
  return { kind: 'invalid' };
}

/**
 * The door, or null when this shop's key carries no such entry (Offers & gift
 * cards is not attached, or is switched off for the till).
 *
 * `link` is a second client on Offers' own key, when the page was handed one.
 */
export async function publicBalanceDoor(client: PublicClient, link: PublicClient | null = null): Promise<BalanceDoor | null> {
  const config = await client.config();
  const ref = cardsRef(config.refs);
  if (ref === null) return null;
  return {
    currency: config.currency ?? null,
    async byCode(typed) {
      const code = cardAsKept(typed);
      // Not twelve characters: said without asking, and no guess is spent.
      if (code === null) return { kind: 'invalid' };
      try {
        return read((await client.list<Row>(ref, { limit: 1, code })).data[0]);
      } catch (error) {
        return refused(error);
      }
    },
    byLink:
      link === null
        ? null
        : async (token) => {
            if (token.trim() === '') return { kind: 'invalid' };
            try {
              // A link that opens nothing, or one stopped or past its date, is no card.
              if ((await link.openShared(token.trim())) !== 'opened') return { kind: 'invalid' };
              const linked = cardsRef((await link.config()).refs);
              if (linked === null) return { kind: 'invalid' };
              return read((await link.list<Row>(linked, { limit: 1 })).data[0]);
            } catch (error) {
              return refused(error);
            }
          },
  };
}
