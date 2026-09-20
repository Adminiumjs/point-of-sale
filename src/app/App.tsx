import { useEffect, type ComponentType } from 'react';
import { usePos } from '../state/store';
import { useI18n } from '../i18n';
import { setAmbient } from '../i18n/ambient';
import { DemoDock } from '../components/DemoDock';
import { DEMO } from '../surface';
import type { View } from '../data/types';
import { TopBar } from '../components/TopBar';
import { Toast } from '../components/Toast';
import { ModifierSheet } from '../components/ModifierSheet';
import { HeldTray } from '../components/HeldTray';
import { VoidModal } from '../components/VoidModal';
import { MoveModal } from '../components/MoveModal';
import { DiscountModal } from '../components/DiscountModal';
import { Login } from '../screens/Login';
import { Register } from '../screens/Register';
import { Floor } from '../screens/Floor';
import { Payment } from '../screens/Payment';
import { Complete } from '../screens/Complete';
import { Kitchen } from '../screens/Kitchen';

/*
 * One screen per view, and the record must cover the whole union: a view with
 * no screen is a compile error here, and `surface-nav.ts` fails to compile if
 * that view is neither navigable nor a declared extra.
 *
 * There is no per-side split to make. Every screen is the till's — the staff
 * side — and no customer surface is built from this repo, so a staff build and
 * the demo render the same record; what the build-time flags change is the
 * dock below and where `main.tsx` opens the till.
 */
const SCREENS = {
  login: Login,
  register: Register,
  floor: Floor,
  payment: Payment,
  complete: Complete,
  kitchen: Kitchen,
} satisfies Record<View, ComponentType>;

export function App() {
  const view = usePos((s) => s.view);
  const theme = usePos((s) => s.theme);
  const themeFromHost = usePos((s) => s.themeFromHost);

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
   * chip. This terminal has none of those outside the demo dock, which only the
   * demo build contains. The top bar stays because it is the ticket's working
   * surface (the table, the menu search, the held tray), not navigation.
   */
  return (
    <div className="pos-app">
      {/*
        Build-time, not runtime. `DEMO` folds to a literal, so a hosted or
        standalone build does not CONTAIN the dock — it is not merely hidden.
        It resets tickets and fakes card declines, which against a real shop's
        tickets would either lie or do damage.
      */}
      {DEMO && <DemoDock />}
      <div className="pos-terminal">
        {showTopbar && <TopBar />}
        <Screen />

        {/* Overlays scope to the terminal (below the dock). */}
        <ModifierSheet />
        <HeldTray />
        <VoidModal />
        <MoveModal />
        <DiscountModal />
        <Toast />
      </div>
    </div>
  );
}
