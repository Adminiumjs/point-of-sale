/**
 * TEXTS ON A BUILT ADMINIUM (plan 80), with no provider connected — which is
 * how every shop starts, and how the demo stays.
 *
 * The till asks for a text by writing one row in its outbox, as the cashier.
 * Adminium claims the row and writes how it ended in fixed words; the till
 * reads that row back through the same session and says one result. With no
 * provider, that result is "texts aren't set up" — never "sent", never an
 * error the till cannot read. A member who gave only a mobile is a person
 * Adminium can find and erase by that number.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSessionTransport } from '../data/sessionSource';
import { realTables } from '../data/tableOfRef';
import { sessionTextLog, type TextLog } from '../data/textLog';
import { follow, setTextPace } from '../state/texts';
import { ENGINES, missing, ok, type Caller, type Engine } from './harness';
import { standUp, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 44;

/** The till's own text log, spoken as this caller. */
async function tillLog(caller: Caller): Promise<TextLog> {
  const config = ok(await caller.get<{ tables?: Record<string, string>; connectionId: string; installId: string; csrfToken: string; timezone: string; currency: string }>('/apps/pos/staff/surface-config.json'));
  const transport = createSessionTransport({
    tableOfRef: realTables(config.tables ?? {}),
    connectionId: config.connectionId,
    installId: config.installId,
    staff: { csrfToken: config.csrfToken, timezone: config.timezone, currency: config.currency },
    fetchImpl: caller.fetchAs(),
  } as never);
  return sessionTextLog(transport, config.tables ?? {});
}

describe.skipIf(why !== null)(`texts on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;
      let cashier: Caller;
      let log: TextLog;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_texts_${engine}`);
        cashier = await s.member('cashier', 'Till cashier');
        log = await tillLog(cashier);
        // The till's own pace, a little longer: the outbox's job runs beside other work.
        setTextPace([500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000], 1000);
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it('a pickup text the cashier asks for is read back as "texts aren’t set up"', async () => {
        const customer = await s.insert('customers', { name: 'Wen Li', mobile: '+44 7911 123471' });
        const id = randomUUID();
        await s.as(cashier).insert('messages', { id, kind: 'pickup_ready', status: 'queued', customer_id: customer['id'] });
        expect(await follow(() => log.read(id))).toBe('not-set-up');
        // The till reads the code Adminium wrote beside its sentence, not the sentence.
        expect(await s.one('messages', id)).toMatchObject({ status: 'skipped', text_reason: 'not-set-up' });
      }, 120_000);

      it("a booking's reminder goes to the number on the booking, and reads back the same way", async () => {
        const booking = await s.insert('reservations', { name: 'Nell Varga', mobile: '+44 7911 123472', party_size: 2, starts_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'confirmed', channel: 'phone' });
        expect(booking['texts_ok'] ?? null).toBeNull();
        const id = randomUUID();
        await s.as(cashier).insert('messages', { id, kind: 'table_reminder', status: 'queued', reservation_id: booking['id'] });
        expect(await follow(() => log.read(id))).toBe('not-set-up');
      }, 120_000);

      it('the emailed receipt still takes an address in the same column', async () => {
        const id = randomUUID();
        await s.as(cashier).insert('messages', { id, kind: 'receipt', status: 'queued', to_address: 'guest@tillmail.net' });
        // Read as the owner: a cashier is shown the address masked.
        expect((await s.one('messages', id))['to_address']).toBe('guest@tillmail.net');
      }, 60_000);

      it('says texts are not set up, so the till draws no box and offers no text receipt', async () => {
        expect(await (await tillLog(s.staff)).ready()).toBe(false);
      }, 60_000);

      it("the owner at the till records a member's yes at the counter, in the box's words, and reads it back", async () => {
        const owner = await tillLog(s.staff);
        const member = await s.insert('customers', { name: 'Oda Berg', mobile: '+44 7911 123474' });
        const person = { table: 'customers' as const, row: String(member['id']), phone: null };
        expect((await owner.standing(person))?.state).toBe('not-asked');
        expect(await owner.record(person, { state: 'yes', how: 'in-person', wording: { text: 'Text me about my table or pickup. A reminder for your table, or word that your order is ready.', version: 'v1 en-US' } })).toBe(true);
        expect(await owner.standing(person)).toEqual({ state: 'yes', masked: expect.stringContaining('474'), liftBy: null });
      }, 60_000);

      // The till's own roles are screens-only; from Adminium 0.3.77 their door lets them ask and record, each under its own right.
      it("a cashier reads whether texts can go, records a member's yes at the counter, and reads it back, as the till does", async () => {
        const member = await s.insert('customers', { name: 'Ida Berg', mobile: '+44 7911 123476' });
        const person = { table: 'customers' as const, row: String(member['id']), phone: null };
        expect(await log.ready()).toBe(false);
        expect((await log.standing(person))?.state).toBe('not-asked');
        expect(await log.record(person, { state: 'yes', how: 'in-person', wording: { text: 'Text me about my table or pickup. A reminder for your table, or word that your order is ready.', version: 'v1 en-US' } })).toBe(true);
        expect((await log.standing(person))?.state).toBe('yes');
      }, 60_000);

      it('a member known only by their mobile is found by it, to be erased', async () => {
        const mobile = '+44 7911 123473';
        await s.insert('customers', { name: 'Ida Lund', mobile });
        const preview = ok(await s.staff.post<{ data: { goes: { kind: string; table?: string; count: number }[] } }>('/api/v1/privacy/phone/erase/preview', { phone: mobile })).data;
        const members = preview.goes.filter((item) => item.kind === 'people' && (item.table ?? '').endsWith('customers'));
        expect(members.map((item) => item.count)).toEqual([1]);
      }, 60_000);
    });
  });
});
