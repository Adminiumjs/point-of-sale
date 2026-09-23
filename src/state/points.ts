/**
 * The loyalty programme's rules (wave 2): what a sale earns, and the tiers.
 *
 * A member earns ONE point for every whole unit of the venue's currency they
 * spend on goods — after any discount, before tax and tip, and nothing for a
 * reward's free line. A tier follows every point they ever EARNED (Adminium's
 * `lifetime_points`), not what they hold now, so spending points on a reward
 * never moves a member down a tier.
 */
import type { LineItem, Member, Reward } from '../data/types';

export type Tier = 'silver' | 'gold' | 'platinum';

/** Where each tier starts, in lifetime points (the comp's 1,000 and 2,500). */
export const TIERS: readonly { tier: Tier; from: number }[] = [
  { tier: 'silver', from: 0 },
  { tier: 'gold', from: 1000 },
  { tier: 'platinum', from: 2500 },
];

export function tierOf(lifetime: number): Tier {
  let found: Tier = 'silver';
  for (const step of TIERS) if (lifetime >= step.from) found = step.tier;
  return found;
}

/** The tier above, how many points away it is, and how far along the bar is (0–100). Null at the top. */
export function nextTier(lifetime: number): { tier: Tier; need: number; pct: number } | null {
  const next = TIERS.find((step) => step.from > lifetime);
  if (next === undefined) return null;
  return { tier: next.tier, need: next.from - lifetime, pct: Math.min(100, Math.floor((lifetime / next.from) * 100)) };
}

/** What spending this much on goods earns. */
export const pointsFor = (goods: number): number => Math.max(0, Math.floor(goods + 1e-9));

/** The points the ticket's reward lines will take, when it is paid. */
export function pointsSpent(items: readonly LineItem[], rewards: readonly Reward[]): number {
  return items.reduce((sum, li) => {
    if (li.rewardId === undefined) return sum;
    const reward = rewards.find((r) => r.id === li.rewardId);
    return sum + (reward === undefined ? 0 : reward.points * li.qty);
  }, 0);
}

/** What a member can still spend on this ticket: their balance, less the rewards already on it. */
export const pointsLeft = (member: Member, items: readonly LineItem[], rewards: readonly Reward[]): number =>
  member.points - pointsSpent(items, rewards);

/** Two letters for a member's avatar. */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
