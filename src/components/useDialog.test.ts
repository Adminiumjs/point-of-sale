import { describe, expect, it } from 'vitest';

import { nextStop } from './useDialog';

describe('Tab inside a dialog', () => {
  it('goes on to the next stop, and from the last back to the first — never out to what is behind', () => {
    expect([nextStop(0, 3, false), nextStop(1, 3, false), nextStop(2, 3, false)]).toEqual([1, 2, 0]);
  });
  it('goes back with Shift, and from the first to the last', () => {
    expect([nextStop(2, 3, true), nextStop(1, 3, true), nextStop(0, 3, true)]).toEqual([1, 0, 2]);
  });
  it('from outside (focus on the dialog itself, or behind it) lands inside', () => {
    expect([nextStop(-1, 3, false), nextStop(-1, 3, true)]).toEqual([0, 2]);
  });
  it('with nothing to stop at stays on the dialog', () => {
    expect(nextStop(-1, 0, false)).toBe(-1);
  });
});
