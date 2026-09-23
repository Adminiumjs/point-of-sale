/**
 * The app's half of the demo protocol (plan §4.4, D58): the website's demo
 * card drives the demo through these messages, and the demo tells the card
 * where it is.
 *
 * Imported ONLY inside `if (DEMO)` in `main.tsx`, so no real bundle contains a
 * line of it (`surfaceBuild.test.ts` checks that no surface build speaks the
 * protocol).
 *
 * Security, as §4.4 has it: a message is taken only from THIS origin, only
 * from the window that framed the demo, and only at this protocol version;
 * everything goes back to `location.origin`, never to `*`.
 */
import { DEMO_APP_KEY, DEMO_SCREENS, type DemoShortcutId } from './demo-card';
import { DEMO_PROTOCOL_VERSION, isDemoMessage, type DemoMessage, type DemoTheme } from './demo-types';
import type { View } from './data/types';
import { venueStamp } from './data/venueTime';
import { addDays, venueDay } from './data/venueTime';
import { seedReservations } from './data/demo';
import { setHostLocale } from './i18n';
import { locale as currentLocale } from './i18n/ambient';
import { usePos } from './state/store';
import { useGuests } from './guests/store';

/** The booking "Manage my booking" finds, and where the demo put it. */
const DEMO_CODE = 'MR-4829';
const DEMO_MOBILE = '(415) 555-0166';

/**
 * Every shortcut the card declares, and what it does. A record over the
 * declared ids: a shortcut added to `demo-card.ts` without an action here is a
 * compile error, never a dead button.
 */
const SHORTCUTS: Record<DemoShortcutId, () => void> = {
  'autofill-pin': () => usePos.getState().autofillPin(),
  'empty-ticket': () => usePos.getState().emptyTicket(),
  'reset-ticket': () => usePos.getState().resetTicket(),
  declined: () => usePos.getState().toggleDeclined(),
  'new-order': () => usePos.getState().newOrder(),
  'new-reservation': () => usePos.setState({ view: 'reservations', resvNewOpen: true }),
  'prefill-guest': () => {
    const g = useGuests.getState();
    g.setField('name', 'Ada Park');
    g.setField('mobile', '+1 415 555 0101');
    g.setField('email', 'ada.park@example.com');
    if (g.bookStep === 'when' && g.time !== '') g.bookNext();
  },
  'restart-booking': () => useGuests.getState().bookReset(),
  // The whole number the booking holds (the comp's prefill disagreed with its own booking — §5.8.8, 8).
  'prefill-code': () => {
    useGuests.getState().openManage(DEMO_CODE);
    useGuests.getState().setField('findMobile', DEMO_MOBILE);
  },
  'timing-real': () => moveDemoBooking('real'),
  'timing-soon': () => moveDemoBooking('soon'),
  'timing-later': () => moveDemoBooking('later'),
  'restart-manage': () => useGuests.getState().openManage(''),
};

/**
 * F16: the timing moves MR-4829 itself — under two hours (an hour from now),
 * plenty of time (tomorrow at seven), or back to where the demo put it —
 * rather than faking a clock the server would not share.
 */
function moveDemoBooking(timing: 'real' | 'soon' | 'later'): void {
  const original = seedReservations().find((r) => r.code === DEMO_CODE);
  if (original === undefined) return;
  const startsAt =
    timing === 'soon'
      ? Math.ceil((Date.now() + 60 * 60_000) / 60_000) * 60_000
      : timing === 'later'
        ? venueStamp(addDays(venueDay(Date.now()), 1), '19:00')
        : original.startsAt;
  usePos.setState((s) => ({ reservations: s.reservations.map((r) => (r.code === DEMO_CODE ? { ...r, startsAt, status: 'confirmed' } : r)) }));
  useGuests.setState((g) => (g.booking?.code === DEMO_CODE ? { booking: { ...g.booking, startsAt, status: 'confirmed' } } : {}));
}

/** The card's screen id for where the demo is now: an open overlay names itself. */
export function currentScreen(): string {
  const s = usePos.getState();
  if (s.moveOpen) return 'move';
  if (s.discountOpen) return 'discount';
  return DEMO_SCREENS.find((x) => x.view === s.view && x.id === s.view)?.id ?? s.view;
}

/** Go where the card asked: a screen, or the overlay the register opens. */
export function goToScreen(id: string): void {
  const screen = DEMO_SCREENS.find((x) => x.id === id);
  if (screen === undefined) return;
  const pos = usePos.getState();
  if (id === 'move' || id === 'discount') {
    if (pos.view !== 'register') usePos.setState({ view: 'register' });
    // One overlay at a time: the card may jump from one straight to the other.
    usePos.setState({ moveOpen: false, discountOpen: false });
    pos.go(id);
    return;
  }
  // Leaving the register closes whatever overlay was open on it.
  usePos.setState({ moveOpen: false, discountOpen: false, sheetOpen: false, heldOpen: false });
  pos.go(screen.view as View);
}

function stateMessage(): DemoMessage {
  const s = usePos.getState();
  return {
    type: 'adminium:demo:state',
    dv: DEMO_PROTOCOL_VERSION,
    screen: currentScreen(),
    persona: null,
    mode: s.mode,
    online: s.online,
    toggles: { declined: s.declined },
    locale: currentLocale(),
    theme: s.theme,
  };
}

/** Apply one message from the card. Exported for the tests. */
export function applyDemoMessage(message: DemoMessage): void {
  const pos = usePos.getState();
  switch (message.type) {
    case 'adminium:demo:init':
      setHostLocale(message.locale);
      pos.setHostTheme(message.theme);
      if (message.mode === 'restaurant' || message.mode === 'retail') pos.setMode(message.mode);
      if (message.screen !== undefined) goToScreen(message.screen);
      return;
    case 'adminium:demo:go':
      goToScreen(message.screen);
      return;
    case 'adminium:demo:do': {
      const run = (SHORTCUTS as Record<string, (() => void) | undefined>)[message.shortcut];
      run?.();
      return;
    }
    case 'adminium:demo:set':
      if (message.theme !== undefined) pos.setHostTheme(message.theme as DemoTheme);
      if (message.locale !== undefined) setHostLocale(message.locale);
      if (message.mode === 'restaurant' || message.mode === 'retail') pos.setMode(message.mode);
      if (message.online !== undefined && message.online !== pos.online) pos.toggleOnline();
      return;
    case 'adminium:demo:reset':
      window.location.reload();
      return;
    default:
      return;
  }
}

/**
 * Start listening, say hello, and report every change. Nothing happens when
 * the demo is not framed (opened on its own, there is no card to talk to).
 */
export function startDemoBridge(): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => {};
  const origin = window.location.origin;
  const parent = window.parent;
  const post = (message: DemoMessage) => parent.postMessage(message, origin);
  let last = '';
  const report = () => {
    const message = stateMessage();
    const text = JSON.stringify(message);
    if (text === last) return;
    last = text;
    post(message);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== parent || !isDemoMessage(event.data)) return;
    applyDemoMessage(event.data);
    report();
    // A new language reaches the app on its next render: report once it has.
    // The first `init` can land before React has mounted at all, so it waits
    // longer for the rendered locale to catch up.
    setTimeout(report, 50);
    if (event.data.type === 'adminium:demo:init') {
      setTimeout(report, 400);
      setTimeout(report, 1500);
    }
  };
  window.addEventListener('message', onMessage);
  const unsubscribe = [usePos.subscribe(report), useGuests.subscribe(report)];
  post({ type: 'adminium:demo:hello', dv: DEMO_PROTOCOL_VERSION, appKey: DEMO_APP_KEY });
  return () => {
    window.removeEventListener('message', onMessage);
    for (const off of unsubscribe) off();
  };
}
