// "Demo controls" dock — the demo's navigation chrome (screen switcher, a
// contextual demo action, restaurant/retail toggle, language, online/offline,
// theme). It is comp-only chrome, not part of the product UI. The fixed-canvas
// device frame from the comp is intentionally dropped in favour of responsive
// layout.

import { usePos } from '../state/store';
import type { View } from '../data/types';
import { LOCALES, LOCALE_TAGS, useI18n, type LocaleTag, type MessageKey } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const SCREENS: { v: View; label: MessageKey; icon: string }[] = [
  { v: 'login', label: 'dock.screen.login', icon: 'lock' },
  { v: 'register', label: 'dock.screen.register', icon: 'layout-grid' },
  { v: 'floor', label: 'dock.screen.floor', icon: 'grid-3x3' },
  { v: 'payment', label: 'dock.screen.payment', icon: 'credit-card' },
  { v: 'complete', label: 'dock.screen.complete', icon: 'receipt' },
  { v: 'kitchen', label: 'dock.screen.kitchen', icon: 'cooking-pot' },
];

const chip = (active: boolean): string =>
  active
    ? 'display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:9px;border:none;background:var(--surface);color:var(--fg);font-size:13px;font-weight:700;cursor:pointer;box-shadow:var(--shadow);'
    : 'display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:9px;border:none;background:transparent;color:var(--fg-muted);font-size:13px;font-weight:600;cursor:pointer;';

const seg = (on: boolean): string =>
  on
    ? 'padding:7px 13px;border-radius:8px;border:none;background:var(--accent);color:var(--accent-fg);font-size:12.5px;font-weight:700;cursor:pointer;'
    : 'padding:7px 13px;border-radius:8px;border:none;background:transparent;color:var(--fg-muted);font-size:12.5px;font-weight:600;cursor:pointer;';

const actionStyle =
  'display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;';

export function DemoDock() {
  const s = usePos();
  const { t, locale, setLocale } = useI18n();

  const actions: { label: string; icon: string; onClick: () => void }[] = [];
  if (s.view === 'register') {
    actions.push({ label: t('dock.emptyTicket'), icon: 'eraser', onClick: s.emptyTicket });
    actions.push({ label: t('dock.resetTicket'), icon: 'rotate-ccw', onClick: s.resetTicket });
  } else if (s.view === 'payment') {
    actions.push({
      label: t(s.declined ? 'dock.cardWillDecline' : 'dock.cardWillApprove'),
      icon: s.declined ? 'x-circle' : 'check-circle',
      onClick: s.toggleDeclined,
    });
  } else if (s.view === 'complete') {
    actions.push({ label: t('dock.newOrder'), icon: 'plus', onClick: s.newOrder });
  } else if (s.view === 'login') {
    actions.push({ label: t('dock.autofillPin'), icon: 'wand-2', onClick: s.autofillPin });
  } else if (s.view === 'floor') {
    actions.push({
      label: t(s.online ? 'dock.goOffline' : 'dock.goOnline'),
      icon: s.online ? 'cloud-off' : 'cloud',
      onClick: s.toggleOnline,
    });
  }

  return (
    <div className="pos-dock-wrap">
      <div
        className="pos-scroll"
        style={css(
          'width:100%;max-width:1360px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 8px 8px 14px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);',
        )}
      >
        <span
          style={css(
            'display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-subtle);padding-inline-end:4px;',
          )}
        >
          <Icon name="app-window" size={14} />
          {t('dock.title')}
        </span>

        <div style={css('display:flex;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;padding:4px;flex-wrap:wrap;')}>
          {SCREENS.map((sc) => (
            <button key={sc.v} className="pos-press" onClick={() => s.go(sc.v)} style={css(chip(s.view === sc.v))}>
              <Icon name={sc.icon} size={15} />
              {t(sc.label)}
            </button>
          ))}
        </div>

        <div style={css('width:1px;height:24px;background:var(--border);margin:0 2px;')} />

        {actions.map((a) => (
          <button key={a.label} className="pos-press" onClick={a.onClick} style={css(actionStyle)}>
            <Icon name={a.icon} size={14} />
            {a.label}
          </button>
        ))}

        <div style={css('margin-inline-start:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
          <div style={css('display:flex;gap:3px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:3px;')}>
            <button className="pos-press" onClick={() => s.setMode('restaurant')} style={css(seg(s.mode === 'restaurant'))}>
              {t('dock.restaurant')}
            </button>
            <button className="pos-press" onClick={() => s.setMode('retail')} style={css(seg(s.mode === 'retail'))}>
              {t('dock.retail')}
            </button>
          </div>

          {/* Languages are listed in their own script — a reader looking for
              their language cannot be expected to recognise its English name. */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as LocaleTag)}
            aria-label={t('dock.language')}
            title={t('dock.language')}
            style={css(
              'height:38px;padding:0 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;',
            )}
          >
            {LOCALE_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {LOCALES[tag].native}
              </option>
            ))}
          </select>

          <button
            className="pos-press"
            onClick={s.toggleOnline}
            title={t('dock.toggleConnectivity')}
            aria-label={t('dock.toggleConnectivity')}
            style={css(
              'width:38px;height:38px;border-radius:10px;border:1px solid ' +
                (s.online ? 'var(--border)' : 'color-mix(in srgb, var(--warn) 40%, transparent)') +
                ';background:' +
                (s.online ? 'var(--surface-2)' : 'var(--warn-soft)') +
                ';color:' +
                (s.online ? 'var(--fg-muted)' : 'var(--warn)') +
                ';display:flex;align-items:center;justify-content:center;cursor:pointer;',
            )}
          >
            <Icon name={s.online ? 'wifi' : 'wifi-off'} size={16} />
          </button>

          <button
            className="pos-press"
            onClick={s.toggleTheme}
            title={t('dock.toggleTheme')}
            aria-label={t('dock.toggleTheme')}
            style={css(
              'width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;',
            )}
          >
            <Icon name={s.theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
