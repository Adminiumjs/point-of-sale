/**
 * What the website's demo card offers for Point of Sale — the app's own
 * declaration (plan §3.8), read by `vite.config.ts` to write `demo.json` and
 * by `demoBridge.ts` to answer the card.
 *
 * Screens are the comp's grid (COMP 1662-1669) as far as the app has built
 * them: wave 1's till, its tools and the Guests pages, and wave 2's screens in
 * the comp's places as they are built (Loyalty first).
 * Every label is a message key, so the card speaks the app's own words in all
 * eight languages; `demo.json` refuses a key a bundle lacks.
 *
 * DOM-free and store-free on purpose: `vite.config.ts` imports it.
 */
import type { DemoFrame } from './demo-types.ts';

export const DEMO_APP_KEY = 'pos';
export const DEMO_DIR = 'point-of-sale';

export interface DemoCardShortcut {
  id: string;
  icon: string;
  labelKey: string;
}

export interface DemoCardScreen {
  /** The card's id — the app's view, or an overlay the register opens. */
  id: string;
  view: string;
  icon: string;
  labelKey: string;
  side?: 'staff' | 'customer';
  shortcuts?: DemoCardShortcut[];
}

export const DEMO_FRAMES: DemoFrame[] = ['tablet', 'phone'];

export const DEMO_SCREENS: DemoCardScreen[] = [
  { id: 'login', view: 'login', icon: 'lock', labelKey: 'dock.screen.login', shortcuts: [{ id: 'autofill-pin', icon: 'wand-2', labelKey: 'dock.autofillPin' }] },
  {
    id: 'register',
    view: 'register',
    icon: 'layout-grid',
    labelKey: 'dock.screen.register',
    shortcuts: [
      { id: 'empty-ticket', icon: 'eraser', labelKey: 'dock.emptyTicket' },
      { id: 'reset-ticket', icon: 'rotate-ccw', labelKey: 'dock.resetTicket' },
    ],
  },
  { id: 'floor', view: 'floor', icon: 'grid-3x3', labelKey: 'dock.screen.floor' },
  // A switch on the card: `state.toggles.declined` says which way it is.
  { id: 'payment', view: 'payment', icon: 'credit-card', labelKey: 'dock.screen.payment', shortcuts: [{ id: 'declined', icon: 'x-circle', labelKey: 'dock.cardWillDecline' }] },
  { id: 'complete', view: 'complete', icon: 'receipt', labelKey: 'dock.screen.complete', shortcuts: [{ id: 'new-order', icon: 'plus', labelKey: 'dock.newOrder' }] },
  { id: 'kitchen', view: 'kitchen', icon: 'cooking-pot', labelKey: 'dock.screen.kitchen' },
  { id: 'refund', view: 'refund', icon: 'undo-2', labelKey: 'dock.screen.refund' },
  { id: 'shiftclose', view: 'shiftclose', icon: 'lock-keyhole', labelKey: 'dock.screen.closeShift' },
  { id: 'move', view: 'register', icon: 'arrow-left-right', labelKey: 'dock.screen.move' },
  { id: 'discount', view: 'register', icon: 'percent', labelKey: 'dock.screen.discount' },
  { id: 'display', view: 'display', icon: 'monitor', labelKey: 'nav.display' },
  { id: 'loyalty', view: 'loyalty', icon: 'award', labelKey: 'dock.screen.loyalty' },
  { id: 'giftcards', view: 'giftcards', icon: 'gift', labelKey: 'dock.screen.giftCards' },
  { id: 'pickup', view: 'pickup', icon: 'bell-ring', labelKey: 'nav.pickup' },
  { id: 'eod', view: 'eod', icon: 'chart-column', labelKey: 'dock.screen.eod' },
  { id: 'staff', view: 'staff', icon: 'users', labelKey: 'dock.screen.staff' },
  { id: 'menu86', view: 'menu86', icon: 'ban', labelKey: 'dock.screen.menu86' },
  { id: 'reservations', view: 'reservations', icon: 'calendar-days', labelKey: 'nav.reservations', shortcuts: [{ id: 'new-reservation', icon: 'plus', labelKey: 'dock.newReservation' }] },
  {
    id: 'book',
    view: 'book',
    icon: 'calendar-plus',
    labelKey: 'nav.book',
    side: 'customer',
    shortcuts: [
      { id: 'prefill-guest', icon: 'wand-2', labelKey: 'dock.prefillGuest' },
      { id: 'restart-booking', icon: 'rotate-ccw', labelKey: 'dock.restart' },
    ],
  },
  {
    id: 'manage',
    view: 'manage',
    icon: 'calendar-clock',
    labelKey: 'nav.manage',
    side: 'customer',
    shortcuts: [
      { id: 'prefill-code', icon: 'wand-2', labelKey: 'dock.prefillCode' },
      // F16: the timing moves MR-4829 itself, rather than faking a clock.
      { id: 'timing-real', icon: 'clock', labelKey: 'dock.timingReal' },
      { id: 'timing-soon', icon: 'clock', labelKey: 'dock.timingSoon' },
      { id: 'timing-later', icon: 'clock', labelKey: 'dock.timingLater' },
      { id: 'restart-manage', icon: 'rotate-ccw', labelKey: 'dock.restart' },
    ],
  },
  // DP27: the email Adminium sends, previewed — a demo-only view.
  { id: 'email', view: 'email', icon: 'mail', labelKey: 'dock.screen.email', side: 'customer' },
];

export const DEMO_MODES = [
  {
    id: 'service',
    options: [
      { id: 'restaurant', labelKey: 'dock.restaurant' },
      { id: 'retail', labelKey: 'dock.retail' },
    ],
  },
];

export const DEMO_TOGGLES: 'online'[] = ['online'];

/** Every shortcut id, as a type: the bridge's table of actions must cover each one. */
export type DemoShortcutId =
  | 'autofill-pin'
  | 'empty-ticket'
  | 'reset-ticket'
  | 'declined'
  | 'new-order'
  | 'new-reservation'
  | 'prefill-guest'
  | 'restart-booking'
  | 'prefill-code'
  | 'timing-real'
  | 'timing-soon'
  | 'timing-later'
  | 'restart-manage';
