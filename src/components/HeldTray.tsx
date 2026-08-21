import { usePos } from '../state/store';
import { dur, itemById, linesTotal, money, tableName } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function HeldTray() {
  const s = usePos();
  const t = useT();
  if (!s.heldOpen) return null;

  return (
    <>
      <div onClick={s.closeHeld} style={css('position:absolute;inset:0;z-index:210;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div className="pos-drawer">
        <div style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:20px 22px;border-bottom:1px solid var(--border);')}>
          <div style={css('font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{t('held.title')}</div>
          <span style={css('font-size:13px;font-weight:800;' + MONO + 'padding:3px 10px;border-radius:20px;background:var(--surface-3);color:var(--fg-muted);')}>{s.held.length}</span>
          <button className="pos-press" onClick={s.closeHeld} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;')}>
          {s.held.length === 0 && (
            <div style={css('text-align:center;padding:50px 20px;color:var(--fg-muted);')}>
              <div style={css('font-size:15px;font-weight:700;')}>{t('held.empty')}</div>
              <div style={css('font-size:13px;margin-top:5px;')}>{t('held.emptyHint')}</div>
            </div>
          )}
          {s.held.map((h) => {
            const names = h.items.map((x) => (x.qty > 1 ? x.qty + '× ' : '') + (itemById(x.id)?.name ?? x.id));
            return (
              <div key={h.number} style={css('border:1px solid var(--border);border-radius:16px;padding:16px;background:var(--surface);')}>
                <div style={css('display:flex;align-items:center;gap:10px;')}>
                  <span style={css('font-size:16px;font-weight:800;')}>{tableName(h.table, s.mode)}</span>
                  <span style={css('font-size:12.5px;' + MONO + 'color:var(--fg-muted);')}>#{h.number}</span>
                  <span style={css('margin-inline-start:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--fg-muted);')}>
                    <Icon name="clock" size={13} />
                    {t('held.for', { d: dur(Date.now() - h.at) })}
                  </span>
                </div>
                <div style={css('font-size:13px;color:var(--fg-muted);margin-top:8px;')}>{names.join(', ')}</div>
                <div style={css('display:flex;align-items:center;justify-content:space-between;margin-top:14px;')}>
                  <span style={css('font-size:22px;font-weight:800;' + MONO)}>{money(linesTotal(h.items))}</span>
                  <button className="pos-press" onClick={() => s.resumeHeld(h.number)} style={css('height:48px;padding:0 22px;border-radius:13px;border:none;background:var(--accent);color:var(--accent-fg);font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;')}>
                    <Icon name="corner-down-left" size={17} />
                    {t('held.resume')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
