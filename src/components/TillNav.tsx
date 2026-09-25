import { useEffect, useRef, useState } from 'react';
import { usePos } from '../state/store';
import type { View } from '../data/types';
import type { Features } from '../features';
import { useT, type MessageKey } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

/** The screens a shift moves between. */
const SCREENS: { v: View; label: MessageKey; icon: string }[] = [
  { v: 'register', label: 'nav.register', icon: 'layout-grid' },
  { v: 'floor', label: 'nav.floor', icon: 'grid-3x3' },
  { v: 'kitchen', label: 'nav.kitchen', icon: 'cooking-pot' },
  { v: 'reservations', label: 'nav.reservations', icon: 'calendar-days' },
  { v: 'pickup', label: 'nav.pickup', icon: 'bell-ring' },
];

/** The till's tools, in the menu. */
const TOOLS: { v: View; label: MessageKey; icon: string }[] = [
  { v: 'display', label: 'nav.display', icon: 'monitor' },
  { v: 'loyalty', label: 'nav.loyalty', icon: 'award' },
  { v: 'giftcards', label: 'nav.giftCards', icon: 'gift' },
  { v: 'refund', label: 'nav.refund', icon: 'undo-2' },
  { v: 'shiftclose', label: 'nav.closeShift', icon: 'lock-keyhole' },
  { v: 'eod', label: 'nav.endOfDay', icon: 'chart-column' },
  { v: 'staff', label: 'nav.staff', icon: 'users' },
  { v: 'menu86', label: 'nav.menu86', icon: 'ban' },
  // A retail shop's shelf labels, while Barcode Labels is attached (features.ts).
  { v: 'labels', label: 'nav.labels', icon: 'tag' },
];

/** The tools this till offers: shelf labels only in retail, and only while Barcode Labels is attached. */
export const toolsFor = (retail: boolean, features: Features) => TOOLS.filter((x) => x.v !== 'labels' || (retail && features['shelf-labels']));

const seg = (on: boolean) =>
  'width:44px;height:40px;border-radius:10px;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;background:' +
  (on ? 'var(--surface)' : 'transparent') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg-muted)') +
  ';' +
  (on ? 'box-shadow:var(--shadow);' : '');

/**
 * The till's own navigation (F1). The comp reaches its other screens only from
 * the demo card, so a real till — opened on its own, with no dashboard around
 * it — needs a way there: a compact switcher for the screens a shift moves
 * between, and a menu for the tools. Both are made from the top bar's own
 * pieces. On a phone the switcher folds into the menu.
 */
export function TillNav() {
  const s = usePos();
  const t = useT();
  const [open, setOpen] = useState(false);
  // The top bar clips what overflows it, so the menu is placed on the page, under its button.
  const [at, setAt] = useState<{ top: number; left: number; right: number }>({ top: 0, left: 0, right: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const retail = s.mode === 'retail';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current !== null && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter((el) => el.offsetParent !== null);
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
        next?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // The first item takes focus, as a menu's should.
    [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find((el) => el.offsetParent !== null)?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (v: View) => {
    setOpen(false);
    if (v === 'floor' && retail) {
      s.showToast(t('toast.retailNoTables'));
      return;
    }
    s.go(v);
  };

  const item = (x: { v: View; label: MessageKey; icon: string }, cls = '') => (
    <button key={x.v} role="menuitem" className={'pos-press nav-menu-item ' + cls} onClick={() => go(x.v)} style={css('display:flex;align-items:center;gap:11px;width:100%;height:46px;padding:0 14px;border:none;border-radius:11px;background:transparent;color:var(--fg);font-size:14.5px;font-weight:700;cursor:pointer;text-align:start;font-family:inherit;')}>
      <Icon name={x.icon} size={18} color="var(--fg-muted)" />
      {t(x.label)}
    </button>
  );

  return (
    <div ref={wrap} style={css('position:relative;display:flex;align-items:center;gap:8px;flex-shrink:0;')}>
      <nav className="till-switcher" aria-label={t('nav.screens')} style={css('display:flex;gap:2px;padding:3px;border-radius:13px;background:var(--surface-3);')}>
        {SCREENS.map((x) => {
          const on = s.view === x.v;
          return (
            <button key={x.v} className="pos-press" aria-label={t(x.label)} title={t(x.label)} aria-current={on ? 'page' : undefined} onClick={() => go(x.v)} style={css(seg(on))}>
              <Icon name={x.icon} size={18} />
            </button>
          );
        })}
      </nav>
      <button
        ref={button}
        className="pos-press"
        aria-label={t('nav.more')}
        title={t('nav.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          if (r !== undefined) setAt({ top: r.bottom + 8, left: r.left, right: window.innerWidth - r.right });
          setOpen((v) => !v);
        }}
        style={css('width:48px;height:48px;border-radius:13px;border:1px solid var(--border-strong);background:' + (open ? 'var(--surface-2)' : 'var(--surface)') + ';color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;')}
      >
        <Icon name="menu" size={20} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('nav.more')}
          style={{
            ...css('position:fixed;z-index:230;min-width:232px;max-height:calc(100vh - 90px);overflow-y:auto;padding:6px;border-radius:16px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-lg);'),
            top: at.top,
            // Under the button, lined up with its far edge — the left one when the page reads right to left.
            ...(document.documentElement.dir === 'rtl' ? { left: at.left } : { right: at.right }),
          }}
        >
          {/* The switcher's screens, where the switcher itself does not fit. */}
          <div className="nav-menu-screens">
            {SCREENS.map((x) => item(x))}
            <div role="separator" style={css('height:1px;margin:6px 8px;background:var(--border);')} />
          </div>
          {toolsFor(retail, s.features).map((x) => item(x))}
        </div>
      )}
    </div>
  );
}
