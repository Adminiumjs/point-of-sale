/**
 * The shop `reader.e2e.ts` opens the till on: a built Adminium on SQLite with
 * this repo's app and its BUILT staff screens, the engine's demo card reader
 * paired in Studio as "Front counter", and the owner rehearsing payments (so
 * the demo reader, a test reader, is theirs to use, and their tickets are
 * sample data). The reader's counter (`src/contract/reader.mjs`) is where the
 * spec taps a card.
 *
 * Run by `vite-node`; writes where the shop is, the owner's session cookie and
 * the counter's address to `LIVE_STAND_OUT`, and stays up until SIGTERM.
 *
 * Tests only; nothing that ships imports it.
 */
import { writeFileSync } from 'node:fs';

import { appBundle, missing, ok } from '../src/contract/harness.ts';
import { standUp } from '../src/contract/stand.ts';

const PORT = Number(process.env['LIVE_STAND_PORT'] ?? 4970);
const OUT = process.env['LIVE_STAND_OUT'] ?? '';

export interface ReaderStand {
  base: string;
  pid: number;
  connectionId: string;
  cookie: string;
  counter: string;
}

async function main(): Promise<void> {
  const why = missing();
  if (why !== null) throw new Error(why);
  if (OUT === '') throw new Error('LIVE_STAND_OUT is not set');
  if (!appBundle().built) throw new Error('the staff screens are not built: run `npm run build:surface` first');
  const s = await standUp('sqlite', PORT, 'pos_e2e_reader', { reader: true });
  const stop = (): void => {
    void s.server.stop().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    await s.insert('settings', { venue_name: 'Daybreak Coffee', tax_rate_bp: 825 });
    const food = await s.insert('menu_categories', { name: 'Coffee' });
    for (const [name, price] of [
      ['Flat White', 4.5],
      ['Croissant', 3.8],
    ] as const) {
      await s.insert('menu_items', { name, price, category_id: food['id'] });
    }
    ok(await s.staff.put('/api/v1/payments/rehearsal', { on: true }));
    const started = ok(await s.staff.post<{ data: { pairing: string } }>('/api/v1/payments/readers/pairing', { provider: 'demo-reader', mode: 'test', label: 'Front counter', locationId: 'loc_demo' })).data;
    const code = ((await (await fetch(`${s.server.reader}/code?pairing=${encodeURIComponent(started.pairing)}`)).json()) as { code: string }).code;
    ok(await s.staff.post('/api/v1/payments/readers/pairing/finish', { provider: 'demo-reader', mode: 'test', label: 'Front counter', locationId: 'loc_demo', pairing: started.pairing, code }));
    const out: ReaderStand = { base: s.server.base, pid: process.pid, connectionId: s.connectionId, cookie: s.staff.session, counter: s.server.reader };
    writeFileSync(OUT, JSON.stringify(out), { mode: 0o600 });
  } catch (error) {
    await s.server.stop();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
