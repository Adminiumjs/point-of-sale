/**
 * This app's screens, as data — the ONE declaration two build outputs and one
 * runtime all read (29-app-surfaces.md D7/D8).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The till routes by state: a `View` union switched in `App.tsx`. A hosted
 * build adds two more readers of "which screens does this app have":
 *
 *   `urlSync.ts`      which path selects which screen,
 *   `surface.json`    which sections Adminium's sidebar offers.
 *
 * Three copies of that list is three chances for a path to exist in one and not
 * another — a sidebar row for a screen the bundle does not have, or a deep link
 * that lands on the wrong one. So there is one copy, here.
 *
 * ── Staff only ───────────────────────────────────────────────────────────────
 *
 * Every screen is the till's. There is no customer side (`surface-build.sh`
 * builds `staff` only): an ordering page for guests is 28 §4.1's separate
 * frontend, gated on a schema this repo does not have yet.
 */

import type { View } from './data/types';
import type { MessageKey } from './i18n/messages';
import type { SurfaceNavEntry } from './surface-types';

export const APP_KEY = 'pos';

/**
 * The sidebar section heading when the till is blended into Adminium.
 *
 * The PRODUCT's name, not the café's: the demo venue is seed fiction
 * (`BRAND` in `data/demo.ts`) and a real shop's name has no column to come from
 * (WS-I G-1), so "Daybreak Coffee" in an operator's own dashboard would be a
 * demo presenting itself as their business.
 */
export const APP_LABEL_KEY: MessageKey = 'nav.app';

type Entry = SurfaceNavEntry<View> & { labelKey: MessageKey };

/**
 * The NAVIGABLE screens — the ones that get a path, a sidebar row and a URL.
 *
 * Order is the sidebar order. Icons are lucide NAMES in kebab-case, never
 * imported components: `vite.config.ts` reads this module to emit
 * `surface.json`, and pulling the icon set into a build script would be slow
 * for nothing. They are the dock's own icons, so a screen looks the same
 * wherever it is offered.
 *
 * The register takes the EMPTY path. It is where a shift is worked, it is what
 * `main.tsx` opens a hosted till on, and a staff domain mapped to this app
 * serves it at `/`; giving it `register` as well would make two URLs for one
 * screen.
 */
export const SURFACE_NAV = [
  { id: 'register', path: '', view: 'register', side: 'staff', icon: 'layout-grid', labelKey: 'nav.register' },
  { id: 'floor', path: 'floor', view: 'floor', side: 'staff', icon: 'grid-3x3', labelKey: 'nav.floor' },
  { id: 'kitchen', path: 'kitchen', view: 'kitchen', side: 'staff', icon: 'cooking-pot', labelKey: 'nav.kitchen' },
] as const satisfies readonly Entry[];

/**
 * Screens the till RENDERS but nobody navigates to directly.
 *
 * They get no path because none of them stands on its own: payment is for the
 * ticket on the register, the receipt is for the sale that just closed, and
 * the PIN pad has no roster behind it in any build but the demo. A URL for any
 * of them would promise a screen the store cannot rebuild from a link.
 */
export const SURFACE_EXTRAS = {
  staff: ['login', 'payment', 'complete'],
  customer: [],
} as const satisfies Record<'staff' | 'customer', readonly View[]>;

/** Every view the staff side renders, as a TYPE — nav entries plus extras. */
export type StaffView =
  | Extract<(typeof SURFACE_NAV)[number], { side: 'staff' }>['view']
  | (typeof SURFACE_EXTRAS)['staff'][number];

/*
 * Every view is placed. A view added to the union with neither a nav entry nor
 * an extra makes this record require a key it cannot have, so it fails to
 * compile here — rather than rendering in the demo and being unreachable, or
 * quietly missing from the sidebar, in every hosted build. `App.tsx` holds the
 * other half: its screen record must cover the whole union.
 */
export const EVERY_VIEW_PLACED: Record<Exclude<View, StaffView>, never> = {};
