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

import {
  BRAND,
  CATS,
  EXTRAS,
  FAVOURITES,
  MENU,
  MILKS,
  SHIFT,
  SHIFT_START,
  SIZES,
  STAFF,
  TABLES,
  TAX,
  TIP_PRESETS,
  ZONE_ORDER,
  seedHeld,
  seedKds,
  seedTicket,
} from './demo';
import type {
  Category,
  Extra,
  HeldTicket,
  KdsOrder,
  MenuItem,
  ShiftTotals,
  Size,
  Staff,
  TableInfo,
  Ticket,
} from './types';

export interface DataSource {
  /** The shop whose till this is. */
  brand(): string;
  /** Sales tax, as a fraction. */
  taxRate(): number;
  /** Tip presets as fractions — the four buttons on the payment screen. */
  tipPresets(): number[];
  /** The modifier catalogue: sizes, milks and extras, with their surcharges. */
  sizes(): { v: Size; label: string }[];
  milks(): { v: string; delta: number }[];
  extras(): Extra[];
  /** Menu item ids pinned to the register's first row. */
  favourites(): string[];
  /** The order the floor plan lays its zones out in. */
  zoneOrder(): string[];
  /** When the current shift began, as a millisecond stamp. */
  shiftStart(): number;
  staff(): Staff[];
  menu(): MenuItem[];
  categories(): Category[];
  tables(): TableInfo[];
  shift(): ShiftTotals;
  openTicket(): Ticket;
  heldTickets(): HeldTicket[];
  kitchenOrders(): KdsOrder[];
}

export const demoSource: DataSource = {
  brand: () => BRAND,
  taxRate: () => TAX,
  tipPresets: () => [...TIP_PRESETS],
  sizes: () => SIZES.map((s) => ({ ...s })),
  milks: () => MILKS.map((m) => ({ ...m })),
  extras: () => EXTRAS.map((e) => ({ ...e })),
  favourites: () => [...FAVOURITES],
  zoneOrder: () => [...ZONE_ORDER],
  shiftStart: () => SHIFT_START,
  staff: () => STAFF,
  menu: () => MENU,
  categories: () => CATS,
  tables: () => TABLES,
  shift: () => SHIFT,
  openTicket: () => seedTicket(),
  heldTickets: () => seedHeld(),
  kitchenOrders: () => seedKds(),
};

let current: DataSource = demoSource;
let read = false;

/**
 * The source the app is currently wired to.
 *
 * An indirection rather than a re-export, because `state/calc.ts` and
 * `state/store.ts` read it at MODULE SCOPE — a re-exported binding would be
 * captured at import time and a later swap would change nothing.
 */
export const source: DataSource = {
  brand: () => ((read = true), current.brand()),
  taxRate: () => ((read = true), current.taxRate()),
  tipPresets: () => ((read = true), current.tipPresets()),
  sizes: () => ((read = true), current.sizes()),
  milks: () => ((read = true), current.milks()),
  extras: () => ((read = true), current.extras()),
  favourites: () => ((read = true), current.favourites()),
  zoneOrder: () => ((read = true), current.zoneOrder()),
  shiftStart: () => ((read = true), current.shiftStart()),
  staff: () => ((read = true), current.staff()),
  menu: () => ((read = true), current.menu()),
  categories: () => ((read = true), current.categories()),
  tables: () => ((read = true), current.tables()),
  shift: () => ((read = true), current.shift()),
  openTicket: () => ((read = true), current.openTicket()),
  heldTickets: () => ((read = true), current.heldTickets()),
  kitchenOrders: () => ((read = true), current.kitchenOrders()),
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
}

/**
 * True once a real backend is behind the seam.
 *
 * Read by the demo dock, which resets the shift and invents sales: against a
 * real till those controls either lie or do damage, so it does not render.
 */
export function isConnected(): boolean {
  return current !== demoSource;
}
