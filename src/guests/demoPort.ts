/**
 * The demo's Guests port: the same answers Adminium gives, worked out in
 * memory over the TILL's own bookings — so a table booked on the guest page
 * is on the Reservations screen a tap later, as it would be for real.
 *
 * It keeps Adminium's rules rather than the comp's (§5.8.6): free or full per
 * slot on the venue's clock, a code that never repeats, the slot re-checked on
 * every write, the whole mobile number matched (not its last four digits), a
 * lockout after five misses that lifts after fifteen minutes, and cancelling
 * refused inside `cancel_hours`.
 *
 * Imported only by the demo build: it reads the till's store, which a customer
 * surface never loads.
 */
import { BOOKING_RULES, BRAND, BRAND_INITIAL, VENUE_ADDRESS, VENUE_PHONE } from '../data/demo';
import type { Reservation } from '../data/types';
import { venueStamp } from '../data/venueTime';
import { daySlots, seatsAt } from '../state/bookings';
import { usePos } from '../state/store';
import { GuestError, type GuestBooking, type GuestsPort } from './api';

/** The demo venue's own details. */
export const DEMO_VENUE = { name: BRAND, mark: BRAND_INITIAL, phone: VENUE_PHONE, address: VENUE_ADDRESS };

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

/** The digits of a phone number as dialled at home (the server's `phoneDigits`). */
const digits = (value: string): string => {
  const all = value.replace(/\D+/g, '');
  if (value.trim().startsWith('+')) return all;
  if (all.startsWith('00')) return all.slice(2);
  return all.startsWith('0') ? all.slice(1) : all;
};
/** The whole number, however punctuated, with room for a country code left off (the server's `samePhone`). */
export function samePhone(a: string, b: string): boolean {
  const x = digits(a);
  const y = digits(b);
  if (x.length < 7 || y.length < 7) return false;
  if (x === y) return true;
  const [long, short] = x.length > y.length ? [x, y] : [y, x];
  const extra = long.length - short.length;
  return extra >= 1 && extra <= 3 && long.endsWith(short);
}
/** A code as the `MR-` rule writes it (the server's `normaliseCode`). */
export function normaliseCode(value: string): string {
  const body = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tail = (body.startsWith('MR') ? body.slice(2) : body).replace(/O/g, '0').replace(/[IL]/g, '1');
  return `MR-${tail}`;
}

const asGuest = (r: Reservation): GuestBooking => ({
  id: r.id,
  code: r.code ?? '',
  name: r.name,
  partySize: r.partySize,
  startsAt: r.startsAt,
  status: r.status,
  occasion: r.occasion,
  request: r.request,
});

export function demoGuestsPort(opts: { now?: () => number } = {}): GuestsPort {
  const now = opts.now ?? Date.now;
  let misses = 0;
  let lockedUntil = 0;
  let claimed: string | null = null;
  const all = () => usePos.getState().reservations;
  const cap = BOOKING_RULES.coversPerSlot;
  const full = (at: number, party: number, except: string | null) => seatsAt(all(), at, except) + party > cap;
  const patch = (id: string, fields: Partial<Reservation>) =>
    usePos.setState((s) => ({ reservations: s.reservations.map((r) => (r.id === id ? { ...r, ...fields } : r)) }));
  const mine = (id: string): Reservation => {
    const r = all().find((x) => x.id === id);
    if (r === undefined || claimed !== id) throw new GuestError('expired');
    return r;
  };
  const code = (): string => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (;;) {
      let out = 'MR-';
      for (let i = 0; i < 4; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!all().some((r) => r.code === out)) return out;
    }
  };
  const settle = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 250));

  return {
    timeZone: () => undefined,
    venue: async () => ({ ...DEMO_VENUE }),
    rules: async () => ({ ...BOOKING_RULES, occasions: [...BOOKING_RULES.occasions] }),
    availability: async (day, party) =>
      daySlots(BOOKING_RULES).map((time) => {
        const at = venueStamp(day, time);
        return { time, state: at < now() || full(at, party, claimed) ? 'full' : 'free' };
      }),
    book: async (b) => {
      if (b.startsAt < now() || full(b.startsAt, b.party, null)) throw new GuestError('full');
      const r: Reservation = {
        id: `g${String(now())}`,
        code: code(),
        name: b.name,
        mobile: b.mobile,
        email: b.email,
        partySize: b.party,
        startsAt: b.startsAt,
        status: 'confirmed',
        channel: 'online',
        tableId: null,
        occasion: b.occasion,
        request: b.request,
        note: null,
      };
      usePos.setState((s) => ({ reservations: [...s.reservations, r].sort((a, c) => a.startsAt - c.startsAt) }));
      return settle(asGuest(r));
    },
    find: async (typedCode, mobile) => {
      if (now() < lockedUntil) throw new GuestError('locked', Math.ceil((lockedUntil - now()) / 1000));
      const wanted = normaliseCode(typedCode);
      const hit = all().find((r) => r.code === wanted && r.mobile !== null && samePhone(r.mobile, mobile));
      if (hit === undefined) {
        misses += 1;
        if (misses >= LOCK_AFTER) {
          misses = 0;
          lockedUntil = now() + LOCK_MS;
          throw new GuestError('locked', LOCK_MS / 1000);
        }
        throw new GuestError('no-match');
      }
      misses = 0;
      claimed = hit.id;
      return settle(asGuest(hit));
    },
    change: async (id, to) => {
      mine(id);
      if (to.startsAt < now() || full(to.startsAt, to.party, id)) throw new GuestError('full');
      patch(id, { startsAt: to.startsAt, partySize: to.party });
      return settle(asGuest(mine(id)));
    },
    cancel: async (id) => {
      const r = mine(id);
      if (r.startsAt - now() < BOOKING_RULES.cancelHours * 3_600_000) throw new GuestError('too-late');
      patch(id, { status: 'cancelled', tableId: null });
      return settle(asGuest(mine(id)));
    },
  };
}
