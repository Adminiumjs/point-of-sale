/**
 * A REAL TILL'S BUNDLE CARRIES NOTHING OF THE DEMO CAFÉ.
 *
 * The demo's roster shipped in every build, with their PINs, because the data
 * seam imported the seed statically. The seed is now reached only behind the
 * build-time `DEMO` flag, so the hosted staff build must not contain it — and
 * the demo build still must (the control: without it, "absent" proves nothing).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BRAND, DEMO_CODE, DEMO_GIFT_CARD, DEMO_OFFER, STAFF, seedTicket } from '../data/demo';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const outs: string[] = [];

function build(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), 'pos-demo-data-'));
  outs.push(out);
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: REPO,
    env: { ...process.env, VITE_ADMINIUM_SURFACE_SIDE: '', VITE_ADMINIUM_API_BASE_URL: '', VITE_ADMINIUM_PUBLISHABLE_KEY: '', ...env },
    stdio: 'pipe',
  });
  const assets = join(out, 'assets');
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
}

/** What only the demo café's data says: its name, its people, their PINs, a seeded note. */
const MARKERS = [
  BRAND,
  ...STAFF.map((p) => p.name),
  ...STAFF.map((p) => `"${p.pin}"`),
  ...seedTicket().items.map((li) => li.note).filter(Boolean),
  // The demo café's own offer, code and gift card (0.3.0): answered from memory, only in the demo.
  DEMO_OFFER.name,
  DEMO_CODE.code,
  DEMO_GIFT_CARD.code,
];

let demo = '';
let staff = '';
beforeAll(() => {
  demo = build({});
  staff = build({ VITE_ADMINIUM_SURFACE_SIDE: 'staff' });
}, 120_000);
afterAll(() => {
  for (const out of outs) rmSync(out, { recursive: true, force: true });
});

describe('the demo café stays in the demo', () => {
  it('the demo build carries its data (the control)', () => {
    expect(MARKERS.filter((m) => demo.includes(m))).toEqual(MARKERS);
  });

  it('the hosted staff build carries none of it — no roster, no PINs, no seeded tickets', () => {
    expect(MARKERS.filter((m) => staff.includes(m))).toEqual([]);
  });
});

/**
 * The till shows the Guests pages and the guest's email as screens only in the
 * demo; a staff build has no use for them, and the email preview is demo-only
 * (the real email is Adminium's). A module-level `lazy()` Rollup cannot prove
 * pure kept both chunks in the staff build until it was marked so.
 */
describe('the Guests screens stay in the demo', () => {
  // The party grid's class (guests/parts.tsx) and the preview's light mail client (guests/GuestEmail.tsx).
  const GUESTS = ['guest-party-grid', '#f1f1f4'];

  it('the demo build carries them (the control)', () => {
    expect(GUESTS.filter((m) => demo.includes(m))).toEqual(GUESTS);
  });

  it('the hosted staff build carries neither', () => {
    expect(GUESTS.filter((m) => staff.includes(m))).toEqual([]);
  });
});

/**
 * The demo shows codes, offers, staff discounts, gift cards and stock — and
 * asks nobody for any of it. Its own shop answers from memory
 * (`data/demoShop.ts`), so the demo's bundle does not carry one address of
 * Adminium's API: not the data doors, and none of an add-on's (Offers'
 * look-up and card print, Inventory's stock words). What is not in the bundle
 * cannot be requested. The staff build is the control: it carries them all.
 */
describe('the demo asks no server, and no add-on, anything', () => {
  // Every address a real till's doors speak to (`data/desk.ts`, `data/sink.ts`), by its fixed part.
  const ROUTES = ['/api/v1/', '/api/v1/add-ons/', '/api/v1/add-ons/offers/look-up', '/api/v1/add-ons/offers/documents/render', '/api/v1/words/inventory/stock', '/api/v1/data/', 'surface-config.json'];

  it('the hosted staff build carries every one of them (the control)', () => {
    expect(ROUTES.filter((route) => staff.includes(route))).toEqual(ROUTES);
  });

  it('the demo build carries none: no add-on route is in it to be requested', () => {
    expect(ROUTES.filter((route) => demo.includes(route))).toEqual([]);
  });

  it('the demo build names no add-on’s table either — its reasons, its code and its card are its own', () => {
    for (const table of ['offers_gift_cards', 'offers_reasons', 'offers_applied', 'inventory_links', 'inventory_stock_points']) expect(demo.includes(table), table).toBe(false);
  });
});
