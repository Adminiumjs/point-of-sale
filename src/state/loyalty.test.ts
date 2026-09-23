/**
 * LOYALTY (wave 2, 55-T69): a member on a ticket earns from it, spends points
 * on a reward that joins it free, and what they earned and spent is written to
 * their history once the ticket is paid — never before, and never twice.
 *
 * The outbox sits on a fresh memory sink per test, so the rows that reached
 * "the server" are read back; the demo's book answers the reads.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { demoMembers, matches, portLoyalty, queryKind } from '../data/loyalty';
import { memorySink, type MemorySink } from '../data/sink';
import type { SnapshotPort } from '../data/snapshotPort';
import type { Member } from '../data/types';
import { nextTier, pointsFor, pointsLeft, pointsSpent, tierOf } from './points';
import { usePos } from './store';
import { outbox, setSink } from './writes';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
let sink: MemorySink;

const settled = async () => {
  for (let i = 0; i < 20; i += 1) {
    await outbox().idle();
    await Promise.resolve();
  }
};
const ledger = () => sink.calls.filter((c) => c.ref === 'loyalty_ledger').map((c) => c.values!);
const dana = (): Member => demoMembers().find((m) => m.id === 'dana')!;

beforeEach(() => {
  sink = memorySink({ firstNumber: 2001 });
  setSink(sink);
  usePos.setState(INITIAL, true);
  usePos.setState({ ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] }, held: [], kds: [], discount: null, members: { dana: dana() } });
});

describe('the rules', () => {
  it('earns one point a whole unit spent, and a tier follows every point ever earned', () => {
    expect(pointsFor(12.99)).toBe(12);
    expect(pointsFor(0.4)).toBe(0);
    expect(tierOf(999)).toBe('silver');
    expect(tierOf(1000)).toBe('gold');
    expect(tierOf(2500)).toBe('platinum');
    expect(nextTier(420)).toEqual({ tier: 'gold', need: 580, pct: 42 });
    expect(nextTier(1490)).toEqual({ tier: 'platinum', need: 1010, pct: 59 });
    expect(nextTier(2710)).toBeNull();
  });

  it('counts what a ticket’s rewards will take against what the member holds', () => {
    const rewards = [{ id: 'r', name: 'Free latte', points: 250, itemId: 'latte', icon: 'coffee' }];
    const items = [{ key: 'a', id: 'latte', qty: 1, selection: {}, note: '', seat: 0, sent: false, rewardId: 'r' }];
    expect(pointsSpent(items, rewards)).toBe(250);
    expect(pointsLeft(dana(), items, rewards)).toBe(990);
  });

  it('reads digits as a phone or a member number, and letters as a name', () => {
    expect(queryKind('(415) 555-0132')).toEqual({ digits: '4155550132', name: '' });
    expect(queryKind('Dana')).toEqual({ digits: '', name: 'Dana' });
    expect(matches(dana(), '0132')).toBe(true);
    expect(matches(dana(), '1001')).toBe(true);
    expect(matches(dana(), 'whit')).toBe(true);
    expect(matches(dana(), '01')).toBe(false);
  });
});

describe('Adminium’s members, read through the port', () => {
  const port = (rows: Record<string, unknown>[]) => {
    const asked: { ref: string; where: unknown }[] = [];
    const p: SnapshotPort = {
      config: async () => ({ side: 'staff', timezone: 'UTC', currency: null, refs: {} }),
      assertRefs: async () => undefined,
      list: async <T,>(ref: string, opts: { where?: unknown }) => {
        asked.push({ ref, where: opts.where });
        return { data: rows as T[] };
      },
    };
    return { p, asked };
  };
  const row = { id: 7, member_no: '1001', name: 'Dana Whitfield', mobile: '(415) 555-0132', email: null, joined_at: '2023-03-14T12:00:00Z', points: '1240', lifetime_points: 1490, visits: 38 };

  it('asks for the last four digits of a phone, then keeps only whole matches', async () => {
    const { p, asked } = port([row, { ...row, id: 8, mobile: '(628) 555-0132' }]);
    const found = await portLoyalty(p).search('415 555 0132');
    expect(asked[0]).toEqual({
      ref: 'customers',
      where: { or: [{ column: 'member_no', op: 'eq', value: '4155550132' }, { column: 'mobile', op: 'ilike', value: '%0132%' }] },
    });
    expect(found.map((m) => [m.id, m.points, m.lifetime, m.visits])).toEqual([['7', 1240, 1490, 38]]);
  });

  it('searches a name without the pattern’s own wildcards', async () => {
    const { p, asked } = port([row]);
    await portLoyalty(p).search('Da%na_');
    expect(asked[0]!.where).toEqual({ column: 'name', op: 'ilike', value: '%Dana%' });
  });
});

describe('a member on the ticket', () => {
  it('is saved on the ticket, and parked with it on the tray', async () => {
    s().tapTile('croissant');
    s().attachMember('dana');
    await settled();
    expect(sink.calls.find((c) => c.ref === 'tickets' && c.op === 'update')?.values).toEqual({ customer_id: 'dana' });
    s().hold();
    expect(s().held[0]!.customerId).toBe('dana');
    expect(s().ticket.customerId).toBeUndefined();
    s().resumeHeld(s().held[0]!.number);
    expect(s().ticket.customerId).toBe('dana');
  });

  it('a reward joins the ticket free, once, and only with the points for it', async () => {
    usePos.setState({ loyaltySel: 'dana' });
    s().redeemReward('r-latte');
    const line = s().ticket.items[0]!;
    expect(line).toMatchObject({ id: 'latte', rewardId: 'r-latte', qty: 1 });
    expect(s().ticket.customerId).toBe('dana');
    // A reward is one reward: the + does nothing.
    s().inc(line.key);
    expect(s().ticket.items[0]!.qty).toBe(1);
    await settled();
    expect(sink.calls.find((c) => c.ref === 'ticket_items')?.values).toMatchObject({ menu_item_id: 'latte', unit_price: 0, reward_id: 'r-latte' });

    // 1,240 − 250 leaves 990: the bowl (600) fits once, not twice.
    s().redeemReward('r-bowl');
    s().redeemReward('r-bowl');
    expect(s().ticket.items.filter((x) => x.rewardId === 'r-bowl')).toHaveLength(1);
    expect(s().toast?.kind).toBe('error');
  });

  it('taking the member off takes their rewards off too', async () => {
    usePos.setState({ loyaltySel: 'dana' });
    s().tapTile('croissant');
    s().redeemReward('r-latte');
    await settled();
    s().detachMember();
    await settled();
    expect(s().ticket.items.map((x) => x.id)).toEqual(['croissant']);
    expect(s().ticket.customerId).toBeUndefined();
    expect(sink.calls.some((c) => c.op === 'remove' && c.ref === 'ticket_items')).toBe(true);
    expect(sink.calls.filter((c) => c.ref === 'tickets' && c.op === 'update').at(-1)?.values).toEqual({ customer_id: null });
  });
});

describe('paying a member’s ticket', () => {
  it('writes what they earned (a visit) and what they spent, under the ticket, once it is paid', async () => {
    usePos.setState({ loyaltySel: 'dana' });
    s().tapTile('bowl'); // 12.00
    s().redeemReward('r-latte');
    s().openPay();
    await settled();
    expect(ledger()).toEqual([]);
    usePos.setState({ payMethod: 'cash', cash: '20', tip: 0 });
    s().onCharge();
    await settled();
    expect(s().view).toBe('complete');
    const rows = ledger();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ customer_id: 'dana', kind: 'earn', points: 12, visit: 1, ticket_id: 1, reward_id: null, note: 'Breakfast Bowl' });
    expect(rows[1]).toMatchObject({ customer_id: 'dana', kind: 'redeem', points: -250, visit: 0, ticket_id: 1, reward_id: 'r-latte' });
    expect(String(rows[0]!['id'])).toMatch(/^[0-9a-f-]{36}$/);
    // The receipt says it, and the till knows the new balance before any read.
    expect(s().lastSale?.member).toEqual({ name: 'Dana Whitfield', earned: 12, balance: 1002 });
    expect(s().members['dana']).toMatchObject({ points: 1002, lifetime: 1502, visits: 39 });
    expect(s().pointsLog['dana']!.map((e) => e.kind).sort()).toEqual(['earn', 'redeem']);
  });

  it('earns nothing on a ticket with no member', async () => {
    s().tapTile('bowl');
    s().openPay();
    usePos.setState({ payMethod: 'qr', tip: 0 });
    s().onCharge();
    await settled();
    expect(ledger()).toEqual([]);
    expect(s().lastSale?.member).toBeUndefined();
  });

  it('a refund takes back the points the goods earned', async () => {
    usePos.setState({ loyaltySel: 'dana' });
    s().tapTile('bowl');
    s().attachMember('dana');
    s().openPay();
    usePos.setState({ payMethod: 'qr', tip: 0 });
    s().onCharge();
    await settled();
    const sale = s().sales[0]!;
    expect(sale.customerId).toBe('dana');
    s().openRefund();
    s().pickRefundSale(sale);
    await s().processRefund();
    await settled();
    expect(ledger().at(-1)).toMatchObject({ kind: 'adjust', points: -12, visit: 0, customer_id: 'dana' });
    expect(s().members['dana']).toMatchObject({ points: 1240, lifetime: 1490 });
  });
});

describe('enrolling', () => {
  it('saves a new member and takes Adminium’s key and number', async () => {
    const ok = await s().enroll({ name: ' Nora Quinn ', mobile: '(415) 555-0199', email: '' });
    expect(ok).toBe(true);
    const insert = sink.calls.find((c) => c.ref === 'customers');
    expect(insert?.values).toEqual({ name: 'Nora Quinn', mobile: '(415) 555-0199', email: null });
    const id = s().loyaltySel!;
    expect(s().members[id]).toMatchObject({ name: 'Nora Quinn', points: 0 });
    expect(id).not.toMatch(/^tmp:/);
  });

  it('opens the member a phone number already belongs to, instead of a second one', async () => {
    const ok = await s().enroll({ name: 'Dana W', mobile: '415 555 0132', email: '' });
    expect(ok).toBe(true);
    expect(sink.calls.some((c) => c.ref === 'customers')).toBe(false);
    expect(s().loyaltySel).toBe('dana');
  });

  it('refuses a name with no number', async () => {
    expect(await s().enroll({ name: 'No Phone', mobile: '12', email: '' })).toBe(false);
    expect(sink.calls).toEqual([]);
  });
});

describe('a held ticket’s member', () => {
  it('is read when the ticket comes back to the register, if this till has not seen them', async () => {
    usePos.setState({ members: {}, held: [{ number: 9, rid: 'h9', table: null, at: 0, seats: 1, items: [], customerId: 'luis' }] });
    s().resumeHeld(9);
    await settled();
    expect(s().ticket.customerId).toBe('luis');
    expect(s().members['luis']?.name).toBe('Luis Romano');
  });
});
