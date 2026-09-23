/**
 * THE GUESTS PAGES, STEP BY STEP — book a table and "Manage my booking",
 * driven over the demo's port, which keeps Adminium's rules: free or full per
 * slot, the whole mobile number, a lockout after five misses, and the
 * cancellation window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BOOKING_RULES } from '../data/demo';
import { venueDay, venueStamp } from '../data/venueTime';
import { usePos } from '../state/store';
import { demoGuestsPort, normaliseCode, samePhone } from './demoPort';
import { useGuests } from './store';

const POS = usePos.getState();
const GUESTS = useGuests.getState();
const g = () => useGuests.getState();

/** Wait for the port's answer (the demo answers after a beat). */
const answered = async () => {
  await vi.advanceTimersByTimeAsync(300);
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  usePos.setState(POS, true);
  useGuests.setState(GUESTS, true);
  await g().start(demoGuestsPort());
});
afterEach(() => {
  vi.useRealTimers();
});

/** Tomorrow's index in the day list, and a stamp on it. */
const TOMORROW = 1;
const tomorrowAt = (time: string) => venueStamp(g().days()[TOMORROW]!.day, time);

describe('book a table', () => {
  it('goes When → Details → Confirmed, and the booking reaches the till', async () => {
    g().setDay(TOMORROW);
    await answered();
    g().setParty(3);
    await answered();
    g().pickTime('19:00', 'full');
    g().bookNext();
    expect(g().bookStep).toBe('details');
    g().setField('name', 'Ada Park');
    g().setField('mobile', '+1 415 555 0101');
    g().setField('email', 'ada@example.com');
    g().setField('occasion', 'birthday');
    const saving = g().submitBooking();
    expect(g().saving).toBe(true);
    await answered();
    await saving;
    expect(g().bookStep).toBe('done');
    expect(g().booked).toMatchObject({ name: 'Ada Park', partySize: 3, email: 'ada@example.com', occasion: 'birthday', startsAt: tomorrowAt('19:00') });
    expect(g().booked!.code).toMatch(/^MR-[0-9A-HJKMNP-TV-Z]{4}$/);
    // The till has it: a guest's table is on Reservations.
    expect(usePos.getState().reservations.find((r) => r.code === g().booked!.code)).toMatchObject({ channel: 'online', name: 'Ada Park' });
  });

  it('cannot continue without a time, and a new party or day clears the time (DP9)', async () => {
    g().bookNext();
    expect(g().bookStep).toBe('when');
    g().setDay(TOMORROW);
    g().pickTime('18:00', 'full');
    g().setParty(4);
    expect(g().time).toBe('');
    g().pickTime('18:00', 'full');
    g().setDay(2);
    expect(g().time).toBe('');
  });

  it('will not take a full time, and says so', async () => {
    g().setDay(TOMORROW);
    await answered();
    // Tomorrow at 19:30 already holds eight (Nora Bennett): a party of five does not fit in twelve.
    g().setParty(5);
    await answered();
    expect(g().slots!.find((x) => x.time === '19:30')!.state).toBe('full');
    g().pickTime('19:30', 'That time is fully booked');
    expect(g().time).toBe('');
    expect(g().toast).toBe('That time is fully booked');
  });

  it('sends the guest back to the times when the slot filled up meanwhile (F12)', async () => {
    g().setDay(TOMORROW);
    await answered();
    g().setParty(4);
    await answered();
    g().pickTime('18:00', 'full');
    g().bookNext();
    g().setField('name', 'Ada');
    g().setField('mobile', '+1 415 555 0101');
    // Another guest takes the slot while this one types.
    usePos.setState((s) => ({ reservations: [...s.reservations, { ...s.reservations[0]!, id: 'x', code: 'MR-XXXX', status: 'confirmed', partySize: 10, startsAt: tomorrowAt('18:00') }] }));
    await g().submitBooking();
    expect(g().bookStep).toBe('when');
    expect(g().bookError).toEqual({ kind: 'full' });
    expect(g().time).toBe('');
  });
});

describe('manage my booking', () => {
  const find = async (code: string, mobile: string) => {
    g().openManage(code);
    g().setField('findMobile', mobile);
    const run = g().find();
    await answered();
    await run;
  };

  it('finds MR-4829 however the guest types it, and never by the last four digits (DP24, F15)', async () => {
    await find('mr 4829', '(415) 555-0166');
    expect(g().manageStep).toBe('booking');
    expect(g().booking).toMatchObject({ code: 'MR-4829', name: 'Mara Rossi' });
    await find('MR-4829', '0166');
    expect(g().findError).toEqual({ kind: 'no-match' });
  });

  it('locks the form after five misses, and says for how long (DP25)', async () => {
    for (let i = 0; i < 4; i += 1) {
      await find('MR-4829', '+1 415 555 9999');
      expect(g().findError?.kind).toBe('no-match');
    }
    await find('MR-4829', '+1 415 555 9999');
    expect(g().findError?.kind).toBe('locked');
    expect(g().findError!.until! - Date.now()).toBeGreaterThan(14 * 60_000);
    // Locked: even the right details wait.
    await find('MR-4829', '+1 415 555 0166');
    expect(g().booking).toBeNull();
  });

  it('changes the time and party, re-checked as the booking is saved', async () => {
    await find('MR-4829', '+1 415 555 0166');
    g().startChange();
    expect(g().party).toBe(2);
    g().setDay(TOMORROW);
    await answered();
    g().pickTime('20:00', 'full');
    const run = g().confirmChange();
    await answered();
    await run;
    expect(g().manageStep).toBe('changed');
    expect(g().booking!.startsAt).toBe(tomorrowAt('20:00'));
    expect(usePos.getState().reservations.find((r) => r.code === 'MR-4829')!.startsAt).toBe(tomorrowAt('20:00'));
  });

  it('cancels outside the window, and refuses inside it (DP26)', async () => {
    // MR-4829 tonight at seven: inside two hours from six o'clock, outside from four.
    const booking = usePos.getState().reservations.find((r) => r.code === 'MR-4829')!;
    vi.setSystemTime(booking.startsAt - 60 * 60_000);
    useGuests.setState(GUESTS, true);
    await g().start(demoGuestsPort());
    await find('MR-4829', '+1 415 555 0166');
    g().setCancelOpen(true);
    const late = g().confirmCancel();
    await answered();
    await late;
    expect(g().manageError).toEqual({ kind: 'too-late' });
    expect(usePos.getState().reservations.find((r) => r.code === 'MR-4829')!.status).toBe('confirmed');

    vi.setSystemTime(booking.startsAt - 5 * 60 * 60_000);
    useGuests.setState(GUESTS, true);
    await g().start(demoGuestsPort());
    await find('MR-4829', '+1 415 555 0166');
    const ok = g().confirmCancel();
    await answered();
    await ok;
    expect(g().manageStep).toBe('cancelled');
    expect(usePos.getState().reservations.find((r) => r.code === 'MR-4829')!.status).toBe('cancelled');
  });

  it('manages a booking just made with the details just typed (F20), and Done starts over', async () => {
    g().setDay(TOMORROW);
    await answered();
    g().pickTime('17:00', 'full');
    g().bookNext();
    g().setField('name', 'Ada');
    g().setField('mobile', '07700 900123');
    const booking = g().submitBooking();
    await answered();
    await booking;
    const run = g().manageThis();
    await answered();
    await run;
    expect(g().view).toBe('manage');
    expect(g().booking?.code).toBe(g().booked?.code);
    g().done();
    expect([g().view, g().bookStep, g().booking, g().code]).toEqual(['book', 'when', null, '']);
  });
});

describe('the demo keeps the server’s matching rules', () => {
  it('matches the whole number, however punctuated, with room for a country code', () => {
    expect(samePhone('+1 415 555 0166', '(415) 555-0166')).toBe(true);
    expect(samePhone('+44 7700 900123', '07700 900123')).toBe(true);
    expect(samePhone('+1 415 555 0166', '0166')).toBe(false);
    expect(samePhone('+1234 415 555 0166', '415 555 0166')).toBe(false);
  });

  it('reads a code as the MR- rule writes it', () => {
    expect(['mr-4829', 'MR 4829', 'mr4829', '4829', 'MR-O1LI'].map(normaliseCode)).toEqual(['MR-4829', 'MR-4829', 'MR-4829', 'MR-4829', 'MR-0111']);
  });

  it('books the day list from the venue’s today, for `days_ahead` days', () => {
    expect(g().days()).toHaveLength(BOOKING_RULES.daysAhead);
    expect(g().days()[0]!.day).toBe(venueDay(Date.now()));
  });
});
