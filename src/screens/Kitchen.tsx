import { usePos } from '../state/store';
import { BRAND } from '../data/demo';
import type { KdsStatus } from '../data/types';
import { mins, tableName } from '../state/calc';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

const COLS: { k: KdsStatus; l: string; ic: string; col: string }[] = [
  { k: 'new', l: 'New', ic: 'inbox', col: 'var(--accent)' },
  { k: 'cooking', l: 'In progress', ic: 'flame', col: 'var(--warn)' },
  { k: 'ready', l: 'Ready', ic: 'check-check', col: 'var(--pos)' },
];

export function Kitchen() {
  const s = usePos();

  const agg: Record<string, number> = {};
  s.kds.forEach((o) => o.items.forEach((it) => (agg[it.n] = (agg[it.n] || 0) + it.q)));
  const allDay = Object.keys(agg)
    .map((n) => ({ n, q: agg[n] }))
    .sort((a, b) => b.q - a.q)
    .slice(0, 7);

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface-2);')}>
      <header style={css('flex-shrink:0;display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--border);')}>
        <div style={css('width:40px;height:40px;border-radius:12px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;')}>
          <Icon name="cooking-pot" size={21} />
        </div>
        <div>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;')}>Kitchen display</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);')}>{BRAND} · live order tickets</div>
        </div>
        <button className="pos-press" onClick={() => usePos.setState({ view: 'register' })} style={css('margin-left:auto;height:46px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;')}>
          <Icon name="arrow-left" size={17} />
          Register
        </button>
      </header>

      <div className="pos-scroll" style={css('flex-shrink:0;display:flex;align-items:center;gap:9px;padding:11px 16px;overflow-x:auto;background:var(--surface);border-bottom:1px solid var(--border);')}>
        <span style={css('font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);flex-shrink:0;')}>All day</span>
        {allDay.map((a) => (
          <span key={a.n} style={css('display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:6px 12px;border-radius:11px;background:var(--surface-2);border:1px solid var(--border);font-size:13px;font-weight:700;')}>
            <span style={css('font-weight:800;color:var(--accent);' + MONO)}>{a.q}×</span>
            {a.n}
          </span>
        ))}
      </div>

      <div className="kds-board">
        {COLS.map((c) => {
          const cards = s.kds.filter((o) => o.status === c.k);
          return (
            <div key={c.k} className="kds-col">
              <div style={css('flex-shrink:0;display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid var(--border);')}>
                <Icon name={c.ic} size={18} color={c.col} />
                <span style={css('font-size:15px;font-weight:800;')}>{c.l}</span>
                <span style={css('margin-left:auto;font-size:12.5px;font-weight:800;' + MONO + 'padding:2px 9px;border-radius:20px;background:var(--surface-3);color:var(--fg-muted);')}>{cards.length}</span>
              </div>
              <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:11px;')}>
                {cards.map((o) => {
                  const age = mins(o.at);
                  const urgent = age >= 7;
                  return (
                    <div key={o.number} style={css('background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;box-shadow:var(--shadow);')}>
                      <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:11px;')}>
                        <span style={css('font-size:16px;font-weight:800;')}>{tableName(o.table, s.mode)}</span>
                        <span style={css('font-size:12px;' + MONO + 'color:var(--fg-muted);')}>#{o.number}</span>
                        <span style={css('display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:20px;background:' + (urgent ? 'var(--danger-soft)' : 'var(--surface-3)') + ';color:' + (urgent ? 'var(--danger)' : 'var(--fg-muted)') + ';')}>
                          <Icon name="clock" size={12} />
                          {age}m
                        </span>
                      </div>
                      <div style={css('display:flex;flex-direction:column;gap:8px;margin-bottom:13px;')}>
                        {o.items.map((it, i) => (
                          <div key={i} style={css('display:flex;gap:9px;font-size:14.5px;')}>
                            <span style={css('font-weight:800;' + MONO + 'flex-shrink:0;')}>{it.q}×</span>
                            <span>
                              <span style={css('font-weight:700;')}>{it.n}</span>
                              {!!it.m && <span style={css('display:block;font-size:12px;color:var(--warn);font-weight:700;margin-top:1px;')}>{it.m}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button className="pos-press" onClick={() => s.bumpK(o.number)} style={css('width:100%;height:48px;border-radius:12px;border:none;background:' + (c.k === 'ready' ? 'var(--pos)' : 'var(--accent)') + ';color:' + (c.k === 'ready' ? 'var(--pos-fg)' : 'var(--accent-fg)') + ';font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
                        <Icon name={c.k === 'ready' ? 'check' : 'arrow-right'} size={17} />
                        {c.k === 'ready' ? 'Clear ticket' : 'Bump'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
