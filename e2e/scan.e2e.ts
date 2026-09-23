/**
 * A barcode scan in a real browser (T74): a scanner is a fast keyboard, so the
 * register must add the item when a code is "typed" at scanner speed and
 * ended with Enter — whether the focus is on the page or in the search field
 * — and must not when a person types the same keys.
 */
import { expect, test } from '@playwright/test';

import { BARCODES } from '../src/data/demo.ts';

const FRAME = '/__scan-frame.html';

test('a scan adds its item; the same keys typed by hand do not', async ({ page }) => {
  await page.route(`**${FRAME}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>scan</title></head><body style="margin:0">
<iframe id="app" title="Point of Sale" src="/" style="border:0;width:1180px;height:820px"></iframe>
<script>window.__hello=false;addEventListener('message',(e)=>{if(e.data&&e.data.type==='adminium:demo:hello')window.__hello=true;});
window.__send=(m)=>document.getElementById('app').contentWindow.postMessage(Object.assign({dv:1},m),location.origin);</script></body></html>`,
    }),
  );
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(FRAME);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hello: boolean }).__hello)).toBe(true);
  await page.evaluate(() => (window as unknown as { __send: (m: unknown) => void }).__send({ type: 'adminium:demo:init', locale: 'en-US', theme: 'light', mode: 'retail' }));
  await page.evaluate(() => (window as unknown as { __send: (m: unknown) => void }).__send({ type: 'adminium:demo:go', screen: 'register' }));
  await page.evaluate(() => (window as unknown as { __send: (m: unknown) => void }).__send({ type: 'adminium:demo:do', shortcut: 'empty-ticket' }));
  const frame = page.frameLocator('#app');
  const ticket = frame.locator('.ticket-aside');
  await expect(ticket).toBeVisible();

  // Typed by hand (150 ms a key): nothing is added.
  await frame.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.type(BARCODES['banana']!, { delay: 150 });
  await page.keyboard.press('Enter');
  await expect(ticket.getByText('Banana Bread')).toHaveCount(0);

  // Scanned (5 ms a key) into the search field: added, and the field is left as it was.
  const search = frame.getByRole('textbox', { name: /Search menu/ });
  await search.fill('');
  await search.click();
  await page.keyboard.type(BARCODES['croissant']!, { delay: 5 });
  await page.keyboard.press('Enter');
  await expect(ticket.getByText('Croissant', { exact: true })).toBeVisible();
  await expect(search).toHaveValue('');
});
