/**
 * THE TILL'S CARD READER, IN A REAL BROWSER, ON A REAL ADMINIUM.
 *
 * A built Adminium on SQLite with this repo's BUILT staff screens
 * (`e2e/reader-stand.ts`), the engine's demo card reader paired as "Front
 * counter", and the owner rehearsing payments. The owner works the till:
 *
 *   - picks the till's reader in Till settings;
 *   - charges a sale on it: the reader takes it with a tip (tapped at the
 *     reader's counter, as a customer would), the till says what the reader
 *     took and prints the receipt, and Adminium holds one payment, tip beside it;
 *   - a declined card is said, and the ticket stays open;
 *   - with no reader, a standalone terminal's slip: both fields required;
 *   - a refund of the reader's payment asks a reason and one sentence to
 *     confirm, and goes back through the reader.
 *
 * Every state is put through axe. It needs a built Adminium and the add-ons
 * the contract's harness asks for (`ADMINIUM_REPO`, `ADD_ONS_REPO`); without
 * them the file is skipped, with the reason.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import type { ReaderStand } from './reader-stand.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ADMINIUM = process.env['ADMINIUM_REPO'] ?? '';
const why = ADMINIUM === '' ? 'ADMINIUM_REPO is not set: the till’s reader needs a built Adminium' : !existsSync(join(ADMINIUM, 'apps', 'server', 'dist', 'app.js')) ? `no built server in ${ADMINIUM}` : null;
const TILL = '/apps/pos/staff/';
const BLOCKING = new Set(['critical', 'serious']);
type Row = Record<string, unknown>;

let stand: ReaderStand;
let child: ChildProcess | null = null;
let scratch = '';
let context: BrowserContext;

async function axe(page: Page, label: string, failures: string[]): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  if (blocking.length > 0) failures.push(`${label}: ${blocking.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`).join('; ')}`);
}

async function rows(table: string): Promise<Row[]> {
  const config = (await (await context.request.get(`${stand.base}${TILL}surface-config.json`)).json()) as { tables: Record<string, string> };
  const reply = await context.request.get(`${stand.base}/api/v1/data/${stand.connectionId}/${config.tables[table]!}?limit=200`);
  expect(reply.status()).toBe(200);
  return ((await reply.json()) as { data: Row[] }).data;
}

async function tap(card: 'succeeds' | 'declined', tip = '0'): Promise<void> {
  const res = await fetch(`${stand.counter}/tap`, { method: 'POST', body: JSON.stringify({ card, tip }) });
  expect(res.status, await res.text()).toBe(200);
}

async function openTill(within: BrowserContext = context): Promise<Page> {
  const page = await within.newPage();
  await page.goto(stand.base + TILL);
  await expect(page.locator('.ticket-aside')).toBeVisible({ timeout: 30_000 });
  return page;
}

async function tool(page: Page, view: string): Promise<void> {
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator(`[data-nav="${view}"]`).click();
}

/** A sale of a flat white and a croissant: 8.30 + 8.25 % = 8.98. */
async function ringUp(page: Page): Promise<void> {
  await page.locator('.pos-tile', { hasText: 'Flat White' }).first().click();
  await page.locator('.pos-tile', { hasText: 'Croissant' }).first().click();
  await expect(page.locator('[data-estimate]')).toHaveCount(0, { timeout: 30_000 });
  await page.locator('[data-pay]').click();
  await expect(page.locator('[data-method="card"]')).toBeVisible();
}

test.describe('the till’s card reader on a built Adminium', () => {
  test.skip(why !== null, why ?? '');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(900_000);
    execFileSync('npm', ['run', 'build:surface'], { cwd: REPO, stdio: 'pipe' });
    scratch = mkdtempSync(join(tmpdir(), 'pos-reader-'));
    const out = join(scratch, 'stand.json');
    let log = '';
    child = spawn(join(REPO, 'node_modules', '.bin', 'vite-node'), ['e2e/reader-stand.ts'], { cwd: REPO, env: { ...process.env, LIVE_STAND_OUT: out }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
    const deadline = Date.now() + 600_000;
    while (!existsSync(out)) {
      if (child.exitCode !== null) throw new Error(`the stand exited:\n${log.slice(-4000)}`);
      if (Date.now() > deadline) throw new Error(`the stand never came up:\n${log.slice(-4000)}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    stand = JSON.parse(readFileSync(out, 'utf8')) as ReaderStand;
    context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addCookies(
      stand.cookie.split('; ').map((pair) => {
        const at = pair.indexOf('=');
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stand.base };
      }),
    );
  });

  test.afterAll(async () => {
    await context?.close();
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

  test('picks the till’s reader, charges a sale on it with a tip, and says a declined card', async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    const page = await openTill();
    await tool(page, 'tillsettings');
    await expect(page.getByRole('radiogroup', { name: 'Card reader for this till' })).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-reader]:not([data-reader="none"])').click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.locator('[data-reader]:not([data-reader="none"])')).toHaveAttribute('aria-checked', 'true');
    await axe(page, 'Till settings', failures);
    await page.getByRole('button', { name: 'Register' }).click();

    await ringUp(page);
    // The rehearsal band, the reader's own tip, and what goes on the reader.
    await expect(page.locator('[data-test-band]')).toBeVisible();
    await expect(page.locator('[data-tip-aside]')).toContainText('Chosen on the reader');
    await expect(page.getByText('Charge $8.98 on Front counter')).toBeVisible();
    await axe(page, 'the card tab with a reader', failures);
    await page.locator('[data-charge]').click();
    await expect(page.getByText('Sent to Front counter — ask the customer to tap, insert or swipe.')).toBeVisible({ timeout: 20_000 });
    await axe(page, 'a charge on the reader', failures);
    await tap('succeeds', '1.35');
    await expect(page.getByText('Approved · Visa ••4242 · $8.98 + $1.35 tip')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.receipt-paper')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.receipt-paper')).toContainText('Card · Front counter');
    const paid = (await rows('payments')).filter((p) => p['method'] === 'online');
    expect(paid.map((p) => [Number(p['amount']), Number(p['tip']), p['payment_last4']])).toEqual([[8.98, 1.35, '4242']]);

    // A declined card: said, and the ticket stays open.
    await page.getByRole('button', { name: 'New order' }).click();
    await ringUp(page);
    await page.locator('[data-charge]').click();
    await expect(page.getByText('Sent to Front counter — ask the customer to tap, insert or swipe.')).toBeVisible({ timeout: 20_000 });
    await tap('declined');
    await expect(page.getByText('Declined by the card. Try another card or another way.')).toBeVisible({ timeout: 30_000 });
    await axe(page, 'a declined card', failures);
    // Another way: cash, as always.
    await page.getByRole('button', { name: 'Another way' }).click();
    await page.locator('[data-method="cash"]').click();
    await page.locator('[data-cash-preset]').first().click();
    await page.locator('[data-charge]').click();
    await expect(page.locator('.receipt-paper')).toBeVisible({ timeout: 30_000 });
    await page.close();
    expect(failures).toEqual([]);
  });

  test('with no reader, the card is recorded from a standalone terminal’s slip: both fields required', async () => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const page = await openTill();
    await tool(page, 'tillsettings');
    await page.locator('[data-reader="none"]').click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Register' }).click();
    await ringUp(page);
    await expect(page.getByText('Take $8.98 on your card terminal, then record it.')).toBeVisible();
    await page.locator('[data-charge]').click();
    await expect(page.getByText('Enter the approval code from the terminal slip.')).toBeVisible();
    await expect(page.getByText('Enter the last four digits of the card.')).toBeVisible();
    await axe(page, 'a slip with both fields missing', failures);
    await page.getByLabel(/Approval code/).fill('a1b2c3');
    await page.getByLabel(/Last four digits/).fill('1881');
    await page.locator('[data-charge]').click();
    await expect(page.locator('.receipt-paper')).toBeVisible({ timeout: 30_000 });
    const slip = (await rows('payments')).find((p) => p['approval_code'] === 'A1B2C3')!;
    expect([slip['method'], slip['payment_last4'], slip['payment_ref'] ?? null]).toEqual(['card', '1881', null]);
    await page.close();
    expect(failures).toEqual([]);
  });

  test('a cashier’s till reaches the readers and pay links, but sends no money back without the right', async ({ browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const cashier = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await cashier.addCookies(
      stand.cashier.split('; ').map((pair) => {
        const at = pair.indexOf('=');
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stand.base };
      }),
    );
    try {
      // The routes a screens-only role's till speaks: the readers, and a ticket's pay link.
      const config = (await (await cashier.request.get(`${stand.base}${TILL}surface-config.json`)).json()) as { csrfToken: string; tables: Record<string, string> };
      const readers = await cashier.request.get(`${stand.base}/api/v1/payments/terminal/readers`);
      expect(readers.status(), await readers.text()).toBe(200);
      expect(((await readers.json()) as { data: { label: string }[] }).data.map((r) => r.label)).toEqual(['Front counter']);
      const madeTicket = await cashier.request.post(`${stand.base}/api/v1/data/${stand.connectionId}/${config.tables['tickets']!}`, { data: { values: { guests: 1, status: 'open' } }, headers: { 'x-adminium-csrf': config.csrfToken, origin: stand.base } });
      expect(madeTicket.status(), await madeTicket.text()).toBe(201);
      const ticket = ((await madeTicket.json()) as { data: Row }).data;
      {
        const schema = (await (await context.request.get(`${stand.base}/api/v1/connections/${stand.connectionId}/schema`)).json()) as { model: { tables: { id: string; name: string }[] } };
        const tableName = schema.model.tables.find((t) => t.name === config.tables['tickets'])!.id;
        const made = await cashier.request.post(`${stand.base}/api/v1/payments/links`, { data: { kind: 'profile', connectionId: stand.connectionId, tableName, rowKey: String(ticket['id']) }, headers: { 'x-adminium-csrf': config.csrfToken, origin: stand.base } });
        expect(made.status(), await made.text()).toBe(200);
      }
      // A refund of the reader's payment: the cashier is told who may, and no Refund button is there.
      const page = await openTill(cashier);
      await expect(page.locator('[data-nav="tillsettings"]')).toHaveCount(0);
      await tool(page, 'refund');
      const sale = (await rows('tickets')).find((t) => t['status'] === 'paid' && Number(t['tip']) === 1.35)!;
      await page.locator(`[data-refund-sale="${String(Number(/(\d+)/.exec(String(sale['number']))![1]))}"]`).click();
      await expect(page.locator('[data-refund-noperm]')).toContainText('Ask a manager who can refund online payments.');
      await expect(page.locator('[data-refund-issue]')).toHaveCount(0);
      await axe(page, 'a cashier at a refund that needs the right', failures);
      await page.close();
    } finally {
      await cashier.close();
    }
    expect(failures).toEqual([]);
  });

  test('a refund of the reader’s payment asks a reason and one sentence, and goes back through the reader', async () => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const page = await openTill();
    // What Adminium answered the refund screen, said when a step waits in vain.
    const said: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/dry-run') || response.status() >= 400) void response.text().then((body) => said.push(`${String(response.status())} ${new URL(response.url()).pathname}: ${body.slice(0, 300)}`));
    });
    await tool(page, 'refund');
    const sale = (await rows('tickets')).find((t) => t['status'] === 'paid' && Number(t['tip']) === 1.35)!;
    await page.locator(`[data-refund-sale="${String(Number(/(\d+)/.exec(String(sale['number']))![1]))}"]`).click();
    await expect(page.locator('[data-refund-payment="reader"]')).toContainText('Card reader');
    await expect(page.locator('[data-refund-payment="reader"]')).toContainText('Goes back to Visa ••4242 (usually 5–10 days).');
    await expect(page.locator('[data-refund-issue]'), said.join('\n')).toBeEnabled({ timeout: 20_000 });
    await page.locator('[data-refund-issue]').click();
    await expect(page.getByText('Choose a reason.')).toBeVisible();
    await page.locator('[data-refund-reason="wrong-item"]').click();
    await page.locator('[data-refund-issue]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('goes back to Visa ••4242');
    await expect(page.locator('[data-refund-go]')).toBeFocused();
    await axe(page, 'the refund’s confirm step', failures);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-refund-issue]')).toBeFocused();
    await page.locator('[data-refund-issue]').click();
    await page.locator('[data-refund-go]').click();
    await expect(page.getByText('Refund issued').first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await rows('refunds')).find((r) => r['method'] === 'online')?.['refund_state'], { timeout: 120_000 })
      .toBe('done');
    await page.close();
    expect(failures).toEqual([]);
  });

});
