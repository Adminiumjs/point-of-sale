/**
 * Every screen of the demo under axe — light and dark, English and Arabic
 * (right to left), each in the frame the demo card shows it in.
 *
 * DRIVEN THE WAY THE CARD DRIVES IT. The website frames the app and talks to it
 * in `adminium:demo:*` messages (demo-types.ts). So does this: a page on the
 * app's own origin frames it, waits for its `hello`, sends `init`, then `go`
 * for each screen the card declares (`DEMO_SCREENS`), and waits for the app's
 * `state` reply naming that screen before measuring. A screen the card can open
 * and this cannot reach is a failure, not a skip.
 *
 * THE SWEEP ASSERTS IT ANALYSED SOMETHING: axe runs into the frame, and each
 * screen must pass a floor of rules; the count of screens is asserted at the end.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type FrameLocator, type Page, type TestInfo } from '@playwright/test';

import { DEMO_SCREENS } from '../src/demo-card.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['critical', 'serious']);
const FRAME_PAGE = '/__a11y-frame.html';

/** The card's two frames. */
const FRAMES = { tablet: { width: 1180, height: 820 }, phone: { width: 390, height: 844 } } as const;

const COMBOS = [
  { theme: 'light', locale: 'en-US', dir: 'ltr' },
  { theme: 'dark', locale: 'en-US', dir: 'ltr' },
  { theme: 'light', locale: 'ar-EG', dir: 'rtl' },
  { theme: 'dark', locale: 'ar-EG', dir: 'rtl' },
] as const;

/**
 * What is measured: every declared screen in the frame it belongs to (the
 * guests' pages on a phone), the till's register on a phone too, retail mode,
 * and three states a shortcut opens.
 */
interface Stop {
  label: string;
  frame: keyof typeof FRAMES;
  screen: string;
  mode?: 'restaurant' | 'retail';
  shortcut?: string;
  /** A state no card control opens: reached by acting in the frame, by structure, not words (the locales change the words). */
  act?: (frame: FrameLocator) => Promise<void>;
}
const STOPS: Stop[] = [
  ...DEMO_SCREENS.map((screen): Stop => ({
    label: screen.id,
    frame: screen.side === 'customer' ? 'phone' : 'tablet',
    screen: screen.id,
  })),
  { label: 'register on a phone', frame: 'phone', screen: 'register' },
  { label: 'floor on a phone', frame: 'phone', screen: 'floor' },
  { label: 'register, retail', frame: 'tablet', screen: 'register', mode: 'retail' },
  { label: 'payment, card declined', frame: 'tablet', screen: 'payment', shortcut: 'declined' },
  { label: 'reservations, new booking', frame: 'tablet', screen: 'reservations', shortcut: 'new-reservation' },
  { label: 'manage, booking found', frame: 'phone', screen: 'manage', shortcut: 'prefill-code' },
  // The customer display's pad (its tip group's last choice, Custom) and its sign-and-receipt step.
  {
    label: 'display, custom tip pad',
    frame: 'tablet',
    screen: 'display',
    act: async (frame) => {
      await frame.getByRole('radiogroup').getByRole('radio').last().click();
      await expect(frame.getByRole('dialog')).toBeVisible();
    },
  },
  {
    label: 'display, signed, receipt by email',
    frame: 'tablet',
    screen: 'display',
    act: async (frame) => {
      await frame.locator('.display-root button').last().click();
      await frame.locator('button[aria-pressed]').click();
      await frame.getByRole('radio').first().click();
      await expect(frame.locator('input[type="email"]')).toBeVisible();
    },
  },
];

interface Sweep {
  states: number;
  minor: number;
  failures: string[];
}

async function sweep(page: Page, label: string, tally: Sweep, testInfo: TestInfo): Promise<void> {
  const frame = page.frameLocator('#app');
  await frame.locator('body').evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.passes.length, `${label}: axe analysed nothing`).toBeGreaterThan(10);
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ''));
  const lesser = results.violations.filter((violation) => !BLOCKING.has(violation.impact ?? ''));
  tally.states += 1;
  tally.minor += lesser.length;
  if (lesser.length > 0) {
    testInfo.annotations.push({
      type: 'axe-lesser',
      description: `${label}: ${lesser.map((v) => `${String(v.impact)}:${v.id}`).join(', ')}`,
    });
  }
  const report = blocking
    .map(
      (v) =>
        `${String(v.impact)}: ${v.id} — ${v.help}\n` +
        v.nodes
          .slice(0, 4)
          .map((n) => `    ${n.target.join(' ')}\n      ${n.html.slice(0, 200)}`)
          .join('\n'),
    )
    .join('\n');
  if (blocking.length > 0) tally.failures.push(`${label} — ${String(blocking.length)} blocking:\n${report}`);
}

/** The framing page, on the app's origin: the card's side of the protocol. */
function framePage(size: { width: number; height: number }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Point of Sale demo</title></head>
<body style="margin:0">
<iframe id="app" title="Point of Sale" src="/" style="border:0;width:${String(size.width)}px;height:${String(size.height)}px"></iframe>
<script>
  window.__hello = false; window.__state = null;
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data == null) return;
    if (e.data.type === 'adminium:demo:hello') window.__hello = true;
    if (e.data.type === 'adminium:demo:state') window.__state = e.data;
  });
  window.__send = (m) => document.getElementById('app').contentWindow.postMessage(Object.assign({ dv: 1 }, m), location.origin);
</script></body></html>`;
}

async function send(page: Page, message: Record<string, unknown>): Promise<void> {
  await page.evaluate((m) => (window as unknown as { __send: (m: unknown) => void }).__send(m), message);
}

test.describe.configure({ mode: 'serial' });

for (const combo of COMBOS) {
  const name = `${combo.theme}${combo.dir === 'rtl' ? ', Arabic (rtl)' : ''}`;
  test(`every demo screen, ${name}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const tally: Sweep = { states: 0, minor: 0, failures: [] };
    let current: string | null = null;

    for (const stop of STOPS) {
      const label = `${name} · ${stop.label}`;
      // A new frame (and so a fresh app) whenever the frame size changes.
      if (current !== stop.frame) {
        current = stop.frame;
        await page.unroute(`**${FRAME_PAGE}`);
        await page.route(`**${FRAME_PAGE}`, (route) =>
          route.fulfill({ contentType: 'text/html', body: framePage(FRAMES[stop.frame]) }),
        );
        await page.setViewportSize({ width: FRAMES[stop.frame].width, height: FRAMES[stop.frame].height });
        await page.goto(FRAME_PAGE);
        await expect.poll(() => page.evaluate(() => (window as unknown as { __hello: boolean }).__hello), {
          message: 'the app said hello to its frame',
        }).toBe(true);
        await send(page, { type: 'adminium:demo:init', locale: combo.locale, theme: combo.theme, mode: 'restaurant' });
      }
      await send(page, { type: 'adminium:demo:set', mode: stop.mode ?? 'restaurant' });
      await send(page, { type: 'adminium:demo:go', screen: stop.screen });
      if (stop.shortcut !== undefined) await send(page, { type: 'adminium:demo:do', shortcut: stop.shortcut });
      if (stop.act !== undefined) {
        await page.waitForTimeout(300);
        await stop.act(page.frameLocator('#app'));
      }
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __state: { screen?: string } | null }).__state?.screen), {
          message: `${label}: the app reports the screen`,
        })
        .toBe(stop.screen);
      await page.waitForTimeout(400);

      const probe = await page.frameLocator('#app').locator('html').evaluate((el) => ({
        theme: el.getAttribute('data-theme'),
        dir: el.getAttribute('dir'),
      }));
      expect(probe, `${label}: theme and direction`).toEqual({ theme: combo.theme, dir: combo.dir });
      await sweep(page, label, tally, testInfo);
    }

    testInfo.annotations.push({
      type: 'axe-summary',
      description: `${name}: ${String(tally.states)} screens, ${String(tally.minor)} lesser`,
    });
    expect(tally.states, 'a screen was skipped').toBe(STOPS.length);
    expect(tally.failures.join('\n\n')).toBe('');
  });
}
