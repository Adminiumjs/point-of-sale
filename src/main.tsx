import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/fonts.css';
import './styles/app.css';

import { I18nProvider } from './i18n';
import { setDataSource } from './data/source';
import { clientFromEnv, loadSnapshot, snapshotSource } from './data/adminiumSource';

/*
 * ONE condition decides demo vs connected: whether the API base URL and key are
 * present at build time. `createPublicClient` returns null when either is
 * missing, so the fallback is structural rather than a catch, and there is no
 * second flag to drift. The marketplace demo builds set neither and behave
 * byte-identically to before this file changed.
 *
 * The dynamic `import()` of `App` is load-bearing, not stylistic: `App` pulls
 * `state/calc.ts` — the PRICING ENGINE — which reads the menu, the categories,
 * the milk surcharges and the tax rate at MODULE SCOPE. A static import would
 * evaluate it during this module's own imports, before the fetch below could
 * resolve, and the till would price a real shop's sales with the demo's rates.
 * The seam's `setDataSource` throws if that ordering is ever broken.
 *
 * READ `data/adminiumSource.ts`'s header before pointing a build at a till:
 * there is no staff table and no PIN column, so a connected build cannot be
 * signed into at all — which is the safe half of that problem.
 */
async function boot(): Promise<void> {
  const client = clientFromEnv();
  if (client !== null) {
    const snap = await loadSnapshot(client);
    if (snap !== null) {
      setDataSource(snapshotSource(snap));
      console.info(
        `[adminium] connected: ${String(snap.menu.length)} menu items, ` +
          `${String(snap.tables.length)} tables. No staff table: the till cannot be signed into.`,
      );
    }
  }

  const { App } = await import('./app/App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

void boot();
