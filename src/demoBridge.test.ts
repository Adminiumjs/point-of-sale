/**
 * THE DEMO CARD AND THE APP — the declaration the website builds from, and the
 * app's half of the protocol (plan §4.2, §4.4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDemoJson } from '../demo-emit';
import { REGISTRY } from './components/Icon';
import { DEMO_APP_KEY, DEMO_DIR, DEMO_FRAMES, DEMO_MODES, DEMO_SCREENS, DEMO_TOGGLES, type DemoShortcutId } from './demo-card';
import { applyDemoMessage, currentScreen, startDemoBridge } from './demoBridge';
import { demoJsonIssues, type DemoMessage } from './demo-types';
import { useGuests } from './guests/store';
import { MESSAGES } from './i18n/messages';
import { usePos } from './state/store';

const POS = usePos.getState();
const GUESTS = useGuests.getState();
afterEach(() => {
  usePos.setState(POS, true);
  useGuests.setState(GUESTS, true);
  vi.unstubAllGlobals();
});

const doc = () =>
  buildDemoJson({ appKey: DEMO_APP_KEY, dir: DEMO_DIR, frames: DEMO_FRAMES, screens: DEMO_SCREENS, modes: DEMO_MODES, toggles: DEMO_TOGGLES, messages: MESSAGES });
const msg = (m: Record<string, unknown>) => ({ dv: 1, ...m }) as DemoMessage;

describe('demo.json', () => {
  it('passes the website’s own check, with every label in all eight languages', () => {
    expect(demoJsonIssues(doc(), { appKey: 'pos', dir: 'point-of-sale', icons: new Set(Object.keys(REGISTRY)) })).toEqual([]);
  });

  it('offers the till, its tools, the wave-2 screens built so far and the Guests pages, in the comp\'s order', () => {
    expect(doc().screens.map((s) => s.id)).toEqual(['login', 'register', 'floor', 'payment', 'complete', 'kitchen', 'refund', 'shiftclose', 'move', 'discount', 'display', 'loyalty', 'giftcards', 'pickup', 'eod', 'staff', 'menu86', 'reservations', 'book', 'manage', 'email']);
    expect(doc().screens.filter((s) => s.side === 'customer').map((s) => s.id)).toEqual(['book', 'manage', 'email']);
  });

  it('declares exactly the shortcuts the bridge can run', () => {
    const declared = DEMO_SCREENS.flatMap((s) => s.shortcuts ?? []).map((x) => x.id);
    // The type is the bridge's table; every declared id must be one of its keys and vice versa.
    const typed: Record<DemoShortcutId, true> = {
      'autofill-pin': true,
      'empty-ticket': true,
      'reset-ticket': true,
      declined: true,
      'new-order': true,
      'new-reservation': true,
      'prefill-guest': true,
      'restart-booking': true,
      'prefill-code': true,
      'timing-real': true,
      'timing-soon': true,
      'timing-later': true,
      'restart-manage': true,
    };
    expect([...new Set(declared)].sort()).toEqual(Object.keys(typed).sort());
  });
});

describe('what the card asks, the demo does', () => {
  it('goes to a screen, and opens the register’s overlays by name', () => {
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'kitchen' }));
    expect(usePos.getState().view).toBe('kitchen');
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'discount' }));
    expect(usePos.getState().view).toBe('register');
    expect(currentScreen()).toBe('discount');
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'eod' }));
    expect([usePos.getState().view, usePos.getState().discountOpen]).toEqual(['eod', false]);
  });

  it('goes from one of the register’s overlays straight to the other', () => {
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'move' }));
    expect(currentScreen()).toBe('move');
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'discount' }));
    expect(currentScreen()).toBe('discount');
    expect([usePos.getState().moveOpen, usePos.getState().discountOpen]).toEqual([false, true]);
    applyDemoMessage(msg({ type: 'adminium:demo:go', screen: 'move' }));
    expect([usePos.getState().moveOpen, usePos.getState().discountOpen]).toEqual([true, false]);
  });

  it('runs a shortcut, and flips the mode and the connection', () => {
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'declined' }));
    expect(usePos.getState().declined).toBe(true);
    applyDemoMessage(msg({ type: 'adminium:demo:set', mode: 'retail', online: false }));
    expect([usePos.getState().mode, usePos.getState().online]).toEqual(['retail', false]);
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'new-reservation' }));
    expect([usePos.getState().view, usePos.getState().resvNewOpen]).toEqual(['reservations', true]);
  });

  it('moves MR-4829 for the timing shortcuts, and fills Manage with its whole number (F16)', () => {
    const at = () => usePos.getState().reservations.find((r) => r.code === 'MR-4829')!.startsAt;
    const original = at();
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'timing-soon' }));
    expect(at() - Date.now()).toBeGreaterThan(55 * 60_000);
    expect(at() - Date.now()).toBeLessThan(62 * 60_000);
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'timing-later' }));
    expect(at() - Date.now()).toBeGreaterThan(3 * 3_600_000);
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'timing-real' }));
    expect(at()).toBe(original);
    applyDemoMessage(msg({ type: 'adminium:demo:do', shortcut: 'prefill-code' }));
    expect([useGuests.getState().view, useGuests.getState().code, useGuests.getState().findMobile]).toEqual(['manage', 'MR-4829', '(415) 555-0166']);
  });
});

describe('the protocol’s rules (§4.4)', () => {
  const frame = () => {
    const sent: { message: unknown; target: string }[] = [];
    const listeners: ((e: MessageEvent) => void)[] = [];
    const parent = { postMessage: (message: unknown, target: string) => sent.push({ message, target }) };
    vi.stubGlobal('window', {
      parent,
      location: { origin: 'https://adminium.dev', reload: vi.fn() },
      addEventListener: (_type: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });
    const deliver = (data: unknown, origin = 'https://adminium.dev', source: unknown = parent) =>
      listeners.forEach((fn) => fn({ data, origin, source } as MessageEvent));
    return { sent, deliver, parent };
  };

  it('says hello to the page that framed it, at its own origin — never to *', () => {
    const { sent } = frame();
    startDemoBridge();
    expect(sent[0]).toEqual({ message: { type: 'adminium:demo:hello', dv: 1, appKey: 'pos' }, target: 'https://adminium.dev' });
    expect(sent.every((s) => s.target === 'https://adminium.dev')).toBe(true);
  });

  it('takes messages only from its origin, its frame and its version, and answers with its state', () => {
    const { sent, deliver } = frame();
    startDemoBridge();
    deliver({ type: 'adminium:demo:go', dv: 1, screen: 'kitchen' }, 'https://evil.example');
    deliver({ type: 'adminium:demo:go', dv: 1, screen: 'kitchen' }, 'https://adminium.dev', {});
    deliver({ type: 'adminium:demo:go', dv: 2, screen: 'kitchen' });
    expect(usePos.getState().view).toBe('login');
    deliver({ type: 'adminium:demo:go', dv: 1, screen: 'kitchen' });
    expect(usePos.getState().view).toBe('kitchen');
    expect(sent.at(-1)!.message).toMatchObject({ type: 'adminium:demo:state', screen: 'kitchen', mode: 'restaurant', online: true, toggles: { declined: false } });
  });

  it('stays silent when the demo is opened on its own', () => {
    const post = vi.fn();
    const self: Record<string, unknown> = { location: { origin: 'https://adminium.dev' }, addEventListener: vi.fn(), postMessage: post };
    self['parent'] = self;
    vi.stubGlobal('window', self);
    startDemoBridge();
    expect(post).not.toHaveBeenCalled();
  });
});
