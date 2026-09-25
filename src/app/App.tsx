import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { usePos } from '../state/store';
import { useI18n } from '../i18n';
import { setAmbient } from '../i18n/ambient';
import { DEMO } from '../surface';
import type { View } from '../data/types';
import { TopBar } from '../components/TopBar';
import { Toast } from '../components/Toast';
import { ModifierSheet } from '../components/ModifierSheet';
import { HeldTray } from '../components/HeldTray';
import { VoidModal } from '../components/VoidModal';
import { MoveModal } from '../components/MoveModal';
import { DiscountModal } from '../components/DiscountModal';
import { SignedOut } from '../components/SignedOut';
import { Login } from '../screens/Login';
import { Register } from '../screens/Register';
import { Floor } from '../screens/Floor';
import { Payment } from '../screens/Payment';
import { Complete } from '../screens/Complete';
import { Kitchen } from '../screens/Kitchen';
import { Reservations } from '../screens/Reservations';
import { Refund } from '../screens/Refund';
import { CloseShift } from '../screens/CloseShift';
import { EndOfDay } from '../screens/EndOfDay';
import { StaffClock } from '../screens/StaffClock';
import { Menu86 } from '../screens/Menu86';
import { ShelfLabels } from '../screens/ShelfLabels';
import { Loyalty } from '../screens/Loyalty';
import { GiftCards } from '../screens/GiftCards';
import { Pickup, PickupSheet } from '../screens/Pickup';
import { CustomerDisplay } from '../screens/CustomerDisplay';
import { TipPad } from '../components/TipPad';

/*
 * The Guests pages and the guest's email, as till screens — for the demo only,
 * which shows both sides in one app. `DEMO` folds to a literal, so a staff
 * build drops them and their chunks altogether (the customer surface mounts
 * `GuestsApp` itself, from `main.tsx`, with no till at all).
 */
const Nothing = () => null;
const GuestsScreen = /* @__PURE__ */ lazy(() => import('../guests/GuestsApp').then((m) => ({ default: m.GuestsScreen })));
const Book = () => (
  <Suspense fallback={null}>
    <GuestsScreen view="book" />
  </Suspense>
);
const Manage = () => (
  <Suspense fallback={null}>
    <GuestsScreen view="manage" />
  </Suspense>
);
const GuestEmailScreen = /* @__PURE__ */ lazy(() => import('../guests/GuestEmail').then((m) => ({ default: m.GuestEmail })));
const Email = () => (
  <Suspense fallback={null}>
    <GuestEmailScreen />
  </Suspense>
);

/*
 * One screen per view, and the record must cover the whole union: a view with
 * no screen is a compile error here, and `surface-nav.ts` fails to compile if
 * that view is neither navigable nor a declared extra.
 *
 * The till's own record: the customer surface mounts `GuestsApp` instead
 * (`main.tsx`), and the demo shows the Guests pages here as two lazy screens.
 * The demo's controls are the website's card, not a dock in the app
 * (`demoBridge.ts`).
 */
const SCREENS = {
  login: Login,
  register: Register,
  floor: Floor,
  payment: Payment,
  complete: Complete,
  kitchen: Kitchen,
  reservations: Reservations,
  refund: Refund,
  shiftclose: CloseShift,
  eod: EndOfDay,
  staff: StaffClock,
  menu86: Menu86,
  labels: ShelfLabels,
  loyalty: Loyalty,
  giftcards: GiftCards,
  pickup: Pickup,
  display: CustomerDisplay,
  book: DEMO ? Book : Nothing,
  manage: DEMO ? Manage : Nothing,
  email: DEMO ? Email : Nothing,
} satisfies Record<View, ComponentType>;

export function App() {
  const view = usePos((s) => s.view);
  const theme = usePos((s) => s.theme);
  const themeFromHost = usePos((s) => s.themeFromHost);
  const pickupSheet = usePos((s) => s.pickupSheetOpen);

  /*
   * Publish the live locale to the module-level bridge before anything below
   * renders. The store's toasts and calc.ts's money/table/modifier labels run
   * outside React and cannot hold a hook; this is the one place that knows both
   * sides. Assigning during render (rather than in an effect) matters: children
   * render after this line, so the first paint after a locale switch is already
   * in the new locale instead of one frame behind.
   */
  const { locale, t, money, number } = useI18n();
  setAmbient(locale, t, money, number);

  // Dark mode = data-theme on <html> + localStorage (per the token contract).
  // A theme the dashboard pushed is applied and NOT remembered: it is the
  // host's setting, and the till opened on its own keeps its own.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeFromHost) return;
    try {
      localStorage.setItem('pos-theme', theme);
    } catch {
      /* storage unavailable — theme is still applied for this session */
    }
  }, [theme, themeFromHost]);

  // 20s tick refreshes the "open Nm" / age labels, like the comp's interval.
  useEffect(() => {
    const iv = setInterval(() => usePos.getState().doTick(), 20000);
    return () => clearInterval(iv);
  }, []);

  const showTopbar = view === 'register' || view === 'floor';
  const Screen = SCREENS[view];

  /*
   * No embedded variant of the chrome, deliberately. Blended into the Adminium
   * dashboard (29-app-surfaces.md D6) an app drops the chrome the dashboard
   * already draws — its sidebar, its theme and language controls, its account
   * chip. This terminal has none of those (the demo's controls are the
   * website's card, outside the app). The top bar stays because it is the ticket's working
   * surface (the table, the menu search, the held tray), and the till's own navigation.
   */
  return (
    <div className="pos-app">
      <div className="pos-terminal">
        {showTopbar && <TopBar />}
        <Screen />

        {/* Overlays scope to the terminal. */}
        <ModifierSheet />
        <HeldTray />
        <VoidModal />
        <MoveModal />
        <DiscountModal />
        {pickupSheet && <PickupSheet />}
        <TipPad />
        <Toast />
        <SignedOut />
      </div>
    </div>
  );
}
