// The cart-line identity function.
//
// Lives in its own module so that both the seed data (demo.ts) and the pricing
// helpers (state/calc.ts) can derive keys from the SAME code. It used to live in
// calc.ts alone, and demo.ts hand-wrote its line keys as string literals — five
// of the eight had drifted a field, so a seeded line could never be merged into
// by the register.

import type { Selection } from './types';

/**
 * A canonical string for a selection: groups and the options within each are
 * sorted, so the order a cashier tapped them in is not part of what was
 * ordered (the rule Online ordering's cart uses).
 */
export function selectionKey(selection: Selection): string {
  return Object.keys(selection)
    .filter((group) => (selection[group] ?? []).length > 0)
    .sort()
    .map((group) => `${group}:${[...(selection[group] ?? [])].sort().join('+')}`)
    .join(';');
}

/**
 * A line's identity: the item, what was chosen, its note and its seat — and,
 * for a free line a member's points paid for, the reward, so it never merges
 * with the same item bought.
 */
export function keyOf(id: string, selection: Selection = {}, note?: string, seat?: number, rewardId?: string): string {
  const parts = [id, selectionKey(selection), note ? 'n:' + note : '', seat ? 's' + seat : ''];
  if (rewardId) parts.push('r:' + rewardId);
  return parts.join('|');
}
