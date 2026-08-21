import { usePos, curStaffOf } from '../state/store';
import { BRAND_INITIAL, SHIFT_START } from '../data/demo';
import { dur, tableName } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function TopBar() {
  const s = usePos();
  const t = useT();
  const tk = s.ticket;
  const staff = curStaffOf(s);
  const retail = s.mode === 'retail';
  const title = retail ? t('table.walkIn') : tableName(tk.table, s.mode);
  const open = dur(Date.now() - tk.openedAt);
  const sub = retail
    ? t('topbar.subRetail', { n: tk.number, d: open })
    : tk.table
      ? t('topbar.subSeated', {
          n: tk.number,
          seats: t('common.seatsCount', undefined, tk.seats),
          d: open,
        })
      : t('topbar.subUnassigned', { n: tk.number, d: open });

  const onFloor = () => {
    if (retail) s.showToast(t('toast.retailNoTables'));
    else s.go('floor');
  };

  return (
    <header
      style={css(
        'flex-shrink:0;min-height:74px;display:flex;align-items:center;gap:14px;overflow:hidden;padding:0 18px;background:var(--surface);border-bottom:1px solid var(--border);',
      )}
    >
      <button
        className="pos-press"
        onClick={onFloor}
        aria-label={t('topbar.viewFloor')}
        style={css('display:flex;align-items:center;gap:12px;min-width:0;flex-shrink:1;background:none;border:none;cursor:pointer;padding:8px 10px 8px 6px;border-radius:14px;')}
      >
        <div style={css('width:42px;height:42px;border-radius:13px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;letter-spacing:-.03em;box-shadow:0 3px 10px color-mix(in srgb, var(--accent) 40%, transparent);flex-shrink:0;')}>
          {BRAND_INITIAL}
        </div>
        <div style={css('text-align:start;min-width:0;')}>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;')}>{title}</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-weight:500;white-space:nowrap;')}>{sub}</div>
        </div>
      </button>

      {s.view === 'register' && (
        <div
          className="topbar-search"
          style={css('flex:1;max-width:440px;display:flex;align-items:center;gap:10px;height:50px;padding:0 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;')}
        >
          <Icon name="search" size={19} color="var(--fg-subtle)" />
          <input
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder={t('topbar.searchPlaceholder')}
            aria-label={t('topbar.searchPlaceholder')}
            style={css('flex:1;min-width:0;border:none;background:transparent;outline:none;font-size:16px;font-weight:500;color:var(--fg);')}
          />
          <Icon name="scan-line" size={19} color="var(--fg-subtle)" />
        </div>
      )}
      {s.view === 'floor' && <div style={css('flex:1;')} />}

      <div style={css('display:flex;align-items:center;gap:10px;flex-shrink:0;')}>
        {!s.online && (
          <div style={css('display:flex;align-items:center;gap:8px;height:42px;padding:0 14px;border-radius:12px;background:var(--warn-soft);color:var(--warn);font-size:13px;font-weight:700;')}>
            <Icon name="cloud-off" size={16} />
            <span>{t('topbar.workingOffline')}</span>
          </div>
        )}
        <button
          className="pos-press"
          onClick={s.openHeld}
          style={css('position:relative;display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:14px;font-weight:700;cursor:pointer;')}
        >
          <Icon name="pause" size={16} color="var(--fg-muted)" />
          {t('topbar.held')}
          {s.held.length > 0 && (
            <span style={css('min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--accent);color:var(--accent-fg);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;' + MONO)}>
              {s.held.length}
            </span>
          )}
        </button>
        <div className="topbar-staff" style={css('display:flex;align-items:center;gap:11px;height:48px;padding:0 8px 0 14px;border-radius:13px;background:var(--surface-2);border:1px solid var(--border);')}>
          <div style={css('text-align:end;line-height:1.15;')}>
            <div style={css('font-size:13.5px;font-weight:700;')}>{staff.name}</div>
            <div style={css('font-size:11.5px;color:var(--fg-muted);' + MONO)}>
              {t('topbar.shiftOpen', { d: dur(Date.now() - SHIFT_START) })}
            </div>
          </div>
          <div style={css('width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;')}>
            {staff.initials}
          </div>
        </div>
      </div>
    </header>
  );
}
