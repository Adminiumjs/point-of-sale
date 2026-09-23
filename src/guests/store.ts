/**
 * The Guests pages' own store: book a table, and "Manage my booking".
 *
 * Separate from the till's (`state/store.ts`) on purpose — that one reads the
 * data source when it loads, and a customer surface has no data source, only
 * the public API. Nothing here imports the till.
 *
 * Every write goes to Adminium through the port and waits for its answer: a
 * booking is "booked" only once it has a code, a change only once the server
 * re-checked the slot, a cancellation only once it was inside the window.
 */
import { create } from 'zustand';

import type { BookingDay } from '../state/bookings';
import { bookingDays } from '../state/bookings';
import { venueDay, venueStamp, venueTime } from '../data/venueTime';
import { GuestError, type GuestBooking, type GuestErrorKind, type GuestRules, type GuestVenue, type GuestsPort, type Slot } from './api';

export type GuestView = 'book' | 'manage';
export type BookStep = 'when' | 'details' | 'done';
export type ManageStep = 'find' | 'booking' | 'when' | 'changed' | 'cancelled';

/** What a guest is shown about a failure: the kind, and when a lockout lifts. */
export interface GuestNotice {
  kind: GuestErrorKind;
  /** A millisecond stamp, for a lockout. */
  until?: number;
}

export interface GuestsState {
  view: GuestView;
  port: GuestsPort | null;
  venue: GuestVenue | null;
  rules: GuestRules | null;
  /** The first read failed: the page says so and offers to try again. */
  loadFailed: boolean;
  toast: string | null;

  // shared by Book and Change: the party, the day, the time, and the day's slots
  party: number;
  day: number;
  time: string;
  slots: Slot[] | null;
  slotsFor: string;

  // book
  bookStep: BookStep;
  name: string;
  mobile: string;
  email: string;
  occasion: string;
  request: string;
  saving: boolean;
  bookError: GuestNotice | null;
  booked: (GuestBooking & { email: string | null; mobile: string }) | null;

  // manage
  manageStep: ManageStep;
  code: string;
  findMobile: string;
  finding: boolean;
  findError: GuestNotice | null;
  booking: GuestBooking | null;
  manageError: GuestNotice | null;
  cancelOpen: boolean;

  start: (port: GuestsPort) => Promise<void>;
  setView: (view: GuestView) => void;
  showToast: (msg: string) => void;
  days: () => BookingDay[];
  /** When the chosen day and time are, on the venue's clock. */
  chosenStamp: () => number | null;

  setParty: (n: number) => void;
  setDay: (i: number) => void;
  /** Pick a time: a full one is refused, with a word to say so. */
  pickTime: (time: string, fullMessage: string) => void;
  loadSlots: () => Promise<void>;
  setField: (field: 'name' | 'mobile' | 'email' | 'occasion' | 'request' | 'code' | 'findMobile', value: string) => void;
  bookNext: () => void;
  bookBack: () => void;
  submitBooking: () => Promise<void>;
  bookReset: () => void;

  openManage: (code?: string) => void;
  manageThis: () => Promise<void>;
  find: () => Promise<void>;
  startChange: () => void;
  keep: () => void;
  confirmChange: () => Promise<void>;
  setCancelOpen: (open: boolean) => void;
  confirmCancel: () => Promise<void>;
  /** Done / Book again: back to a fresh booking page. */
  done: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Where the page's own navigation goes besides this store (the demo's till, the URL). */
let navigated: (view: GuestView) => void = () => {};
export function onGuestsNavigate(listener: (view: GuestView) => void): void {
  navigated = listener;
}

const fresh = {
  party: 2,
  day: 0,
  time: '',
  slots: null,
  slotsFor: '',
  bookStep: 'when' as BookStep,
  name: '',
  mobile: '',
  email: '',
  occasion: '',
  request: '',
  saving: false,
  bookError: null,
  booked: null,
};
const freshManage = {
  manageStep: 'find' as ManageStep,
  findMobile: '',
  finding: false,
  findError: null,
  booking: null,
  manageError: null,
  cancelOpen: false,
};

const noticeOf = (error: unknown): GuestNotice => {
  const kind = error instanceof GuestError ? error.kind : 'network';
  const retry = error instanceof GuestError ? error.retryAfter : null;
  return kind === 'locked' ? { kind, until: Date.now() + (retry ?? 15 * 60) * 1000 } : { kind };
};

export const useGuests = create<GuestsState>()((set, get) => {
  const days = () => bookingDays(get().rules === null ? null : { ...get().rules!, coversPerSlot: 0 }, Date.now(), get().port?.timeZone());
  const dayOf = (at: number): number => Math.max(0, days().findIndex((d) => d.day === venueDay(at, get().port?.timeZone())));
  const timeOf = (at: number): string => venueTime(at, get().port?.timeZone());

  return {
    view: 'book',
    port: null,
    venue: null,
    rules: null,
    loadFailed: false,
    toast: null,
    ...fresh,
    code: '',
    ...freshManage,

    start: async (port) => {
      set({ port, loadFailed: false });
      try {
        const [venue, rules] = await Promise.all([port.venue(), port.rules()]);
        set({ venue, rules, party: Math.min(2, Math.max(1, rules.maxParty)) });
        await get().loadSlots();
      } catch {
        set({ loadFailed: true });
      }
    },
    setView: (view) => {
      if (get().view === view) return;
      set({ view });
      navigated(view);
    },
    showToast: (msg) => {
      clearTimeout(toastTimer);
      set({ toast: msg });
      toastTimer = setTimeout(() => set({ toast: null }), 2600);
    },
    days,
    chosenStamp: () => {
      const s = get();
      const d = days()[s.day];
      return d === undefined || s.time === '' ? null : venueStamp(d.day, s.time, s.port?.timeZone());
    },

    // A new party or a new day can make the chosen time full: it is cleared (DP9).
    setParty: (n) => {
      set({ party: n, time: '', bookError: null, manageError: null });
      void get().loadSlots();
    },
    setDay: (i) => {
      set({ day: i, time: '', bookError: null, manageError: null });
      void get().loadSlots();
    },
    pickTime: (time, fullMessage) => {
      const slot = get().slots?.find((x) => x.time === time);
      if (slot?.state === 'full') {
        get().showToast(fullMessage);
        return;
      }
      set({ time, bookError: null, manageError: null });
    },
    loadSlots: async () => {
      const s = get();
      const d = days()[s.day];
      if (s.port === null || d === undefined) return;
      const key = `${d.day}|${String(s.party)}`;
      set({ slotsFor: key });
      try {
        const slots = await s.port.availability(d.day, s.party);
        if (get().slotsFor === key) set({ slots });
      } catch {
        if (get().slotsFor === key) set({ slots: [] });
      }
    },
    setField: (field, value) => set({ [field]: value } as Partial<GuestsState>),
    bookNext: () => {
      if (get().time === '') return;
      set({ bookStep: 'details', bookError: null });
    },
    bookBack: () => set({ bookStep: 'when', bookError: null }),
    submitBooking: async () => {
      const s = get();
      const at = s.chosenStamp();
      if (s.port === null || at === null || s.saving || s.name.trim() === '' || s.mobile.trim() === '') return;
      set({ saving: true, bookError: null });
      try {
        const email = s.email.trim() === '' ? null : s.email.trim();
        const booking = await s.port.book({
          startsAt: at,
          party: s.party,
          name: s.name.trim(),
          mobile: s.mobile.trim(),
          email,
          occasion: s.occasion === '' ? null : s.occasion,
          request: s.request.trim() === '' ? null : s.request.trim(),
        });
        set({ booked: { ...booking, email, mobile: s.mobile.trim() }, bookStep: 'done', saving: false });
      } catch (error) {
        const notice = noticeOf(error);
        // The time filled up meanwhile (F12): back to the times, fresh.
        set({ saving: false, bookError: notice, ...(notice.kind === 'full' ? { bookStep: 'when' as BookStep, time: '' } : {}) });
        if (notice.kind === 'full') void get().loadSlots();
      }
    },
    bookReset: () => {
      set({ ...fresh, party: Math.min(2, Math.max(1, get().rules?.maxParty ?? 2)) });
      void get().loadSlots();
    },

    openManage: (code) => {
      set({ ...freshManage, code: code ?? get().code });
      get().setView('manage');
    },
    // "Manage this booking" right after booking (F20): claimed with the code and mobile just entered.
    manageThis: async () => {
      const b = get().booked;
      if (b === null) return;
      set({ ...freshManage, code: b.code, findMobile: b.mobile });
      get().setView('manage');
      await get().find();
    },
    find: async () => {
      const s = get();
      if (s.port === null || s.finding || s.code.trim() === '' || s.findMobile.trim() === '') return;
      if (s.findError?.kind === 'locked' && (s.findError.until ?? 0) > Date.now()) return;
      set({ finding: true, findError: null });
      try {
        const booking = await s.port.find(s.code.trim(), s.findMobile.trim());
        set({ booking, finding: false, manageStep: 'booking', manageError: null });
      } catch (error) {
        set({ finding: false, findError: noticeOf(error) });
      }
    },
    startChange: () => {
      const b = get().booking;
      if (b === null) return;
      set({ manageStep: 'when', party: b.partySize, day: dayOf(b.startsAt), time: timeOf(b.startsAt), manageError: null });
      void get().loadSlots();
    },
    keep: () => set({ manageStep: 'booking', manageError: null }),
    confirmChange: async () => {
      const s = get();
      const at = s.chosenStamp();
      if (s.port === null || s.booking === null || at === null || s.saving) return;
      set({ saving: true, manageError: null });
      try {
        const booking = await s.port.change(s.booking.id, { startsAt: at, party: s.party });
        set({ booking, saving: false, manageStep: 'changed' });
      } catch (error) {
        const notice = noticeOf(error);
        set({ saving: false, manageError: notice });
        if (notice.kind === 'full') {
          set({ time: '' });
          void get().loadSlots();
        }
        // The session ran out (F13): back to Find, the code kept.
        if (notice.kind === 'expired') set({ manageStep: 'find', booking: null, findError: notice });
      }
    },
    setCancelOpen: (open) => set({ cancelOpen: open }),
    confirmCancel: async () => {
      const s = get();
      if (s.port === null || s.booking === null || s.saving) return;
      set({ saving: true, manageError: null });
      try {
        const booking = await s.port.cancel(s.booking.id);
        set({ booking, saving: false, cancelOpen: false, manageStep: 'cancelled' });
      } catch (error) {
        const notice = noticeOf(error);
        set({ saving: false, cancelOpen: false, manageError: notice });
        if (notice.kind === 'expired') set({ manageStep: 'find', booking: null, findError: notice });
      }
    },
    done: () => {
      set({ ...freshManage, code: '' });
      get().bookReset();
      get().setView('book');
    },
  };
});
