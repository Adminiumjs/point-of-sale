/**
 * What the Guests pages ask of Adminium — book a table, and "Manage my
 * booking" — as one small port, so the screens run the same over the public
 * API (a hosted customer surface) and over the demo's memory.
 *
 *   publicGuestsPort   the public API, with the app's browser key: the
 *                      venue and its rules read openly, free-or-full times
 *                      from the availability ref, one POST to book, and a
 *                      claim `{code, mobile}` for everything after that.
 *   demoGuestsPort     the demo (guests/demoPort.ts), over the till's own
 *                      bookings so a guest's table shows up at the till.
 *
 * Adminium decides (§2.11): it answers free or full, never how many seats;
 * it gives the booking its code; it re-checks the slot on every write; it
 * keeps the cancellation window and the claim's lockout. The page only says
 * what came back, in the guest's language — every refusal arrives here as a
 * `GuestError` whose `kind` is what the page shows.
 */
import { PublicApiError, type PublicClient, type Row } from '@adminiumjs/public-client';
import type { ReservationStatus } from '../data/types';

/** The venue's own details, for the header, the "call us" lines and the email. */
export interface GuestVenue {
  name: string | null;
  mark: string | null;
  phone: string | null;
  address: string | null;
}

/** The booking rules a guest sees (`booking_rules`). */
export interface GuestRules {
  opens: string;
  closes: string;
  slotMinutes: number;
  maxParty: number;
  daysAhead: number;
  holdMinutes: number;
  cancelHours: number;
  occasions: string[];
}

/** A booking, as the guest who holds it may see it. */
export interface GuestBooking {
  id: string;
  code: string;
  name: string;
  partySize: number;
  /** A millisecond stamp. */
  startsAt: number;
  status: ReservationStatus;
  occasion: string | null;
  request: string | null;
}

export interface NewBooking {
  startsAt: number;
  party: number;
  name: string;
  mobile: string;
  email: string | null;
  occasion: string | null;
  request: string | null;
}

export interface Slot {
  /** `HH:mm` on the venue's clock. */
  time: string;
  state: 'free' | 'full';
}

/**
 * What went wrong, as the page tells it:
 *
 *   full       the time filled up (or is filling: `busy` is the same to a guest)
 *   too-late   inside the cancellation window
 *   no-match   no booking with those details — one message for a wrong code and a wrong number
 *   locked     too many tries; `retryAfter` seconds until the next
 *   expired    the claim session ran out; find the booking again
 *   network    Adminium did not answer
 *   refused    anything else the server would not take
 */
export type GuestErrorKind = 'full' | 'too-late' | 'no-match' | 'locked' | 'expired' | 'network' | 'refused';

export class GuestError extends Error {
  constructor(
    readonly kind: GuestErrorKind,
    readonly retryAfter: number | null = null,
  ) {
    super(kind);
    this.name = 'GuestError';
  }
}

export interface GuestsPort {
  /** The venue's zone: every day and time is shown and sent in it. */
  timeZone(): string | undefined;
  venue(): Promise<GuestVenue>;
  rules(): Promise<GuestRules>;
  /** A day's times for a party: free or full. The guest's own booking is not counted against them. */
  availability(day: string, party: number): Promise<Slot[]>;
  book(booking: NewBooking): Promise<GuestBooking>;
  /** Claim the booking with its code and mobile, then read it. */
  find(code: string, mobile: string): Promise<GuestBooking>;
  change(id: string, to: { startsAt: number; party: number }): Promise<GuestBooking>;
  cancel(id: string): Promise<GuestBooking>;
}

/** The refs the pages use, by the tables' short names. */
export interface GuestRefs {
  settings: string;
  bookingRules: string;
  /** The POST ref: book a table. */
  book: string;
  /** The claimed GET/PATCH ref. */
  claimed: string;
  /** The free-or-full ref. */
  availability: string;
}

/**
 * The refs, from the key's own scope.
 *
 * An install names each ref after the table it made (`pos_reservations`,
 * `pos_reservations_claimed`, `pos_reservations_availability`), so the scope
 * is read rather than guessed: the claim names its own ref, the availability
 * ref says what kind it is, and the rest are the tables' real names — handed
 * over by the surface config when Adminium serves the page, else found by
 * their short name at the end of a ref.
 */
export function guestRefs(
  config: { claim: { ref: string } | null; refs: Record<string, { actions: string[]; kind?: string }> },
  tables: Readonly<Record<string, string>> = {},
): GuestRefs {
  const names = Object.keys(config.refs);
  const real = (short: string) => tables[short] ?? names.find((n) => n === short || n.endsWith(`_${short}`)) ?? short;
  const reservations = real('reservations');
  const availability =
    names.find((n) => config.refs[n]!.kind === 'availability') ?? `${reservations}_availability`;
  return {
    settings: real('settings'),
    bookingRules: real('booking_rules'),
    book: reservations,
    claimed: config.claim?.ref ?? `${reservations}_claimed`,
    availability,
  };
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};
const hhmm = (v: unknown, fallback: string): string => (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : fallback);

export function bookingOf(row: Row): GuestBooking {
  return {
    id: String(row['id']),
    code: String(row['code'] ?? ''),
    name: String(row['name'] ?? ''),
    partySize: num(row['party_size'], 2),
    startsAt: Date.parse(String(row['starts_at'])),
    status: (text(row['status']) ?? 'confirmed') as ReservationStatus,
    occasion: text(row['occasion']),
    request: text(row['guest_request']),
  };
}

/** The server's refusal, as the page tells it. */
export function guestErrorOf(error: unknown, claimed = false): GuestError {
  if (error instanceof GuestError) return error;
  if (!(error instanceof PublicApiError)) return new GuestError('network');
  switch (error.code) {
    case 'PUBLIC_SLOT_FULL':
    case 'PUBLIC_SLOT_BUSY':
      return new GuestError('full');
    case 'PUBLIC_TOO_LATE':
      return new GuestError('too-late');
    case 'PUBLIC_CLAIM_NO_MATCH':
      return new GuestError('no-match');
    case 'PUBLIC_RATE_LIMITED':
      return new GuestError('locked', error.retryAfterSeconds);
    case 'PUBLIC_NETWORK_UNAVAILABLE':
    case 'PUBLIC_UPSTREAM_UNAVAILABLE':
      return new GuestError('network');
    case 'PUBLIC_REF_NOT_FOUND':
      // A claimed ref answers "not found" once the session behind it has run out.
      return new GuestError(claimed ? 'expired' : 'refused');
    default:
      return new GuestError('refused');
  }
}

/** The public API, through the app's browser key. */
export async function publicGuestsPort(client: PublicClient, tables: Readonly<Record<string, string>> = {}): Promise<GuestsPort> {
  const config = await client.config();
  const refs = guestRefs(config, tables);
  const zone = config.timezone;
  const first = async (ref: string): Promise<Row | null> => (await client.list(ref, { limit: 1 })).data[0] ?? null;
  const readBooking = async (id?: string): Promise<GuestBooking> => {
    const rows = (await client.list(refs.claimed, { limit: 5 })).data;
    const row = id === undefined ? rows[0] : (rows.find((r) => String(r['id']) === id) ?? rows[0]);
    if (row === undefined) throw new GuestError('no-match');
    return bookingOf(row);
  };
  const guard = async <T>(run: () => Promise<T>, claimed = false): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      throw guestErrorOf(error, claimed);
    }
  };
  return {
    timeZone: () => zone,
    venue: () =>
      guard(async () => {
        const row = await first(refs.settings);
        return { name: text(row?.['venue_name']), mark: text(row?.['venue_mark']), phone: text(row?.['phone']), address: text(row?.['address']) };
      }),
    rules: () =>
      guard(async () => {
        const row = await first(refs.bookingRules);
        return {
          opens: hhmm(row?.['opens'], '17:00'),
          closes: hhmm(row?.['closes'], '21:00'),
          slotMinutes: num(row?.['slot_minutes'], 30),
          maxParty: num(row?.['max_party'], 8),
          daysAhead: num(row?.['days_ahead'], 5),
          holdMinutes: num(row?.['hold_minutes'], 15),
          cancelHours: num(row?.['cancel_hours'], 2),
          occasions: list(row?.['occasions']),
        };
      }),
    availability: (day, party) => guard(() => client.availability(refs.availability, day, party)),
    book: (b) =>
      guard(async () => {
        const row = await client.create(refs.book, {
          starts_at: new Date(b.startsAt).toISOString(),
          party_size: b.party,
          name: b.name,
          mobile: b.mobile,
          ...(b.email === null ? {} : { email: b.email }),
          ...(b.occasion === null ? {} : { occasion: b.occasion }),
          ...(b.request === null ? {} : { guest_request: b.request }),
        });
        return { ...bookingOf(row), name: b.name, occasion: b.occasion, request: b.request };
      }),
    find: (code, mobile) =>
      guard(async () => {
        if (!(await client.claim({ code, mobile }))) throw new GuestError('no-match');
        return readBooking();
      }),
    change: (id, to) =>
      guard(async () => {
        await client.update(refs.claimed, id, { starts_at: new Date(to.startsAt).toISOString(), party_size: to.party });
        return readBooking(id);
      }, true),
    cancel: (id) =>
      guard(async () => {
        await client.update(refs.claimed, id, { status: 'cancelled' });
        return readBooking(id);
      }, true),
  };
}
