/**
 * THE GUESTS PAGES OVER THE PUBLIC API — which refs they use, what they send,
 * and how every refusal Adminium can give reaches the page.
 */
import { describe, expect, it, vi } from 'vitest';
import { PublicApiError, type PublicClient, type PublicConfig } from '@adminiumjs/public-client';

import { GuestError, guestErrorOf, guestRefs, publicGuestsPort } from './api';

const CONFIG = {
  version: 1,
  side: 'customer',
  timezone: 'Europe/Lisbon',
  currency: 'EUR',
  claim: { strategy: 'lookup', ref: 'pos_reservations_claimed', match: ['code', 'mobile'] },
  refs: {
    pos_settings: { actions: ['read'] },
    pos_booking_rules: { actions: ['read'] },
    pos_reservations: { actions: ['create'] },
    pos_reservations_claimed: { actions: ['read', 'update'] },
    pos_reservations_availability: { actions: ['read'], kind: 'availability' },
  },
} as unknown as PublicConfig;

function fakeClient(over: Partial<PublicClient> = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const record =
    <T,>(op: string, answer: (...args: unknown[]) => T) =>
    async (...args: unknown[]) => {
      calls.push({ op, args });
      return answer(...args);
    };
  const client = {
    config: async () => CONFIG,
    list: record('list', (ref) =>
      ref === 'pos_settings'
        ? { data: [{ venue_name: 'Martin’s', venue_mark: 'M', phone: '(415) 555-0148', address: '128 Alder Lane' }] }
        : ref === 'pos_booking_rules'
          ? { data: [{ opens: '17:00:00', closes: '21:00:00', slot_minutes: 30, max_party: '8', days_ahead: 5, hold_minutes: 15, cancel_hours: 2, occasions: '["birthday","date"]' }] }
          : { data: [{ id: 91, code: 'MR-4829', name: 'Mara Rossi', party_size: 2, starts_at: '2026-09-24T18:00:00Z', status: 'confirmed', occasion: 'anniversary', guest_request: null }] },
    ),
    create: record('create', () => ({ id: 92, code: 'MR-7Q2K', starts_at: '2026-09-24T18:30:00Z', party_size: 3, status: 'confirmed' })),
    update: record('update', () => ({})),
    availability: record('availability', () => [{ time: '19:00', state: 'free' }]),
    claim: record('claim', () => true),
    ...over,
  } as unknown as PublicClient;
  return { client, calls };
}

describe('which refs the pages use', () => {
  it('takes the claim’s own ref, the availability ref by its kind, and the tables’ real names', () => {
    expect(guestRefs(CONFIG as never, { reservations: 'pos_reservations', settings: 'pos_settings', booking_rules: 'pos_booking_rules' })).toEqual({
      settings: 'pos_settings',
      bookingRules: 'pos_booking_rules',
      book: 'pos_reservations',
      claimed: 'pos_reservations_claimed',
      availability: 'pos_reservations_availability',
    });
  });

  it('finds the real names in the scope when the page was not told them', () => {
    const refs = guestRefs(CONFIG as never);
    expect([refs.settings, refs.bookingRules, refs.book]).toEqual(['pos_settings', 'pos_booking_rules', 'pos_reservations']);
  });
});

describe('what reaches the page when Adminium says no', () => {
  it('names each refusal the way the page tells it', () => {
    const kind = (code: string, status = 409, retry?: number, claimed = false) => {
      const e = guestErrorOf(new PublicApiError(code as never, status, 'x', retry), claimed);
      return [e.kind, e.retryAfter];
    };
    expect(kind('PUBLIC_SLOT_FULL')).toEqual(['full', null]);
    expect(kind('PUBLIC_SLOT_BUSY')).toEqual(['full', null]);
    expect(kind('PUBLIC_TOO_LATE')).toEqual(['too-late', null]);
    expect(kind('PUBLIC_CLAIM_NO_MATCH', 403)).toEqual(['no-match', null]);
    expect(kind('PUBLIC_RATE_LIMITED', 429, 840)).toEqual(['locked', 840]);
    expect(kind('PUBLIC_NETWORK_UNAVAILABLE', 0)).toEqual(['network', null]);
    // A claimed ref goes "not found" once its session has run out.
    expect(kind('PUBLIC_REF_NOT_FOUND', 404, undefined, true)).toEqual(['expired', null]);
    expect(kind('PUBLIC_REF_NOT_FOUND', 404)).toEqual(['refused', null]);
    expect(guestErrorOf(new TypeError('Failed to fetch')).kind).toBe('network');
  });
});

describe('the public port', () => {
  it('reads the venue and its rules openly', async () => {
    const port = await publicGuestsPort(fakeClient().client);
    expect(port.timeZone()).toBe('Europe/Lisbon');
    expect(await port.venue()).toEqual({ name: 'Martin’s', mark: 'M', phone: '(415) 555-0148', address: '128 Alder Lane' });
    expect(await port.rules()).toEqual({ opens: '17:00', closes: '21:00', slotMinutes: 30, maxParty: 8, daysAhead: 5, holdMinutes: 15, cancelHours: 2, occasions: ['birthday', 'date'] });
  });

  it('books with one POST — the server gives the code — and sends no empty optional field', async () => {
    const { client, calls } = fakeClient();
    const port = await publicGuestsPort(client);
    const at = Date.parse('2026-09-24T18:30:00Z');
    const booked = await port.book({ startsAt: at, party: 3, name: 'Ada', mobile: '+1 415 555 0101', email: null, occasion: 'birthday', request: null });
    expect(calls.find((c) => c.op === 'create')!.args).toEqual([
      'pos_reservations',
      { starts_at: '2026-09-24T18:30:00.000Z', party_size: 3, name: 'Ada', mobile: '+1 415 555 0101', occasion: 'birthday' },
    ]);
    expect(booked).toMatchObject({ id: '92', code: 'MR-7Q2K', partySize: 3, name: 'Ada', occasion: 'birthday' });
  });

  it('asks the availability ref for a day and a party', async () => {
    const { client, calls } = fakeClient();
    const port = await publicGuestsPort(client);
    expect(await port.availability('2026-09-24', 4)).toEqual([{ time: '19:00', state: 'free' }]);
    expect(calls.find((c) => c.op === 'availability')!.args).toEqual(['pos_reservations_availability', '2026-09-24', 4]);
  });

  it('finds a booking by claiming it, then reads it through the claim', async () => {
    const { client, calls } = fakeClient();
    const port = await publicGuestsPort(client);
    const b = await port.find('mr-4829', '(415) 555-0166');
    expect(calls.find((c) => c.op === 'claim')!.args).toEqual([{ code: 'mr-4829', mobile: '(415) 555-0166' }]);
    expect(b).toMatchObject({ id: '91', code: 'MR-4829', status: 'confirmed', occasion: 'anniversary', request: null });
  });

  it('says "not found" for a claim that did not match, and passes a lockout on', async () => {
    const no = await publicGuestsPort(fakeClient({ claim: async () => false }).client);
    await expect(no.find('MR-0000', '1')).rejects.toMatchObject({ kind: 'no-match' });
    const locked = await publicGuestsPort(
      fakeClient({
        claim: async () => {
          throw new PublicApiError('PUBLIC_RATE_LIMITED', 429, 'slow down', 900);
        },
      }).client,
    );
    await expect(locked.find('MR-4829', '1')).rejects.toEqual(new GuestError('locked', 900));
  });

  it('changes and cancels through the claimed ref, and says why the server refused', async () => {
    const { client, calls } = fakeClient();
    const port = await publicGuestsPort(client);
    await port.change('91', { startsAt: Date.parse('2026-09-25T19:00:00Z'), party: 4 });
    await port.cancel('91');
    expect(calls.filter((c) => c.op === 'update').map((c) => c.args)).toEqual([
      ['pos_reservations_claimed', '91', { starts_at: '2026-09-25T19:00:00.000Z', party_size: 4 }],
      ['pos_reservations_claimed', '91', { status: 'cancelled' }],
    ]);
    const late = await publicGuestsPort(
      fakeClient({
        update: vi.fn(async () => {
          throw new PublicApiError('PUBLIC_TOO_LATE', 409, 'late');
        }) as never,
      }).client,
    );
    await expect(late.cancel('91')).rejects.toMatchObject({ kind: 'too-late' });
  });
});
