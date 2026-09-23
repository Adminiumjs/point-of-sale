/**
 * Bookings at the till: which days to show, the slots of a day, how full a
 * slot is, and which tables fit a party. Pure, so it is tested on its own.
 *
 * Every day and time is the VENUE's (`venueTime.ts`), and every limit comes
 * from its booking rules — the comp's fixed 17:00–21:00, twelve covers and five
 * days are only the demo's rules.
 *
 * The till's own count of a slot is a courtesy: it greys a full time out
 * before the cashier picks it. Adminium re-checks every booking as it is saved
 * and has the last word (a full slot comes back refused).
 */
import type { BookingRules, Reservation, TableInfo } from '../data/types';
import { addDays, slotsOf, venueDay, venueStamp, venueTime, weekday } from '../data/venueTime';

export interface BookingDay {
  /** 0 = today. */
  index: number;
  /** `YYYY-MM-DD` on the venue's calendar. */
  day: string;
  weekday: number;
}

/** Today and the days after it that take bookings (`days_ahead`, at least one). */
export function bookingDays(rules: BookingRules | null, now: number, timeZone?: string): BookingDay[] {
  const today = venueDay(now, timeZone);
  const count = Math.max(1, rules?.daysAhead ?? 5);
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(today, index);
    return { index, day, weekday: weekday(day) };
  });
}

/** The day a booking falls on, as an index into `days` (-1 when outside them). */
export function dayIndexOf(r: Reservation, days: BookingDay[], timeZone?: string): number {
  const day = venueDay(r.startsAt, timeZone);
  return days.findIndex((d) => d.day === day);
}

/** A day's booking times, `HH:MM`. */
export function daySlots(rules: BookingRules | null): string[] {
  if (rules === null) return slotsOf('17:00', '21:00', 30);
  return slotsOf(rules.opens, rules.closes, rules.slotMinutes);
}

/** The instant of a slot on a day. */
export const slotStamp = (day: string, time: string, timeZone?: string): number => venueStamp(day, time, timeZone);

/** A booking's time on the venue's clock, `HH:MM`. */
export const timeOf = (r: Reservation, timeZone?: string): string => venueTime(r.startsAt, timeZone);

/** Guests already booked into the slot starting at `at` (seated parties count too). */
export function seatsAt(reservations: Reservation[], at: number, excludeId: string | null = null): number {
  return reservations
    .filter((r) => r.startsAt === at && r.id !== excludeId && (r.status === 'confirmed' || r.status === 'seated'))
    .reduce((sum, r) => sum + r.partySize, 0);
}

/** Would `party` more guests overflow the slot? */
export function slotFull(reservations: Reservation[], rules: BookingRules | null, at: number, party: number, excludeId: string | null = null): boolean {
  const cap = rules?.coversPerSlot ?? 0;
  if (cap <= 0) return false;
  return seatsAt(reservations, at, excludeId) + party > cap;
}

/** Bookings still to come on a day: the header and the tabs count these alike. */
export const liveOn = (reservations: Reservation[], days: BookingDay[], index: number, timeZone?: string): Reservation[] =>
  reservations.filter((r) => r.status === 'confirmed' && dayIndexOf(r, days, timeZone) === index);

/**
 * The free tables a party fits at, the snuggest first — a party of two is not
 * offered the six-top while a two-top is free, and never a bar stool for six.
 */
export function tablesFor(tables: TableInfo[], party: number): TableInfo[] {
  return tables
    .filter((t) => t.status === 'open' && t.seats >= party)
    .sort((a, b) => a.seats - b.seats || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/**
 * Where "Seat now" puts a party: its assigned table when that is free and big
 * enough, else the snuggest free table that fits, else nothing.
 */
export function seatFor(r: Reservation, tables: TableInfo[]): TableInfo | null {
  const assigned = r.tableId === null ? undefined : tables.find((t) => t.id === r.tableId || t.label === r.tableId);
  if (assigned !== undefined && assigned.status === 'open' && assigned.seats >= r.partySize) return assigned;
  return tablesFor(tables, r.partySize)[0] ?? null;
}
