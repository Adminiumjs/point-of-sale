// The cart-line identity function.
//
// Lives in its own module so that both the seed data (demo.ts) and the pricing
// helpers (state/calc.ts) can derive keys from the SAME code. It used to live in
// calc.ts alone, and demo.ts hand-wrote its line keys as string literals — five
// of the eight had drifted a field, so a seeded line could never be merged into
// by the register.

import type { Size } from './types';

/**
 * A line's identity: two lines merge if and only if this string matches.
 *
 * Every field is delimited, so a value that happens to look like the next
 * field's content cannot shift the meaning of the key. `extras` is sorted so
 * that the same set chosen in a different order is the same line.
 */
export function keyOf(
  id: string,
  size?: Size | null,
  milk?: string | null,
  extras?: string[],
  note?: string,
  seat?: number,
): string {
  return [
    id,
    size || '',
    milk || '',
    (extras || []).slice().sort().join('+'),
    note ? 'n:' + note : '',
    seat ? 's' + seat : '',
  ].join('|');
}
