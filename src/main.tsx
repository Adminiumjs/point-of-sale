import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/fonts.css';
import './styles/app.css';

import { I18nProvider, setHostLocale } from './i18n';
import { setDataSource } from './data/source';
import { clientFromEnv, loadSnapshot, readReservation, snapshotFailure, snapshotSource } from './data/adminiumSource';
import { createSessionTransport } from './data/sessionSource';
import { sessionSink } from './data/sink';
import { setSink, WRITE_TABLES } from './state/writes';
import { initialsOf, readSessionOperator, SESSION_STAFF_ID } from './data/sessionOperator';
import { realTables } from './data/tableOfRef';
import { setServerZone } from './data/venueTime';
import { loadStaffConfig } from './staffConnection';
import { appName, setTenantCurrency, setTimezoneClaim } from './i18n/ambient';
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
/**
 * THE GUESTS SIDE — a customer surface: book a table, and "Manage my booking".
 *
 * It has no till, no staff and no session: only the public API, through the
 * browser key Adminium made at install and serves beside the bundle
 * (`surface-config.json`). So it is decided before any of the till's checks,
 * the "nobody can open this till" refusal among them, and nothing of the
 * till's is imported. `SURFACE_SIDE` folds to a literal, so the till's half of
 * this file is gone from the customer bundle, and this half from every other.
 */
async function bootGuests(): Promise<void> {
  const { resolveSurfaceConfig } = await import('./publicConfig');
  const config = await resolveSurfaceConfig();
  const client =
    config === null ? null : (await import('@adminiumjs/public-client')).createPublicClient({ baseUrl: config.baseUrl, publishableKey: config.publishableKey });
  if (config === null || client === null) {
    showStartupFailure(
      'Adminium served no booking key for this page. Allow the public access when installing the app, ' +
        'or check that its browser key is still live on the API keys page.',
      'NO_BACKEND',
    );
    return;
  }
  const { publicGuestsPort } = await import('./guests/api');
  let port: Awaited<ReturnType<typeof publicGuestsPort>>;
  try {
    port = await publicGuestsPort(client, config.tables ?? {});
  } catch (error) {
    showStartupFailure(error instanceof Error ? error.message : String(error), codeOf(error instanceof Error ? error : null));
    return;
  }
  // Every day and time the pages show is the venue's.
  setTimezoneClaim(port.timeZone() ?? 'UTC', 'operator');

  const [{ useGuests }, { attachUrlSync }, { connectToHost }, { SURFACE_NAV, APP_KEY }, { GuestsApp }] = await Promise.all([
    import('./guests/store'),
    import('./urlSync'),
    import('./embed'),
    import('./surface-nav'),
    import('./guests/GuestsApp'),
  ]);
  // The confirmation email's link: `…/customer/manage?code=MR-4829` opens Find with the code in.
  const code = new URLSearchParams(window.location.search).get('code');
  if (code !== null) useGuests.setState({ code });
  let bridge: { navigated: (path: string) => void } | null = null;
  const sync = attachUrlSync({
    nav: SURFACE_NAV,
    side: 'customer',
    go: (view) => useGuests.setState({ view: view === 'manage' ? 'manage' : 'book' }),
    current: () => useGuests.getState().view,
    onPath: (path) => bridge?.navigated(path),
  });
  bridge = await connectToHost(APP_KEY, 'customer', sync.path(), {
    onLocale: setHostLocale,
    onPath: (path) => sync.applyPath(path),
  });
  useGuests.subscribe(sync.reflect);
  void useGuests.getState().start(port);

  const named = appName();
  if (named !== null) document.title = named;
  createRoot(mount).render(
    <StrictMode>
      <I18nProvider>
        <GuestsApp />
      </I18nProvider>
    </StrictMode>,
  );
}

async function boot(): Promise<void> {
  if (SURFACE_SIDE === 'customer') {
    await bootGuests();
    return;
  }
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
    /*
     * THE STAFF CONFIG is everything the till boots from: the database, the
     * tables' real names, who is signed in, their token, and the venue's zone
     * and money. With it the till reads neither the dashboard's bootstrap nor
     * its connections list, which a screens-only cashier may not read.
     */
    const staffConfig = hostedStaff ? await loadStaffConfig() : null;
    // A bare wall time from the server is its clock, not this device's.
    if (staffConfig?.serverTimezone) setServerZone(staffConfig.serverTimezone);
    const boundConnection = staffConfig?.connectionId ?? null;

    // The whole transport, not just its reading half: the till also saves through it.
    const transport = hostedStaff
      ? createSessionTransport({
          tableOfRef: realTables(staffConfig?.tables ?? {}),
          connectionId: boundConnection ?? undefined,
          ...(staffConfig?.csrfToken
            ? {
                staff: {
                  csrfToken: staffConfig.csrfToken,
                  timezone: staffConfig.timezone,
                  timezoneSource: staffConfig.timezoneSource,
                  serverTimezone: staffConfig.serverTimezone,
                  currency: staffConfig.currency,
                },
                // A rotated token comes from the staff config again.
                refreshToken: async () => (await loadStaffConfig())?.csrfToken ?? null,
              }
            : {}),
        })
      : null;
    const client = transport !== null ? transport.port : clientFromEnv();
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

    const signedIn = staffConfig?.user ?? null;
    const [snap, operator] = await Promise.all([
      loadSnapshot(client),
      // The staff config names who is signed in; an older Adminium only answers `me`.
      signedIn !== null
        ? Promise.resolve({ id: SESSION_STAFF_ID, name: signedIn.name, initials: initialsOf(signedIn.name), role: '', pin: '' })
        : readSessionOperator(),
    ]);
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
    setDataSource(snapshotSource(snap, operator, signedIn?.email ?? null));
    // Refund reads closed sales on demand, through the same transport.
    const { setHistory, portHistory } = await import('./data/history');
    const optionNames = new Map(snap.groups.flatMap((g) => g.options.map((o) => [o.id, o.name] as const)));
    setHistory(
      portHistory(client, {
        timeZone: snap.timezone,
        optionName: (id) => optionNames.get(id) ?? null,
        tableLabel: (id) => snap.tables.find((x) => x.id === id)?.label ?? null,
      }),
    );
    // Loyalty's members and history are read on demand too; the rewards now, since a ticket may already hold one.
    const { setLoyalty, portLoyalty } = await import('./data/loyalty');
    const book = portLoyalty(client);
    setLoyalty(book);
    const [rewards, member] = await Promise.all([
      book.rewards().catch(() => []),
      snap.openTicket.customerId === undefined ? Promise.resolve(null) : book.member(snap.openTicket.customerId).catch(() => null),
    ]);
    // Gift cards are looked up by their code, on demand.
    const { setGiftCards, portGiftCards } = await import('./data/giftCards');
    setGiftCards(portGiftCards(client));
    const [{ usePos }, { openInBusinessType }, { featuresOf }] = await Promise.all([
      import('./state/store'),
      import('./state/businessType'),
      import('./features'),
    ]);
    usePos.setState((st) => ({ rewards, members: member === null ? st.members : { ...st.members, [member.id]: member } }));
    // A shop set up as retail opens in retail: the store's default is restaurant.
    openInBusinessType(staffConfig?.settings, usePos.getState());
    // What the add-ons attached to this app switch on: an emailed receipt, shelf labels.
    usePos.setState({ features: featuresOf(staffConfig?.addOns) });
    // Every action at the till is saved as the signed-in staff member, from here on.
    if (transport !== null) {
      const tables = { ...WRITE_TABLES, ...(staffConfig?.tables ?? {}) };
      setSink(sessionSink(transport, tables));
      // Label sheets are drawn by Adminium, asked for through the same session.
      const { setDocuments, portDocuments } = await import('./data/documents');
      setDocuments(portDocuments(transport));
      /*
       * LIVE UPDATES: other tills, the kitchen screen and guests' bookings. The
       * store reads the source at module scope, so it (and what writes into it)
       * is imported only now, after `setDataSource`.
       */
      const [{ applyFrame, resync }, { startLive }] = await Promise.all([import('./state/live'), import('./data/live')]);
      void startLive({
        transport,
        tables,
        onFrame: (frame) => applyFrame(frame, { fetchReservation: (id) => readReservation(client, id) }),
        // Whatever was announced while the connection was down is gone: read again.
        onReconnect: () => {
          void loadSnapshot(client).then((fresh) => {
            if (fresh !== null) resync(fresh);
          });
        },
      }).catch((error: unknown) => console.warn('[adminium] live updates are off:', error));
    }
    console.info(
      `[adminium] connected: ${String(snap.menu.length)} menu items, ` +
        `${String(snap.tables.length)} tables; the till is open for ${operator.name}.`,
    );
  }

  const { App } = await import('./app/App');

  /*
   * The demo shows the Guests pages too, as two of the till's screens, over the
   * till's own bookings: a table booked there is on Reservations a tap later.
   */
  if (DEMO) {
    const [{ useGuests, onGuestsNavigate }, { demoGuestsPort }, { usePos }] = await Promise.all([
      import('./guests/store'),
      import('./guests/demoPort'),
      import('./state/store'),
    ]);
    onGuestsNavigate((view) => usePos.getState().go(view));
    void useGuests.getState().start(demoGuestsPort());
    // The website's demo card drives the demo through its protocol (D58).
    const { startDemoBridge } = await import('./demoBridge');
    startDemoBridge();
  }

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

  /*
   * THE BROWSER TAB carries the operator's name too.
   *
   * Everything on screen resolves through `useBrand()`, but the tab is not on
   * screen — it is the static `<title>` in index.html, which is the name this
   * app was BUILT with. Rename the app in Adminium and every heading changes
   * while the tab still says "Client Portal", which is the same half-applied
   * rename this whole change exists to remove.
   *
   * Only when an override is set: with none, index.html's own title is already
   * the right answer and rewriting it with the same string is noise.
   */
  const named = appName();
  if (named !== null) document.title = named;

  createRoot(mount).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

void boot();
