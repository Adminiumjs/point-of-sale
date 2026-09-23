/**
 * Loyalty members, their points history and the rewards — read when the
 * Loyalty screen asks, never at boot (wave 2).
 *
 * A venue has thousands of members and nobody reads them all: the till looks
 * one up by their phone, their member number or their name, and reads that
 * member's recent history. Writes do not come through here — a new member, the
 * points a sale earns, a reward spent — they go through the outbox like every
 * other write, and the store keeps what it wrote on screen.
 *
 *   demoLoyalty   the demo's three members and rewards
 *   portLoyalty   Adminium's tables, as the signed-in staff member
 *
 * Adminium keeps the totals: a member's `points`, `lifetime_points` and
 * `visits` are rollups of their history (`manifest.json`), so a reward spent
 * at another till is in the balance the next read returns.
 */
import { DEMO } from '../surface';
import type { ListCondition, SnapshotPort } from './snapshotPort';
import type { Member, PointsEntry, Reward } from './types';
import { instant } from './venueTime';

export interface LoyaltyBook {
  /** The rewards on offer, in their order. */
  rewards(): Promise<Reward[]>;
  /** Members matching a phone number, a member number or a name. */
  search(query: string): Promise<Member[]>;
  /** One member, read again (their balance may have moved). */
  member(id: string): Promise<Member | null>;
  /** Their latest history, newest first. */
  activity(id: string): Promise<PointsEntry[]>;
}

/** What a search matches on: digits are a phone or a member number, anything else a name. */
export function queryKind(query: string): { digits: string; name: string } {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D+/g, '');
  const letters = /\p{L}/u.test(trimmed);
  return { digits: letters ? '' : digits, name: letters ? trimmed : '' };
}

/** Does this member answer the query (the same rule both books apply)? */
export function matches(member: Member, query: string): boolean {
  const { digits, name } = queryKind(query);
  if (name !== '') return member.name.toLowerCase().includes(name.toLowerCase());
  if (digits.length < 3) return false;
  const phone = (member.mobile ?? '').replace(/\D+/g, '');
  return phone.includes(digits) || (member.memberNo ?? '').replace(/\D+/g, '') === digits;
}

/* ------------------------------------------------------------------ demo */

const DAY = 86_400_000;
const year = (y: number) => Date.UTC(y, 2, 14, 12);

/** The comp's three members (COMP `auxV`), with the history their balances add up to. */
export function demoMembers(): Member[] {
  return [
    { id: 'dana', memberNo: '1001', name: 'Dana Whitfield', mobile: '(415) 555-0132', email: 'dana.w@example.com', joinedAt: year(2023), points: 1240, lifetime: 1490, visits: 38 },
    { id: 'luis', memberNo: '1002', name: 'Luis Romano', mobile: '(415) 555-0781', email: null, joinedAt: year(2024), points: 420, lifetime: 420, visits: 12 },
    { id: 'aisha', memberNo: '1003', name: 'Aisha Bello', mobile: '(628) 555-0244', email: 'aisha@example.com', joinedAt: year(2022), points: 2110, lifetime: 2710, visits: 64 },
  ];
}

export function demoRewards(): Reward[] {
  return [
    { id: 'r-latte', name: 'Free latte', points: 250, itemId: 'latte', icon: 'coffee' },
    { id: 'r-pastry', name: 'Free pastry', points: 180, itemId: 'croissant', icon: 'croissant' },
    { id: 'r-bowl', name: 'Free breakfast bowl', points: 600, itemId: 'bowl', icon: 'salad' },
  ];
}

function demoActivity(id: string): PointsEntry[] {
  const now = Date.now();
  const entry = (n: number, kind: PointsEntry['kind'], points: number, daysAgo: number, note: string | null, rewardId: string | null = null): PointsEntry => ({
    id: `${id}-${String(n)}`,
    kind,
    points,
    rewardId,
    note,
    at: now - daysAgo * DAY - 3_600_000,
  });
  if (id === 'dana') {
    return [
      entry(1, 'earn', 12, 0, 'Flat White · Croissant'),
      entry(2, 'redeem', -250, 6, null, 'r-latte'),
      entry(3, 'earn', 9, 10, 'Cold Brew'),
    ];
  }
  if (id === 'luis') return [entry(1, 'earn', 16, 2, 'Breakfast Bowl · Fresh OJ')];
  if (id === 'aisha') return [entry(1, 'earn', 21, 1, 'Avocado Toast · Matcha Latte'), entry(2, 'redeem', -600, 14, null, 'r-bowl')];
  return [];
}

export const demoLoyalty: LoyaltyBook = {
  rewards: async () => demoRewards(),
  search: async (query) => demoMembers().filter((m) => matches(m, query)),
  member: async (id) => demoMembers().find((m) => m.id === id) ?? null,
  activity: async (id) => demoActivity(id),
};

/** Before the hosted till sets its reader: nobody to find (the demo has its own). */
const noLoyalty: LoyaltyBook = { rewards: async () => [], search: async () => [], member: async () => null, activity: async () => [] };
let current: LoyaltyBook = DEMO ? demoLoyaltyFor() : noLoyalty;
function demoLoyaltyFor(): LoyaltyBook {
  return demoLoyalty;
}
export const loyalty = (): LoyaltyBook => current;
/** Read from Adminium from now on (the hosted till). */
export function setLoyalty(next: LoyaltyBook): void {
  current = next;
}

/* ------------------------------------------------------------------ port */

type Num = number | string;
type Key = number | string;

interface WireCustomer {
  id: Key;
  member_no: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  joined_at: string | null;
  points: Num | null;
  lifetime_points: Num | null;
  visits: Num | null;
}
interface WireReward {
  id: Key;
  name: string;
  points: Num;
  menu_item_id: Key;
  icon: string | null;
  active: boolean | number;
  position: Num;
}
interface WireEntry {
  id: Key;
  kind: PointsEntry['kind'];
  points: Num;
  reward_id: Key | null;
  note: string | null;
  at: string;
}

const n = (value: Num | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));
const key = (value: Key): string => String(value);

export function memberOf(row: WireCustomer): Member {
  return {
    id: key(row.id),
    memberNo: row.member_no,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    joinedAt: row.joined_at === null ? 0 : instant(row.joined_at),
    points: n(row.points),
    lifetime: n(row.lifetime_points),
    visits: n(row.visits),
  };
}

/**
 * A like-pattern's own wildcards are dropped, not escaped: the engines do not
 * agree on an escape character (SQLite has none without an ESCAPE clause).
 */
const literal = (text: string): string => text.replace(/[%_\\]/g, '');

/** The members, rewards and history in Adminium, read through the till's port. */
export function portLoyalty(port: SnapshotPort): LoyaltyBook {
  return {
    async rewards() {
      const res = await port.list<WireReward>('rewards', { limit: 200, offset: 0, where: { column: 'active', op: 'eq', value: true }, order: 'position.asc' });
      return res.data.map((row) => ({ id: key(row.id), name: row.name, points: n(row.points), itemId: key(row.menu_item_id), icon: row.icon ?? 'gift' }));
    },
    async search(query) {
      const { digits, name } = queryKind(query);
      let where: ListCondition;
      if (name !== '') where = { column: 'name', op: 'ilike', value: `%${literal(name)}%` };
      else if (digits.length >= 3) {
        /*
         * A phone is stored as it was typed, "(415) 555-0132", so its digits
         * are not one run: the last four are, and the rest is checked here.
         */
        where = {
          or: [
            { column: 'member_no', op: 'eq', value: digits },
            { column: 'mobile', op: 'ilike', value: `%${digits.slice(-4)}%` },
          ],
        };
      } else return [];
      const res = await port.list<WireCustomer>('customers', { limit: 50, offset: 0, where, order: 'name.asc' });
      return res.data.map(memberOf).filter((m) => matches(m, query));
    },
    async member(id) {
      const res = await port.list<WireCustomer>('customers', { limit: 1, offset: 0, where: { column: 'id', op: 'eq', value: Number.isNaN(Number(id)) ? id : Number(id) } });
      const row = res.data[0];
      return row === undefined ? null : memberOf(row);
    },
    async activity(id) {
      const res = await port.list<WireEntry>('loyaltyLedger', {
        limit: 20,
        offset: 0,
        where: { column: 'customer_id', op: 'eq', value: Number.isNaN(Number(id)) ? id : Number(id) },
        order: 'at.desc',
      });
      return res.data.map((row) => ({
        id: key(row.id),
        kind: row.kind,
        points: n(row.points),
        rewardId: row.reward_id === null ? null : key(row.reward_id),
        note: row.note,
        at: instant(row.at),
      }));
    },
  };
}
