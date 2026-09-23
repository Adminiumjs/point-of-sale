// The DataSource seam.
//
// `demoSource` returns the built-in catalogue from demo.ts. The second
// implementation now exists: `adminiumSource.ts` reads a real Adminium instance
// through `@adminiumjs/public-client` and is swapped in by `main.tsx` before
// React mounts. `demoSource` remains the fallback whenever either build-time
// env var is absent — which is the case for every marketplace demo, and is why
// that fallback is structural rather than a catch.
//
// TEN READS MOVED HERE WHEN CONNECTED MODE LANDED, and they were not tidying.
// `state/calc.ts` — the pricing engine — imported the menu, the categories, the
// milk surcharges, the TAX RATE and the tip presets straight from the seed, at
// module scope. That is §5.1's caveat (a) in the flesh: rows behind the seam do
// nothing for code that reaches around it, and a connected till would have
// charged Daybreak Coffee's 8.25% on another shop's sales.

import { DEMO } from '../surface';
import type {
  BookingRules,
  Category,
  ClockEntry,
  HeldTicket,
  KdsOrder,
  MenuItem,
  ModifierGroup,
  PickupOrder,
  Reservation,
  ShiftTotals,
  Split,
  Staff,
  TableInfo,
  Ticket,
  VenueDetails,
} from './types';

export interface DataSource {
  /** The shop whose till this is. */
  brand(): string;
  /** Its name, address, phone and receipt footer. */
  venue(): VenueDetails;
  /** Sales tax, as a fraction. */
  taxRate(): number;
  /** Tip presets as fractions — the four buttons on the payment screen. */
  tipPresets(): number[];
  /** Menu item ids pinned to the register's first row. */
  favourites(): string[];
  /** The order the floor plan lays its zones out in. */
  zoneOrder(): string[];
  /** When the current shift began, as a millisecond stamp. */
  shiftStart(): number;
  /** The open shift's row, when the till found one open. */
  openShiftId(): string | null;
  /** The float counted into the drawer when the open shift began. */
  openingFloat(): number;
  /** The venue's booking rules, or null when it has none. */
  bookingRules(): BookingRules | null;
  /** Every item's groups of options (menu v1). */
  modifierGroups(): ModifierGroup[];
  /** Who can sign in to this till (the demo's PIN roster; the session's person when hosted). */
  staff(): Staff[];
  /** Every active staff member — Staff & time clock lists them. */
  roster(): Staff[];
  /** Who is clocked in now. */
  timeClock(): ClockEntry[];
  menu(): MenuItem[];
  categories(): Category[];
  tables(): TableInfo[];
  shift(): ShiftTotals;
  openTicket(): Ticket;
  /** What has already been paid on the open ticket. */
  openSplits(): Split[];
  heldTickets(): HeldTicket[];
  kitchenOrders(): KdsOrder[];
  /** Bookings from today on; the store keeps them from here. */
  reservations(): Reservation[];
  /** Orders waiting to be collected (wave 2). */
  pickups(): PickupOrder[];
}

/*
 * The demo's catalogue lives in its own module (`demoSource.ts`) and is reached
 * ONLY behind the build-time `DEMO` flag, so a hosted or connected bundle does
 * not carry the demo café — its roster, their PINs, its menu (§0.6). Every
 * other build is handed its source by `main.tsx` before anything reads.
 */
import { demoSource } from './demoSource';
export { demoSource };

/** Read before a source was set — a build that is not the demo, reading too early. */
const unset = new Proxy({} as DataSource, {
  get: (_target, name) => () => {
    throw new Error(`the till read ${String(name)}() before it had a data source — set one in main.tsx first`);
  },
});

let current: DataSource = DEMO ? demoSourceFor() : unset;
let read = false;
let connected = false;

/** The demo's source — a function, so the flag above folds and takes the module with it. */
function demoSourceFor(): DataSource {
  return demoSource;
}

/**
 * The source the app is currently wired to.
 *
 * An indirection rather than a re-export, because `state/calc.ts` and
 * `state/store.ts` read it at MODULE SCOPE — a re-exported binding would be
 * captured at import time and a later swap would change nothing.
 */
export const source: DataSource = {
  brand: () => ((read = true), current.brand()),
  venue: () => ((read = true), current.venue()),
  taxRate: () => ((read = true), current.taxRate()),
  tipPresets: () => ((read = true), current.tipPresets()),
  favourites: () => ((read = true), current.favourites()),
  zoneOrder: () => ((read = true), current.zoneOrder()),
  shiftStart: () => ((read = true), current.shiftStart()),
  openShiftId: () => ((read = true), current.openShiftId()),
  openingFloat: () => ((read = true), current.openingFloat()),
  bookingRules: () => ((read = true), current.bookingRules()),
  modifierGroups: () => ((read = true), current.modifierGroups()),
  staff: () => ((read = true), current.staff()),
  roster: () => ((read = true), current.roster()),
  timeClock: () => ((read = true), current.timeClock()),
  menu: () => ((read = true), current.menu()),
  categories: () => ((read = true), current.categories()),
  tables: () => ((read = true), current.tables()),
  shift: () => ((read = true), current.shift()),
  openTicket: () => ((read = true), current.openTicket()),
  openSplits: () => ((read = true), current.openSplits()),
  reservations: () => ((read = true), current.reservations()),
  heldTickets: () => ((read = true), current.heldTickets()),
  kitchenOrders: () => ((read = true), current.kitchenOrders()),
  pickups: () => ((read = true), current.pickups()),
};

/**
 * Swap the backing source. Must happen before any module-scope read.
 *
 * The tripwire is the whole reason this is a function and not an assignment:
 * the ordering it depends on is invisible, and getting it wrong fails SILENTLY
 * — the till renders demo data against a configured backend and looks fine. A
 * thrown error at boot is the only way that mistake announces itself.
 */
export function setDataSource(next: DataSource): void {
  if (read) {
    throw new Error(
      'setDataSource() called after the till already read \u2014 import App dynamically, after the snapshot resolves.',
    );
  }
  current = next;
  connected = true;
}

/**
 * True once a real backend is behind the seam.
 *
 * NOT what gates the demo dock any more. That was a runtime comparison no
 * bundler can fold, so the dock shipped in every build and was merely hidden;
 * `App.tsx` now gates it on the build-time `DEMO` constant (`surface.ts`), which
 * removes it from every non-demo bundle. Kept as the seam's own answer.
 */
export function isConnected(): boolean {
  return connected;
}
