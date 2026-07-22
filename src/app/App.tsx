import { useEffect } from 'react';
import { usePos } from '../state/store';
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
