import { useEffect } from 'react';
import { usePos } from '../state/store';
import { useI18n } from '../i18n';
import { setAmbient } from '../i18n/ambient';
import { DemoDock } from '../components/DemoDock';
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

export function App() {
  const view = usePos((s) => s.view);
  const theme = usePos((s) => s.theme);

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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pos-theme', theme);
    } catch {
      /* storage unavailable — theme is still applied for this session */
    }
  }, [theme]);

  // 20s tick refreshes the "open Nm" / age labels, like the comp's interval.
  useEffect(() => {
    const iv = setInterval(() => usePos.getState().doTick(), 20000);
    return () => clearInterval(iv);
  }, []);

  const showTopbar = view === 'register' || view === 'floor';

  return (
    <div className="pos-app">
      <DemoDock />
      <div className="pos-terminal">
        {showTopbar && <TopBar />}
        {view === 'login' && <Login />}
        {view === 'register' && <Register />}
        {view === 'floor' && <Floor />}
        {view === 'payment' && <Payment />}
        {view === 'complete' && <Complete />}
        {view === 'kitchen' && <Kitchen />}

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
