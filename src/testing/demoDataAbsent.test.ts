/**
 * A REAL TILL'S BUNDLE CARRIES NOTHING OF THE DEMO CAFÉ (§0.6).
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

import { BRAND, STAFF, seedTicket } from '../data/demo';

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
