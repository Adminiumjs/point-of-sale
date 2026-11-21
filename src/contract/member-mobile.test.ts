/**
 * A member's mobile is personal data, and the till still works with it.
 *
 * Marked personal, the number reads as empty and refuses a search for any role
 * without the table's `read_pii` grant. The till finds members by phone, so
 * both of its roles hold that grant. In return, erasing a member takes the
 * number with the rest of their details.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ENGINES, missing, ok, type Engine } from './harness';
import { memberBook, standUp, type Stand } from './stand';

const why = missing();
if (why !== null && process.env['ADMINIUM_REQUIRE_CONTRACT'] === '1') throw new Error(`the contract must run here, and cannot: ${why}`);
const PORT = Number(process.env['CONTRACT_PORT'] ?? 4931) + 36;

const MOBILE = '(415) 555-0199';

describe.skipIf(why !== null)(`a member's mobile on a built Adminium${why === null ? '' : ` — skipped: ${why}`}`, () => {
  ENGINES.forEach(([engine, available]) => {
    describe.skipIf(!available)(`on ${engine}`, () => {
      let s: Stand;

      beforeAll(async () => {
        s = await standUp(engine as Engine, PORT, `pos_member_mobile_${engine}`);
        await s.insert('customers', { name: 'Dana Whitfield', mobile: MOBILE, email: `dana.${engine}@example.com` });
      }, 400_000);
      afterAll(async () => {
        await s?.server.stop();
      });

      it.each(['cashier', 'manager'] as const)('a %s finds a member by phone and reads the number', async (role) => {
        const book = await memberBook(await s.member(role, `Till ${role}`));
        for (const query of ['415 555 0199', '0199', 'Dana']) {
          const found = await book.search(query);
          expect([query, found.map((member) => member.mobile)]).toEqual([query, [MOBILE]]);
        }
      }, 120_000);

      it('erasing a member takes the number too', async () => {
        const address = `erase.${engine}@example.com`;
        const row = await s.insert('customers', { name: 'Luis Romano', mobile: '(415) 555-0177', email: address });
        ok(await s.staff.post('/api/v1/privacy/erase', { address, confirm: address }));
        const after = await s.one('customers', row['id']);
        expect(after['email'] ?? '').toBe('');
        expect(after['mobile'] ?? '').toBe('');
      }, 120_000);
    });
  });
});
