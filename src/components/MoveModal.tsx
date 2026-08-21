import { usePos } from '../state/store';
import { TABLES } from '../data/demo';
import { linesTotal, money, tableName } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function MoveModal() {
  const s = usePos();
  const t = useT();
  if (!s.moveOpen) return null;
  const openTables = TABLES.filter((tb) => tb.status === 'open' && tb.label !== s.ticket.table);
  // Split on the placeholder so the table keeps its emphasis without cutting
  // the sentence into two half-translatable fragments.
  const [atBefore, atAfter] = t('move.at').split('{table}');

  return (
    <div onClick={s.closeMove} style={css('position:absolute;inset:0;z-index:214;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} className="pos-scroll" style={css('width:100%;max-width:560px;max-height:86%;overflow-y:auto;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:6px;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('move.title')}</div>
          <button className="pos-press" onClick={s.closeMove} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:40px;height:40px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div style={css('font-size:13.5px;color:var(--fg-muted);margin-bottom:18px;')}>
          {atBefore}
          <strong style={css('color:var(--fg);')}>{tableName(s.ticket.table, s.mode)}</strong>
          {atAfter}
        </div>
        <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>{t('move.moveToOpen')}</div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:20px;')}>
          {openTables.map((tb) => (
            <button key={tb.label} className="pos-press" onClick={() => s.doMove(tb.label)} style={css('display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:15px;border-radius:15px;border:1px solid var(--border);background:var(--surface);cursor:pointer;text-align:start;')}>
              <span style={css('font-size:19px;font-weight:800;' + MONO)}>{tb.label}</span>
              <span style={css('font-size:12px;color:var(--fg-muted);')}>{t('common.seatsCount', undefined, tb.seats)}</span>
            </button>
          ))}
        </div>
        {s.held.length > 0 && (
          <>
            <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>{t('move.mergeHeld')}</div>
            <div style={css('display:flex;flex-direction:column;gap:10px;')}>
              {s.held.map((h) => (
                <button key={h.number} className="pos-press" onClick={() => s.doMerge(h.number)} style={css('display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);cursor:pointer;text-align:start;')}>
                  <Icon name="git-merge" size={18} color="var(--accent)" />
                  <span style={css('flex:1;')}>
                    <span style={css('display:block;font-size:15px;font-weight:700;')}>{tableName(h.table, s.mode)} · #{h.number}</span>
                    <span style={css('display:block;font-size:12.5px;color:var(--fg-muted);')}>
                      {t('common.itemsCount', undefined, h.items.reduce((a, x) => a + x.qty, 0))}
                    </span>
                  </span>
                  <span style={css(MONO + 'font-weight:800;')}>{money(linesTotal(h.items))}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
