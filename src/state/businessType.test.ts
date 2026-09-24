/**
 * A real install opens in the mode its `business_type` setting names, and in
 * the till's default when the setting says nothing it knows.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import manifest from '../../manifest.json';
import { openInBusinessType, serviceModeOf } from './businessType';
import { usePos } from './store';

const INITIAL = usePos.getState();

describe('serviceModeOf', () => {
  it('reads the mode the shop chose', () => {
    expect(serviceModeOf({ business_type: 'retail' })).toBe('retail');
    expect(serviceModeOf({ business_type: 'restaurant', other: 1 })).toBe('restaurant');
  });

  it('says nothing when the setting is missing or not a mode it knows', () => {
    expect(serviceModeOf(null)).toBeNull();
    expect(serviceModeOf(undefined)).toBeNull();
    expect(serviceModeOf({})).toBeNull();
    expect(serviceModeOf({ business_type: null })).toBeNull();
    expect(serviceModeOf({ business_type: 'Retail' })).toBeNull();
    expect(serviceModeOf({ business_type: 'bar' })).toBeNull();
    expect(serviceModeOf({ business_type: ['retail'] })).toBeNull();
  });

  it('knows every value the manifest lets an operator pick', () => {
    const setting = manifest.settings.find((s) => s.key === 'business_type');
    expect(setting?.enum).toBeDefined();
    for (const value of setting!.enum) expect(serviceModeOf({ business_type: value })).toBe(value);
  });
});

describe('the till, started from the setting', () => {
  beforeEach(() => usePos.setState(INITIAL, true));

  it('opens a retail shop in retail, and keeps the default otherwise', () => {
    expect(usePos.getState().mode).toBe('restaurant');
    openInBusinessType({ business_type: 'retail' }, usePos.getState());
    expect(usePos.getState().mode).toBe('retail');

    usePos.setState(INITIAL, true);
    openInBusinessType({ business_type: 'bar' }, usePos.getState());
    expect(usePos.getState().mode).toBe('restaurant');
    openInBusinessType(null, usePos.getState());
    expect(usePos.getState().mode).toBe('restaurant');
  });
});
