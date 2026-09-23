/**
 * The website's check of a `demo.json`, and the protocol's message guard.
 */
import { describe, expect, it } from 'vitest';

import { DEMO_LOCALES, demoJsonIssues, isDemoMessage } from './demo-types.ts';

const all = (text: string) => Object.fromEntries(DEMO_LOCALES.map((l) => [l, text]));
const GOOD = {
  v: 1,
  appKey: 'pos',
  base: '/demo/point-of-sale/app/',
  frames: ['tablet', 'phone'],
  screens: [{ id: 'till', view: 'register', icon: 'receipt', labels: all('Till'), shortcuts: [{ id: 'pay', icon: 'credit-card', labels: all('Pay') }] }],
  addOns: [{ key: 'receipts', labels: all('Receipts') }],
};
const CTX = { appKey: 'pos', dir: 'point-of-sale', addOnKeys: new Set(['receipts']) };

describe('demoJsonIssues', () => {
  it('accepts a manifest the card can show', () => {
    expect(demoJsonIssues(GOOD, CTX)).toEqual([]);
  });

  it('names every problem the website fails its build on', () => {
    const bad = {
      ...GOOD,
      v: 2,
      appKey: 'point-of-sale',
      base: '/demo/point-of-sale/',
      frames: ['watch'],
      screens: [
        { id: 'till', view: 'register', icon: 'Receipt', labels: { 'en-US': 'Till' } },
        { id: 'till', view: 'floor', icon: 'layout-grid', labels: all('Floor'), persona: 'host' },
      ],
      addOns: [{ key: 'loyalty', labels: all('Loyalty') }],
    };
    expect(demoJsonIssues(bad, CTX)).toEqual([
      'v is 2, not 1',
      'appKey is "point-of-sale", but /demo/point-of-sale/ belongs to "pos"',
      'base is "/demo/point-of-sale/", not "/demo/point-of-sale/app/"',
      'frames: "watch" is not a frame',
      'screens: "till" is used twice',
      'screens.till: "Receipt" is not an icon name',
      'screens.till: no label in ar-EG, cs-CZ, da-DK, de-DE, fr-FR, zh-CN, zh-TW',
      'screens.till: persona "host" is not declared',
      'addOns: "loyalty" is not an add-on the marketplace knows',
    ]);
  });

  it('checks icons against the card’s set when it is given', () => {
    expect(demoJsonIssues(GOOD, { ...CTX, icons: new Set(['receipt']) })).toEqual(['screens.till.pay: no icon "credit-card"']);
  });
});

describe('isDemoMessage', () => {
  it('takes only this protocol’s messages, at this version', () => {
    expect(isDemoMessage({ type: 'adminium:demo:hello', dv: 1, appKey: 'pos' })).toBe(true);
    expect(isDemoMessage({ type: 'adminium:demo:hello', dv: 2, appKey: 'pos' })).toBe(false);
    expect(isDemoMessage({ type: 'adminium:embed:hello', dv: 1 })).toBe(false);
    expect(isDemoMessage('adminium:demo:reset')).toBe(false);
  });
});
