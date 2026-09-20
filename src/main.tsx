import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/fonts.css';
import './styles/app.css';

import { I18nProvider, setHostLocale } from './i18n';
import { setDataSource } from './data/source';
import { clientFromEnv, loadSnapshot, snapshotFailure, snapshotSource } from './data/adminiumSource';
import { createSessionTransport } from './data/sessionSource';
import { readSessionOperator } from './data/sessionOperator';
import { TABLE_OF_REF } from './data/tableOfRef';
import { resolveStaffConnectionId } from './staffConnection';
import { setTenantCurrency, setTimezoneClaim } from './i18n/ambient';
import { DEMO, HOSTED, SURFACE_SIDE } from './surface';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root — check index.html');
const mount: HTMLElement = container;

/**
 * This app's name, as the failure screen says it — the PRODUCT's. The café in
 * the demo is seed fiction, and a failure screen on a real shop's till must not
 * introduce itself as somebody else's business.
 */
const PRODUCT = 'Point of Sale';

/**
 * The headline for a startup failure, chosen by CAUSE.
 *
 * The detail under it already says precisely what happened; this only has to
 * name the KIND of problem without contradicting it. "Not connected" over an
 * app that reached Adminium and was refused for a different reason sends an
 * operator looking for a broken connection that is not broken.
 */
function titleFor(code: string | null): string {
  switch (code) {
    case 'AMBIGUOUS_CONNECTION':
      return `${PRODUCT} does not know which database to read`;
    case 'CONNECTION_PAUSED':
      return `${PRODUCT}'s database is paused`;
    case 'NO_CONNECTION':
      return `${PRODUCT} is not connected`;
    case 'NO_BACKEND':
      return `${PRODUCT} has no backend configured`;
    case 'NO_STAFF':
      return `${PRODUCT} has nobody who can open this till`;
    case 'NO_OPERATOR':
      return `${PRODUCT} could not tell who is signed in`;
    default:
      // Reached the server and could not finish: a refused scope, a schema that
      // does not match, an expired session. "Not connected" would be a guess.
      return `${PRODUCT} could not load its data`;
  }
}

/**
 * The smallest honest "this is not configured" surface.
 *
 * Deliberately plain DOM and inline styles, and English: it has to work when
 * the data layer, and possibly the locale bundle, did not. Anything richer
 * would be one more thing that can fail while reporting a failure.
 */
function showStartupFailure(detail: string, code: string | null): void {
  const title = titleFor(code);
  console.error(`[adminium] ${title}: ${detail}`);
  mount.innerHTML = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'max-width:34rem;margin:12vh auto;padding:1.5rem;font:400 15px/1.6 system-ui,sans-serif;' +
    'border:1px solid #d4d4d8;border-radius:12px;color:#18181b;background:#fff';
  const h = document.createElement('h1');
  h.textContent = title;
  h.style.cssText = 'margin:0 0 .5rem;font-size:1.05rem;font-weight:600';
  const p = document.createElement('p');
  p.textContent = detail;
  // `pre-wrap`: the detail can be a LIST — one missing table per line.
  p.style.cssText = 'margin:0;color:#52525b;white-space:pre-wrap';
  box.append(h, p);
  mount.append(box);
}

/**
 * The transport's code for a failure, when it carried one. Duck-typed: the
 * reason travels through `snapshotFailure()` as a plain `Error`.
 */
function codeOf(reason: Error | null): string | null {
  const code = (reason as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/*
 * The dynamic `import()` of `App` is load-bearing, not stylistic: `App` pulls
 * `state/calc.ts` — the PRICING ENGINE — which reads the menu, the categories,
 * the milk surcharges and the tax rate at MODULE SCOPE. A static import would
 * evaluate it during this module's own imports, before the fetch below could
 * resolve, and the till would price a real shop's sales with the demo's rates.
 * The seam's `setDataSource` throws if that ordering is ever broken.
 */
async function boot(): Promise<void> {
  /*
   * A NON-DEMO BUILD NEVER RENDERS DEMO DATA.
   *
   * The transport is chosen at BUILD time and the two are not interchangeable.
   * Hosted staff talks to this same origin with the operator's session — no
   * key, no scope, no CORS. A standalone build goes through the public API with
   * a publishable key. `HOSTED` folds to a literal, so each build contains only
   * the transport it uses, and the demo build contains neither.
   */
  if (!DEMO) {
    const hostedStaff = HOSTED && SURFACE_SIDE === 'staff';

    /*
     * The staff surface asks WHICH DATABASE it belongs to before it reads one
     * (29 D9). Null — unbound, or an Adminium too old to answer — keeps the
     * old inference, so this is additive on every single-connection instance.
     */
    const boundConnection = hostedStaff ? await resolveStaffConnectionId() : null;

    const client = hostedStaff
      ? createSessionTransport({
          tableOfRef: TABLE_OF_REF,
          connectionId: boundConnection ?? undefined,
        }).port
      : clientFromEnv();
    if (client === null) {
      showStartupFailure(
        'This build has no backend configured. Set VITE_ADMINIUM_API_BASE_URL and ' +
          'VITE_ADMINIUM_PUBLISHABLE_KEY at build time.',
        'NO_BACKEND',
      );
      return;
    }

    /*
     * A STANDALONE TILL HAS NOBODY TO SIGN IN, so it says so before it reads.
     *
     * There is no staff table and no PIN column (WS-I G-1, `adminiumSource.ts`),
     * so its roster is empty. It used to boot onto the PIN pad anyway, whose
     * first render read the name of a roster member that does not exist and
     * threw — a blank page, with the reason only in the console. The hosted
     * build is not refused, because it is not signed into from the roster: the
     * operator's Adminium session opens it.
     */
    if (!hostedStaff) {
      showStartupFailure(
        "This database has no staff table and no PIN column, so a till served on its own has " +
          "nobody it can sign in. Serve it from Adminium instead (npm run build:surface), where " +
          "it opens on the operator's own session, or add a staff table with a PIN credential " +
          'first — see src/data/adminiumSource.ts.',
        'NO_STAFF',
      );
      return;
    }

    const [snap, operator] = await Promise.all([loadSnapshot(client), readSessionOperator()]);
    if (snap === null) {
      const reason = snapshotFailure();
      showStartupFailure(
        // The server said WHY. Repeating a generic sentence over a specific one
        // is how an operator ends up checking something that was never wrong.
        reason !== null
          ? reason.message
          : 'Could not load data from Adminium. The server may be unreachable, the session may ' +
              "have expired, or this app's tables may not match what it reads.",
        codeOf(reason),
      );
      return;
    }
    if (operator === null) {
      showStartupFailure(
        'Adminium returned the data but named no signed-in operator, so there is no name to ring ' +
          'a sale up under. Sign in to Adminium again, then reload this page.',
        'NO_OPERATOR',
      );
      return;
    }

    // Before `App` mounts, so the first paint prices in the tenant's currency
    // rather than flashing dollars and correcting itself.
    setTenantCurrency(snap.currency);
    // Same timing, same reason: the zone notice is there on the first paint.
    setTimezoneClaim(snap.timezone, snap.timezoneSource);
    setDataSource(snapshotSource(snap, operator));
    console.info(
      `[adminium] connected: ${String(snap.menu.length)} menu items, ` +
        `${String(snap.tables.length)} tables; the till is open for ${operator.name}.`,
    );
  }

  const { App } = await import('./app/App');

  /*
   * The side → entry line: the ONE app-specific line here, which is why it is
   * not in `surface.ts`.
   *
   * Other apps pin a persona per side. The till has no personas; what differs
   * is where it OPENS. The demo opens on the PIN pad over its seeded roster. A
   * hosted staff build was already signed into — by the session that just read
   * this shop's tickets — so it opens on the register, which is where a shift
   * is worked. The PIN and drawer-count steps are the comp's sign-in for a
   * counter device with a staff roster; this schema has no roster to put there.
   */
  if (HOSTED && SURFACE_SIDE === 'staff') {
    const { usePos } = await import('./state/store');
    usePos.setState({ view: 'register' });
  }

  /*
   * URL ⇄ SCREEN, and the host bridge — both hosted-only, both before the first
   * paint (29-app-surfaces.md D6/D8).
   *
   * Order matters:
   *
   *  1. `attachUrlSync` reads the CURRENT path and applies it, so a reload of
   *     `/apps/pos/staff/kitchen` renders the kitchen display rather than the
   *     register and then correcting itself.
   *  2. `connectToHost` handshakes with the dashboard, if there is one. It is
   *     AWAITED so the theme and locale the dashboard hands over are applied
   *     before anything renders; un-framed it returns immediately.
   *  3. The store subscription reflects later screen changes into the URL and
   *     tells the host, so the dashboard's address bar follows the till.
   *
   * `HOSTED` folds to a literal, so a demo or standalone build contains none of
   * this — not the bridge, not the sync, not the subscription.
   */
  if (HOSTED) {
    const { usePos } = await import('./state/store');
    const { attachUrlSync } = await import('./urlSync');
    const { connectToHost } = await import('./embed');
    const { SURFACE_NAV, APP_KEY } = await import('./surface-nav');

    // Forward reference on purpose: the sync reports paths TO the bridge, and
    // the bridge applies paths THROUGH the sync. Nothing fires before both
    // exist — `attachUrlSync`'s own boot read does not call `onPath`.
    let bridge: { navigated: (path: string) => void } | null = null;

    const sync = attachUrlSync({
      nav: SURFACE_NAV,
      side: SURFACE_SIDE,
      go: (view) => usePos.getState().go(view),
      current: () => usePos.getState().view,
      onPath: (path) => bridge?.navigated(path),
    });

    bridge = await connectToHost(APP_KEY, SURFACE_SIDE as 'staff' | 'customer', sync.path(), {
      onTheme: (theme) => usePos.getState().setHostTheme(theme),
      onLocale: setHostLocale,
      onPath: (path) => sync.applyPath(path),
    });

    usePos.subscribe(sync.reflect);
  }

  createRoot(mount).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

void boot();
