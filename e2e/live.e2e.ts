/**
 * THE STAFF SCREENS IN A REAL BROWSER, ON A REAL ADMINIUM.
 *
 * The other specs here drive the demo, which has no server. This one stands a
 * built Adminium up on SQLite with Offers & gift cards, Inventory and Invoices
 * & Receipts (`e2e/live-stand.ts`), serves the BUILT till from it at
 * `/apps/pos/staff/`, and works a shift as three people — a cashier, a manager
 * who also sits at Offers' desk, and the owner — each signed in by the session
 * cookie the stand handed over (no password is typed, or known, here).
 *
 * Every figure asserted is Adminium's: read off the screen, and then read
 * again from the server through the same session, and the two must agree.
 *
 * It needs a built Adminium and its add-ons (`ADMINIUM_REPO`, `ADD_ONS_REPO`).
 * Where there is none — CI without a server — the whole file is skipped, with
 * the reason.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';

import type { LiveStand } from './live-stand.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ADMINIUM = process.env['ADMINIUM_REPO'] ?? '';
const why =
  ADMINIUM === ''
    ? 'ADMINIUM_REPO is not set: the live staff screens need a built Adminium to open on'
    : !existsSync(join(ADMINIUM, 'apps', 'server', 'dist', 'app.js'))
      ? `no built server in ${ADMINIUM}`
      : null;

const TILL = '/apps/pos/staff/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['critical', 'serious']);
const TABLET = { width: 1280, height: 860 };
const PHONE = { width: 390, height: 844 };

type Who = keyof LiveStand['cookies'];
type Row = Record<string, unknown>;

let stand: LiveStand;
let child: ChildProcess | null = null;
let scratch = '';
const contexts: Partial<Record<Who, BrowserContext>> = {};
const tables: Record<string, string> = {};

const usd = (value: unknown): string => `$${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;

/*
 * ADMINIUM ALLOWS EACH PERSON 300 CALLS A MINUTE, and a test works a shift in
 * seconds. Every call made as each person is counted here, and a test waits
 * for room before it starts — so the limit is never what a test meets. (When
 * it is met anyway the till reads again and sends again by itself; the waits
 * below are only so that no assertion runs out of patience first.)
 */
const ALLOWED = 300;
const WINDOW_MS = 60_000;
const spent: Record<Who, number[]> = { cashier: [], manager: [], admin: [] };
const whoIs = new WeakMap<BrowserContext, Who>();
const count = (context: BrowserContext): void => {
  const who = whoIs.get(context);
  if (who !== undefined) spent[who].push(Date.now());
};
async function roomFor(who: Who, calls: number): Promise<void> {
  for (;;) {
    const since = Date.now() - WINDOW_MS;
    spent[who] = spent[who].filter((at) => at > since);
    if (spent[who].length + calls <= ALLOWED - 30) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/** A browser that is already this person: the session cookie the stand handed over, nothing typed. */
async function signedIn(browser: Browser, who: Who, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: TABLET, ...options });
  whoIs.set(context, who);
  context.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) count(context);
  });
  await context.addCookies(
    stand.cookies[who].split('; ').map((pair) => {
      const at = pair.indexOf('=');
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stand.base };
    }),
  );
  return context;
}

/** Answers the server refused for rate (429): the limit's doing, not the till's — named when a wait runs out. */
const limited: string[] = [];
/** Every answer of 400 or more, and every call that got none, since the last test began: said when a test fails. */
const answers: string[] = [];

/** The till, open and read: the ticket pane is there and nothing is still on its way. */
async function openTill(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.on('response', (response) => {
    if (response.status() === 429) limited.push(`${response.request().method()} ${new URL(response.url()).pathname}`);
    if (response.status() >= 400) answers.push(`${String(response.status())} ${response.request().method()} ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => answers.push(`no answer: ${request.method()} ${new URL(request.url()).pathname} (${request.failure()?.errorText ?? ''})`));
  await page.goto(stand.base + TILL);
  await expect(page.locator('.ticket-aside')).toBeVisible({ timeout: 30_000 });
  return page;
}

/** Rows of one of the till's tables, as this person's session reads them. */
async function rows(context: BrowserContext, table: string, query = ''): Promise<Row[]> {
  count(context);
  const reply = await context.request.get(`${stand.base}/api/v1/data/${stand.connectionId}/${table}?limit=200${query}`);
  expect(reply.status(), `${table}: ${await reply.text()}`).toBe(200);
  return ((await reply.json()) as { data: Row[] }).data;
}
const newest = (list: Row[]): Row => [...list].sort((a, b) => Number(b['id']) - Number(a['id']))[0]!;
/** The ticket on the register, as Adminium holds it. */
const ticketOnServer = async (context: BrowserContext): Promise<Row> => newest((await rows(context, tables['tickets']!)).filter((row) => row['status'] === 'open' || row['status'] === 'sent'));

const aside = (page: Page): Locator => page.locator('.ticket-aside');
const tile = (page: Page, name: string): Locator => page.locator('.pos-tile', { hasText: name }).first();
const payButton = (page: Page): Locator => page.locator('[data-pay]');
const reductions = (page: Page): Locator => page.locator('[data-reductions]');

/**
 * The ticket's figures are Adminium's: no "Estimate" beside the total, and the
 * total on the Pay button is the server's own `due`, read through the session
 * — once the screen has settled, so the server is asked once, not polled.
 */
async function figuresAreTheServers(page: Page, context: BrowserContext): Promise<Row> {
  await expect(page.locator('[data-estimate]'), `the figures are in (refused for rate: ${String(limited.length)})`).toHaveCount(0, { timeout: 45_000 });
  let row = await ticketOnServer(context);
  // A save may still have been on its way when the screen was read: one more look, a moment later.
  if (!(await payButton(page).innerText()).includes(usd(row['due']))) {
    await page.waitForTimeout(1_500);
    row = await ticketOnServer(context);
  }
  await expect(payButton(page)).toContainText(usd(row['due']));
  return row;
}

async function addCode(page: Page, code: string): Promise<void> {
  const form = page.locator('[data-code-form]');
  await form.locator('input').fill(code);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('[data-code-said]')).toBeVisible();
}

/** Pay what is left in cash, exactly, and wait for the receipt. */
async function payCash(page: Page): Promise<void> {
  await page.locator('[data-method="cash"]').click();
  await page.locator('[data-cash-preset]').first().click();
  await page.locator('[data-charge]').click();
  await expect(page.locator('.receipt-paper')).toBeVisible({ timeout: 20_000 });
}

interface Sweep {
  states: number;
  failures: string[];
}

async function sweep(page: Page, label: string, tally: Sweep, testInfo: TestInfo): Promise<void> {
  await page.locator('body').evaluate(() =>
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
  if (lesser.length > 0) testInfo.annotations.push({ type: 'axe-lesser', description: `${label}: ${lesser.map((v) => `${String(v.impact)}:${v.id}`).join(', ')}` });
  if (blocking.length > 0) {
    tally.failures.push(
      `${label} — ${String(blocking.length)} blocking:\n` +
        blocking
          .map(
            (v) =>
              `${String(v.impact)}: ${v.id} — ${v.help}\n` +
              v.nodes
                .slice(0, 4)
                .map((n) => `    ${n.target.join(' ')}\n      ${n.html.slice(0, 200)}`)
                .join('\n'),
          )
          .join('\n'),
    );
  }
}

test.describe('the staff screens on a built Adminium', () => {
  test.skip(why !== null, why ?? '');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(900_000);
    // The till the server will serve is this checkout's, built now.
    execFileSync('npm', ['run', 'build:surface'], { cwd: REPO, stdio: 'pipe' });
    scratch = mkdtempSync(join(tmpdir(), 'pos-live-'));
    const out = join(scratch, 'stand.json');
    let log = '';
    child = spawn(join(REPO, 'node_modules', '.bin', 'vite-node'), ['e2e/live-stand.ts'], { cwd: REPO, env: { ...process.env, LIVE_STAND_OUT: out }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
    const deadline = Date.now() + 600_000;
    while (!existsSync(out)) {
      if (child.exitCode !== null) throw new Error(`the stand exited:\n${log.slice(-4000)}`);
      if (Date.now() > deadline) throw new Error(`the stand never came up:\n${log.slice(-4000)}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    stand = JSON.parse(readFileSync(out, 'utf8')) as LiveStand;
    for (const who of ['cashier', 'manager', 'admin'] as const) contexts[who] = await signedIn(browser, who);
    // The names the till's tables are stored under, as the staff config says them.
    const config = (await (await contexts.cashier!.request.get(`${stand.base}${TILL}surface-config.json`)).json()) as { tables: Record<string, string>; addOns: Record<string, { tables?: Record<string, string> }> };
    Object.assign(tables, config.tables);
    for (const [key, addOn] of Object.entries(config.addOns)) for (const [short, real] of Object.entries(addOn.tables ?? {})) tables[`${key}:${short}`] = real;
  });

  test.beforeEach(() => {
    answers.length = 0;
  });
  test.afterEach(({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && answers.length > 0) console.log(`refused or unanswered during "${testInfo.title}":\n  ${answers.join('\n  ')}`);
  });

  test.afterAll(async () => {
    for (const context of Object.values(contexts)) await context?.close();
    const running = child;
    if (running !== null && running.exitCode === null) {
      await new Promise<void>((resolve) => {
        const hard = setTimeout(() => running.kill('SIGKILL'), 15_000);
        running.once('exit', () => {
          clearTimeout(hard);
          resolve();
        });
        running.kill('SIGTERM');
      });
    }
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true });
  });

  test('the till’s own cards are brought into Offers by the owner; a manager is told to ask, a cashier is not shown it', async ({}, testInfo) => {
    test.setTimeout(240_000);
    const tally: Sweep = { states: 0, failures: [] };
    const banner = (page: Page) => page.getByRole('region', { name: 'Bring your gift cards into Offers' });

    // A cashier: no banner, and nothing of Offers' cards yet.
    const cashier = await openTill(contexts.cashier!);
    await expect(tile(cashier, 'Breakfast Bowl')).toBeVisible();
    await expect(banner(cashier)).toHaveCount(0);
    await expect(cashier.locator('[data-gift-tile]')).toHaveCount(0);
    await cashier.close();

    // A manager sees it, and is told who runs it: the first write is the owner's.
    const manager = await openTill(contexts.manager!);
    await expect(banner(manager)).toBeVisible();
    await banner(manager).getByRole('button', { name: 'Open' }).click();
    await manager.getByRole('button', { name: 'Bring them in' }).click();
    await expect(manager.getByText('Ask the owner to run this')).toBeVisible();
    await sweep(manager, 'the move, a manager told to ask the owner', tally, testInfo);
    await manager.close();

    // The owner runs it. This shop never sold a card of its own, so there is nothing to compare — and it says so.
    const owner = await openTill(contexts.admin!);
    await expect(banner(owner)).toBeVisible();
    await sweep(owner, 'the register with the banner', tally, testInfo);
    await banner(owner).getByRole('button', { name: 'Open' }).click();
    await owner.getByRole('button', { name: 'Bring them in' }).click();
    await expect(owner.getByText('All balances match')).toBeVisible({ timeout: 30_000 });
    await sweep(owner, 'the move, done', tally, testInfo);
    expect((await rows(contexts.admin!, tables['settings']!))[0]!['cards_moved']).toBeTruthy();
    await owner.getByRole('button', { name: 'Reload the till' }).click();
    // From now on gift cards are Offers': the tile that sells them is on the register.
    await expect(owner.locator('[data-gift-tile]')).toBeVisible({ timeout: 30_000 });
    await expect(banner(owner)).toHaveCount(0);
    await owner.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  test('a cashier’s ticket: the offer applies by itself, a code is added, and the total is the server’s', async () => {
    test.setTimeout(240_000);
    await roomFor('cashier', 70);
    const page = await openTill(contexts.cashier!);
    for (let i = 0; i < 3; i += 1) await tile(page, 'Breakfast Bowl').click();
    for (let i = 0; i < 2; i += 1) await tile(page, 'Croissant').click();
    // Two taps, two croissants (the echo of the first save must not undo the second tap).
    await expect(aside(page).getByText('$7.60')).toBeVisible();

    // The automatic offer is its own line under the items: a tenth off two croissants.
    await expect(reductions(page)).toContainText('Croissants, a tenth off');
    await expect(reductions(page)).toContainText('Offer');
    await expect(reductions(page)).toContainText('−$0.76');
    let row = await figuresAreTheServers(page, contexts.cashier!);
    expect([usd(row['subtotal']), usd(row['discount']), usd(row['total'])]).toEqual(['$43.60', '$0.76', '$46.37']);
    await expect(aside(page)).toContainText('$46.37');

    // A code nobody issued is refused under the field, in words; nothing changes.
    await addCode(page, 'NOSUCHCODE');
    await expect(page.locator('[data-code-said="refused"]')).toHaveText('No code or voucher matches NOSUCHCODE');
    expect(usd((await ticketOnServer(contexts.cashier!))['total'])).toBe('$46.37');

    // A real one comes off as a line of its own.
    await addCode(page, 'AUTUMN5');
    await expect(page.locator('[data-code-said="ok"]')).toContainText('AUTUMN5 applied');
    await expect(reductions(page)).toContainText('$5.00 off');
    await expect(reductions(page)).toContainText('Discount code');
    await expect(reductions(page)).toContainText('−$5.00');
    row = await figuresAreTheServers(page, contexts.cashier!);
    expect([usd(row['discount']), usd(row['total'])]).toEqual(['$5.76', '$40.96']);
    await expect(payButton(page)).toContainText('$40.96');
    await page.close();
  });

  test('a staff discount: over the cashier’s limit nothing is applied and the dialog says how far they may go; within it, it applies', async ({}, testInfo) => {
    test.setTimeout(240_000);
    await roomFor('cashier', 70);
    const tally: Sweep = { states: 0, failures: [] };
    const page = await openTill(contexts.cashier!);
    await expect(reductions(page)).toContainText('$5.00 off');
    await page.locator('[data-open-discount]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Staff discount')).toBeVisible();

    // Twenty percent, for Goodwill: Adminium refuses it, and says the most this person may give.
    await dialog.locator('[data-discount-preset="20"]').click();
    await dialog.getByRole('radio', { name: 'Goodwill' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('You can give up to 10 % · Ask a manager');
    await expect(dialog.locator('[data-discount-add]')).toBeDisabled();
    await sweep(page, 'the staff discount dialog, refused', tally, testInfo);
    expect(usd((await ticketOnServer(contexts.cashier!))['total'])).toBe('$40.96');

    // An amount is held to money, and a comp is a leave of its own.
    await dialog.locator('[data-discount-kind="amt"]').click();
    await dialog.locator('[data-discount-preset="10"]').click();
    await expect(dialog.getByRole('alert')).toContainText(/^You can give up to \$\d+\.\d\d · Ask a manager$/);
    await dialog.locator('[data-discount-kind="comp"]').click();
    await expect(dialog.getByRole('alert')).toHaveText('Your role can’t give a comp · Ask a manager');

    // Ten percent is within the limit: the button carries what Adminium says it takes off, and Add saves exactly that.
    await dialog.locator('[data-discount-kind="pct"]').click();
    await dialog.locator('[data-discount-preset="10"]').click();
    await expect(dialog.locator('[data-discount-takes]')).toHaveText('−$3.78');
    await sweep(page, 'the staff discount dialog, ready', tally, testInfo);
    await dialog.locator('[data-discount-add]').click();
    await expect(dialog).toHaveCount(0);
    await expect(reductions(page)).toContainText('Staff · Goodwill');
    await expect(reductions(page)).toContainText('−$3.78');
    const row = await figuresAreTheServers(page, contexts.cashier!);
    expect([usd(row['discount']), usd(row['tax']), usd(row['total'])]).toEqual(['$9.54', '$2.81', '$36.87']);
    await page.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  test('the manager opens the same ticket on their till, and twenty percent applies', async () => {
    test.setTimeout(240_000);
    await roomFor('manager', 60);
    const page = await openTill(contexts.manager!);
    await expect(reductions(page)).toContainText('Staff · Goodwill');
    await page.locator('[data-open-discount]').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-discount-preset="20"]').click();
    await dialog.getByRole('radio', { name: 'Goodwill' }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('[data-discount-takes]')).toHaveText('−$7.57');
    await dialog.locator('[data-discount-add]').click();
    await expect(dialog).toHaveCount(0);
    await expect(reductions(page)).toContainText('−$7.57');
    const row = await figuresAreTheServers(page, contexts.manager!);
    // $43.60 of goods; the offer's $0.76, the code's $5.00, then twenty percent of what is left; 8.25 % on the rest.
    expect([usd(row['discount']), usd(row['net']), usd(row['tax']), usd(row['total'])]).toEqual(['$13.33', '$30.27', '$2.50', '$32.77']);
    await page.close();
  });

  test('a gift card pays part, cash the rest; the receipt says the card’s last four and what is left on it', async ({}, testInfo) => {
    test.setTimeout(240_000);
    await roomFor('cashier', 80);
    const tally: Sweep = { states: 0, failures: [] };
    const page = await openTill(contexts.cashier!);
    await expect(payButton(page)).toContainText('$32.77');
    await payButton(page).click();
    await page.locator('[data-method="gift_card"]').click();
    const form = page.locator('[data-card-form]');
    await form.locator('input').fill('GC-7K2MW3HNQ4XP');
    await form.locator('button[type="submit"]').click();
    // The dry run's answer: what the card covers, and what is then still owing — both Adminium's.
    const covers = page.locator('[data-card-covers]');
    await expect(covers).toContainText('The card covers $19.00');
    await expect(covers).toContainText('Gift card ···· Q4XP');
    await expect(covers).toContainText('$13.77 left to pay');
    await sweep(page, 'payment, the gift card tab with its answer', tally, testInfo);
    // Nothing was taken by asking.
    expect(usd((await ticketOnServer(contexts.cashier!))['due'])).toBe('$32.77');

    await page.locator('[data-charge]').click();
    await expect(page.locator('[data-card-left]')).toHaveText('$0.00 left on it');
    await expect(page.locator('.pay-summary')).toContainText('$13.77');
    expect(usd((await ticketOnServer(contexts.cashier!))['due'])).toBe('$13.77');
    // The typed code is in nothing the page kept.
    expect(await page.content()).not.toContain('7K2MW3HN');

    await payCash(page);
    const paper = page.locator('.receipt-paper');
    await expect(paper.locator('[data-paid-row]')).toHaveText(['Paid · Gift card ···· Q4XP$19.00', 'Paid · Cash$13.77']);
    await expect(paper.locator('.receipt-cards')).toHaveText('Gift card balance left$0.00');
    await expect(paper).toContainText('Croissants, a tenth off');
    await expect(paper).toContainText('Staff · Goodwill');
    await expect(paper).toContainText('$32.77');
    await sweep(page, 'the receipt of a sale a gift card part-paid', tally, testInfo);
    // The card is empty in Offers, and the ticket is paid at the figure the screen showed.
    const card = (await rows(contexts.admin!, tables['offers:gift_cards']!)).find((one) => one['label'] === 'Q4XP')!;
    expect(usd(card['balance'])).toBe('$0.00');
    const paid = newest((await rows(contexts.cashier!, tables['tickets']!)).filter((one) => one['status'] === 'paid'));
    expect([usd(paid['total']), usd(paid['due'])]).toEqual(['$32.77', '$0.00']);
    await page.locator('[data-new-order]').click();
    await page.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  test('a code typed and never applied is not dropped at Pay: refused, nothing is paid; taken, the amount asked is the reduced one', async () => {
    test.setTimeout(240_000);
    await roomFor('cashier', 90);
    const context = contexts.cashier!;
    const page = await openTill(context);
    // Three bowls: the code asks for a ticket of at least $30.00.
    for (let i = 0; i < 3; i += 1) await tile(page, 'Breakfast Bowl').click();
    let row = await figuresAreTheServers(page, context);
    expect([usd(row['subtotal']), usd(row['discount']), usd(row['total'])]).toEqual(['$36.00', '$0.00', '$38.97']);
    const field = page.locator('[data-code-form] input');

    // A code nobody issued, typed, and Pay pressed instead of Apply: the cashier stays, the field says why, nothing is paid.
    await field.fill('NOSUCHCODE');
    await payButton(page).click();
    await expect(page.locator('[data-code-said="refused"]')).toHaveText('No code or voucher matches NOSUCHCODE');
    await expect(aside(page)).toBeVisible();
    await expect(page.locator('[data-charge]')).toHaveCount(0);
    await expect(field).toHaveValue('NOSUCHCODE');
    expect(usd((await ticketOnServer(context))['due'])).toBe('$38.97');

    // A real one, typed the same way: it is applied first, and Payment opens on Adminium's figures with it on.
    await field.fill('AUTUMN5');
    await payButton(page).click();
    const summary = page.locator('.pay-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-estimate]'), 'the figures are the server’s').toHaveCount(0, { timeout: 45_000 });
    row = await ticketOnServer(context);
    expect([usd(row['discount']), usd(row['total']), usd(row['due'])]).toEqual(['$5.00', '$33.56', '$33.56']);
    await expect(summary).toContainText('$5.00 off');
    await expect(summary).toContainText('−$5.00');
    await expect(summary).toContainText('$33.56');
    // The amount asked is the reduced one.
    await expect(page.locator('[data-charge]')).toContainText('$33.56');
    await expect(page.locator('[data-cash-preset]')).toHaveCount(0);
    await page.locator('[data-method="cash"]').click();
    await expect(page.locator('[data-cash-preset]').first()).toHaveAttribute('data-cash-preset', '33.56');

    // Back on the ticket the reduction is a line of its own, and the field is empty: the code has done its work.
    await page.getByRole('button', { name: 'Ticket', exact: true }).click();
    await expect(reductions(page)).toContainText('$5.00 off');
    await expect(reductions(page)).toContainText('−$5.00');
    await expect(field).toHaveValue('');
    await expect(payButton(page)).toContainText('$33.56');

    await payButton(page).click();
    await payCash(page);
    const paid = newest((await rows(context, tables['tickets']!)).filter((one) => one['status'] === 'paid'));
    expect([usd(paid['discount']), usd(paid['total']), usd(paid['due'])]).toEqual(['$5.00', '$33.56', '$0.00']);
    await page.locator('[data-new-order]').click();
    await page.close();
  });

  test('a new card is sold by someone Offers lets, reloaded past, and printed once — its code never on the till', async ({}, testInfo) => {
    test.setTimeout(240_000);
    await roomFor('manager', 120);
    const tally: Sweep = { states: 0, failures: [] };
    const context = contexts.manager!;
    const page = await openTill(context);
    await page.locator('[data-gift-tile]').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.locator('[data-card-mode="sell"]')).toHaveAttribute('aria-checked', 'true');
    await sheet.locator('[data-card-amount="50"]').click();
    await sweep(page, 'the gift card sheet, selling', tally, testInfo);
    await sheet.locator('[data-card-add]').click();
    await expect(sheet).toHaveCount(0);

    // A line that names the card by its last four; nothing is on the card until the ticket is paid.
    const line = aside(page).locator('[data-card-line]');
    await expect(line).toHaveText('Active when this ticket is paid');
    const row = await figuresAreTheServers(page, context);
    expect([usd(row['subtotal']), usd(row['tax']), usd(row['total'])]).toEqual(['$50.00', '$0.00', '$50.00']);
    const made = newest(await rows(contexts.admin!, tables['offers:gift_cards']!));
    expect([made['status'], usd(made['balance'])]).toEqual(['inactive', '$0.00']);
    const last4 = String(made['label']);
    await expect(aside(page)).toContainText(`Gift card ···· ${last4}`);
    // Not paid: there is nothing to print yet.
    await expect(page.locator('[data-card-print]')).toHaveCount(0);

    await payButton(page).click();
    await payCash(page);
    await expect(page.locator('.receipt-paper')).toContainText(`New gift card · Gift card ···· ${last4}`);
    await expect(page.locator('[data-card-print]')).toContainText(`Gift card ···· ${last4} for $50.00 is ready to print`);
    await sweep(page, 'the receipt, with a card to print', tally, testInfo);
    const after = (await rows(contexts.admin!, tables['offers:gift_cards']!)).find((one) => one['id'] === made['id'])!;
    expect([after['status'], usd(after['balance'])]).toEqual(['active', '$50.00']);

    // The page is reloaded between the sale and the print: the card still waits, on the register.
    await page.reload();
    await expect(aside(page)).toBeVisible({ timeout: 30_000 });
    const waiting = page.locator('[data-card-print]');
    await expect(waiting).toContainText(`Gift card ···· ${last4} for $50.00 is ready to print`);
    await sweep(page, 'the register, a card waiting to print', tally, testInfo);
    const [printed] = await Promise.all([context.waitForEvent('page'), waiting.getByRole('button', { name: 'Print the card' }).click()]);
    await printed.waitForLoadState();
    // Offers drew it: the amount the card was loaded with, and its whole code — on that page, and only there.
    await expect(printed.locator('body')).toContainText('$50.00');
    const text = await printed.locator('body').innerText();
    const code = /GC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/.exec(text)?.[0] ?? '';
    expect(code, text.slice(0, 200)).not.toBe('');
    expect(code.endsWith(last4)).toBe(true);
    await printed.close();

    // Printed once: the row is gone, and so is the ticket that printed it.
    await expect(page.locator('[data-card-print]')).toHaveCount(0);
    const kept = await page.evaluate(() => JSON.stringify([Object.entries(sessionStorage), Object.entries(localStorage)]));
    const whole = (await page.content()) + kept;
    for (const part of [code, code.replace(/-/g, ''), code.slice(3, 12)]) expect(whole).not.toContain(part);
    expect(kept).not.toContain('pos.cardPrints');
    await page.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  test('a cashier is not offered "Sell a card", and tops one up: looked up by its code, loaded when the ticket is paid', async ({}, testInfo) => {
    test.setTimeout(240_000);
    await roomFor('cashier', 80);
    const tally: Sweep = { states: 0, failures: [] };
    const page = await openTill(contexts.cashier!);
    await page.locator('[data-gift-tile]').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.locator('[data-card-mode]')).toHaveCount(0);
    await expect(sheet.locator('[data-sell-who]')).toHaveText('Only someone with the Offers desk role can sell a new card');
    await sheet.locator('[data-card-code]').fill('GC-NOSUCHCARD00');
    await sheet.locator('form button[type="submit"]').click();
    await expect(sheet.getByRole('alert')).toHaveText('No gift card has that code');
    await sheet.locator('[data-card-code]').fill('GC-M9RD5PTC2HVT');
    await sheet.locator('form button[type="submit"]').click();
    await expect(sheet.locator('[data-card-found]')).toContainText('Gift card ···· 2HVT');
    await expect(sheet.locator('[data-card-found]')).toContainText('$35.75');
    await sheet.locator('[data-card-amount="10"]').click();
    await expect(sheet).toContainText('+$10.00 when this ticket is paid');
    await sweep(page, 'the gift card sheet, a top-up with its card found', tally, testInfo);
    await sheet.locator('[data-card-add]').click();
    await expect(aside(page)).toContainText('Gift card ···· 2HVT');
    const row = await figuresAreTheServers(page, contexts.cashier!);
    expect([usd(row['subtotal']), usd(row['tax']), usd(row['total'])]).toEqual(['$10.00', '$0.00', '$10.00']);
    expect(await page.content()).not.toContain('M9RD5PTC');
    await payButton(page).click();
    await payCash(page);
    const card = (await rows(contexts.admin!, tables['offers:gift_cards']!)).find((one) => one['label'] === '2HVT')!;
    expect(usd(card['balance'])).toBe('$45.75');
    // A top-up makes no card: nothing waits to be printed.
    await expect(page.locator('[data-card-print]')).toHaveCount(0);
    await page.locator('[data-new-order]').click();
    await page.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  test('an item the books call Out still sells, with its warning; a returned one goes back on the shelf', async ({}, testInfo) => {
    test.setTimeout(240_000);
    await roomFor('cashier', 150);
    const tally: Sweep = { states: 0, failures: [] };
    const context = contexts.cashier!;
    const page = await openTill(context);
    const mug = tile(page, 'Stoneware mug');
    const pin = tile(page, 'Enamel pin');
    await expect(mug.locator('[data-stock="low"]')).toHaveText(`Only ${String(stand.mugsLeft)} left`);
    await expect(pin.locator('[data-stock="out"]')).toHaveText('Out');

    // "Out" is advice, not a stop: the pin goes on the ticket, and the cashier is told.
    await pin.click();
    await expect(page.getByRole('status').filter({ hasText: 'Enamel pin shows none in stock, and the sale still goes through' })).toBeVisible();
    await expect(aside(page).locator('[data-stock-note]')).toHaveText('Out on the books · count this item');
    await mug.click();
    await mug.click();
    await expect(aside(page).getByText('$28.00')).toBeVisible();
    const row = await figuresAreTheServers(page, context);
    expect([usd(row['subtotal']), usd(row['tax']), usd(row['total'])]).toEqual(['$34.00', '$2.81', '$36.81']);
    await sweep(page, 'the register, stock words and a line sold while out', tally, testInfo);
    const number = String(row['number']);
    await payButton(page).click();
    await payCash(page);
    await page.locator('[data-new-order]').click();
    // Two mugs left the shelf: the tile reads the stock again after the sale.
    await expect(tile(page, 'Stoneware mug').locator('[data-stock="low"]')).toHaveText(`Only ${String(stand.mugsLeft - 2)} left`, { timeout: 20_000 });

    // The refund of one line, the mugs, back on the shelf.
    await page.getByRole('button', { name: 'More' }).click();
    await page.locator('[data-nav="refund"]').click();
    await page.locator(`[data-refund-sale="${number}"]`).click();
    const lines = page.getByRole('checkbox');
    await expect(lines).toHaveCount(2);
    // Every line starts chosen; the pin stays sold.
    await lines.filter({ hasText: 'Enamel pin' }).click();
    await expect(lines.filter({ hasText: 'Enamel pin' })).toHaveAttribute('aria-checked', 'false');
    const back = page.getByRole('radiogroup', { name: 'Stoneware mug' });
    await expect(back.locator('[data-back-to="shelf"]')).toHaveAttribute('aria-checked', 'true');
    await expect(back.locator('[data-back-to="shelf"]')).toHaveText('Back on the shelf');
    // What goes back is Adminium's quote: two mugs and their tax.
    const issue = page.locator('[data-refund-issue]');
    await expect(issue).toContainText('$30.31');
    await sweep(page, 'the refund, one line back on the shelf', tally, testInfo);
    await issue.click();
    await expect(page.getByRole('status').filter({ hasText: '$30.31 refunded' })).toBeVisible({ timeout: 20_000 });
    const refund = newest(await rows(context, tables['refunds']!));
    expect(usd(refund['amount'])).toBe('$30.31');
    const returned = (await rows(context, tables['refund_items']!)).filter((one) => String(one['refund_id']) === String(refund['id']));
    expect(returned.map((one) => [Number(one['qty']), one['back_to']])).toEqual([[2, 'shelf']]);

    // And the shelf holds them again, as the tile reads it on the next load.
    const again = await openTill(context);
    await expect(tile(again, 'Stoneware mug').locator('[data-stock="low"]')).toHaveText(`Only ${String(stand.mugsLeft)} left`, { timeout: 20_000 });
    await again.close();
    await page.close();
    expect(tally.failures.join('\n\n')).toBe('');
  });

  /*
   * THE FOUR LOOKS over the states this release adds — light, dark, Arabic
   * (right to left) and a phone — each under axe. Reached by structure, not
   * by words (the locales change the words); a ticket is rung up in each look
   * and paid at the end of it, so the next look starts clean. The cashier and
   * the manager take turns: Adminium allows each person 300 calls a minute,
   * and one person working four shifts back to back meets that limit.
   */
  const LOOKS = [
    { name: 'light', who: 'cashier', options: { colorScheme: 'light', locale: 'en-US' }, theme: 'light', dir: 'ltr' },
    { name: 'dark', who: 'manager', options: { colorScheme: 'dark', locale: 'en-US' }, theme: 'dark', dir: 'ltr' },
    { name: 'Arabic (rtl)', who: 'cashier', options: { colorScheme: 'light', locale: 'ar-EG' }, theme: 'light', dir: 'rtl' },
    { name: 'a phone', who: 'manager', options: { colorScheme: 'light', locale: 'en-US', viewport: PHONE }, theme: 'light', dir: 'ltr' },
  ] as const;

  for (const look of LOOKS) {
    test(`the new states under axe, ${look.name}`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const tally: Sweep = { states: 0, failures: [] };
      const label = (state: string) => `${look.name} · ${state}`;
      await roomFor(look.who, 170);
      const context = await signedIn(browser, look.who, look.options);
      const page = await openTill(context);
      expect(await page.locator('html').evaluate((el) => ({ theme: el.getAttribute('data-theme'), dir: el.getAttribute('dir') ?? 'ltr' })), `${look.name}: theme and direction`).toEqual({ theme: look.theme, dir: look.dir });

      // A ticket with an offer on it, a code refused under the field, a line sold while out.
      await tile(page, 'Croissant').click();
      await tile(page, 'Croissant').click();
      await tile(page, 'Enamel pin').click();
      await expect(reductions(page), `the offer's line (refused for rate: ${String(limited.length)})`).toBeVisible({ timeout: 45_000 });
      await addCode(page, 'NOSUCHCODE');
      await expect(page.locator('[data-code-said="refused"]')).toBeVisible();
      await expect(page.locator('[data-stock-note]')).toBeVisible();
      await sweep(page, label('the ticket: reductions, a refused code, stock'), tally, testInfo);

      // The staff discount dialog, refused: a comp is a leave neither of the till's roles holds here.
      await page.locator('[data-open-discount]').click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('[data-discount-kind="comp"]').click();
      await dialog.getByRole('radio').filter({ hasText: 'Goodwill' }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await sweep(page, label('the staff discount dialog, refused'), tally, testInfo);
      await dialog.locator('[data-discount-cancel]').click();

      // The gift card sheet: a card found for a top-up.
      await page.locator('[data-gift-tile]').click();
      const sheet = page.getByRole('dialog');
      // Someone who may also sell a new card starts there: the top-up is the other half of the sheet.
      if ((await sheet.locator('[data-card-mode="topup"]').count()) > 0) await sheet.locator('[data-card-mode="topup"]').click();
      await sheet.locator('[data-card-code]').fill('GC-M9RD5PTC2HVT');
      await sheet.locator('form button[type="submit"]').click();
      await expect(sheet.locator('[data-card-found]')).toBeVisible();
      await sheet.locator('[data-card-amount="25"]').click();
      await sweep(page, label('the gift card sheet, a card found'), tally, testInfo);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);

      // Payment: the gift card tab with Adminium's answer for a card that still holds money.
      await payButton(page).click();
      await page.locator('[data-method="gift_card"]').click();
      await page.locator('[data-card-form] input').fill('GC-M9RD5PTC2HVT');
      await page.locator('[data-card-form] button[type="submit"]').click();
      await expect(page.locator('[data-card-covers]')).toBeVisible();
      await sweep(page, label('payment, the gift card tab'), tally, testInfo);

      // Paid in cash; the receipt with its reduction.
      await payCash(page);
      await sweep(page, label('the receipt'), tally, testInfo);
      await page.locator('[data-new-order]').click();
      await expect(aside(page)).toBeVisible();

      // The refund of that sale, with where each thing goes.
      const sold = newest((await rows(context, tables['tickets']!)).filter((one) => one['status'] === 'paid'));
      if (await page.locator('[data-nav="refund"]').count() === 0 || !(await page.locator('[data-nav="refund"]').isVisible())) await page.locator('button[aria-haspopup="menu"]').click();
      await page.locator('[data-nav="refund"]').click();
      await page.locator(`[data-refund-sale="${String(sold['number'])}"]`).click();
      await expect(page.locator('[data-back-to="shelf"]').first()).toBeVisible();
      await expect(page.locator('[data-refund-issue]')).toBeEnabled({ timeout: 20_000 });
      await sweep(page, label('the refund, where each thing goes'), tally, testInfo);

      testInfo.annotations.push({ type: 'axe-summary', description: `${look.name}: ${String(tally.states)} states` });
      await context.close();
      expect(tally.states, 'a state was skipped').toBe(6);
      expect(tally.failures.join('\n\n')).toBe('');
    });
  }
});
