/**
 * BOOKINGS AT THE TILL: the days, the slots, how full a slot is, and where a
 * party can sit — Appendix D's fixes, as rules.
 */
import { describe, expect, it } from 'vitest';

import type { BookingRules, Reservation, TableInfo } from '../data/types';
import { venueStamp } from '../data/venueTime';
import { bookingDays, dayIndexOf, daySlots, liveOn, seatFor, seatsAt, slotFull, tablesFor } from './bookings';

const ZONE = 'Europe/Lisbon';
const RULES: BookingRules = { opens: '18:00', closes: '20:00', slotMinutes: 60, coversPerSlot: 10, daysAhead: 3, maxParty: 8, holdMinutes: 15, cancelHours: 2, occasions: [] };
const at = venueStamp('2026-09-23', '19:00', ZONE);
const r = (id: string, party: number, fields: Partial<Reservation> = {}): Reservation => ({
  id,
  code: null,
  name: id,
  mobile: null,
  email: null,
  partySize: party,
  startsAt: at,
  status: 'confirmed',
  channel: 'online',
  tableId: null,
  occasion: null,
  request: null,
  note: null,
  ...fields,
});
const t = (label: string, seats: number, status: TableInfo['status'] = 'open', id?: string): TableInfo => ({ ...(id ? { id } : {}), zone: 'Main', label, seats, status });

describe('the days and times a booking can take', () => {
  it('runs from the venue’s today for `days_ahead` days', () => {
    // 23:30 in Lisbon on the 23rd is already the 24th in Kolkata; Lisbon's today is what counts.
    const lateEvening = venueStamp('2026-09-23', '23:30', ZONE);
    expect(bookingDays(RULES, lateEvening, ZONE).map((d) => d.day)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(dayIndexOf(r('a', 2), bookingDays(RULES, lateEvening, ZONE), ZONE)).toBe(0);
  });

  it('takes its slots from the rules', () => {
    expect(daySlots(RULES)).toEqual(['18:00', '19:00', '20:00']);
  });
});

describe('how full a slot is', () => {
  it('counts confirmed and seated parties, not the ones that never came or cancelled', () => {
    const list = [r('a', 4), r('b', 3, { status: 'seated' }), r('c', 6, { status: 'no_show' }), r('d', 6, { status: 'cancelled' })];
    expect(seatsAt(list, at)).toBe(7);
    expect(slotFull(list, RULES, at, 3)).toBe(false);
    expect(slotFull(list, RULES, at, 4)).toBe(true);
    // A booking's own party does not count against itself (reinstating, changing).
    expect(slotFull(list, RULES, at, 4, 'a')).toBe(false);
  });

  it('counts the day’s bookings still to come for the header and the tabs alike', () => {
    const days = bookingDays(RULES, at, ZONE);
    expect(liveOn([r('a', 2), r('b', 2, { status: 'seated' })], days, 0, ZONE).map((x) => x.id)).toEqual(['a']);
  });
});

describe('where a party sits', () => {
  const floor = [t('B1', 1), t('T2', 2), t('W2', 2), t('T4', 4), t('T6', 6, 'occupied')];

  it('offers only free tables that fit, the snuggest first — never a bar stool for six', () => {
    expect(tablesFor(floor, 2).map((x) => x.label)).toEqual(['T2', 'W2', 'T4']);
    expect(tablesFor(floor, 6)).toEqual([]);
  });

  it('seats at the assigned table when it is free and fits, else the snuggest that fits', () => {
    expect(seatFor(r('a', 2, { tableId: 'T4' }), floor)?.label).toBe('T4');
    expect(seatFor(r('a', 3, { tableId: 'T2' }), floor)?.label).toBe('T4');
    expect(seatFor(r('a', 6), floor)).toBeNull();
  });
});
