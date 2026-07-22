import { usePos } from '../state/store';
import { TABLES, ZONE_ORDER } from '../data/demo';
import type { TableInfo } from '../data/types';
import { money, regTotal } from '../state/calc';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

const badge = (status: string): string => {
  if (status === 'open') return 'font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-subtle);';
  if (status === 'current') return 'font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;background:var(--accent);color:var(--accent-fg);';
  if (status === 'attention') return 'font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;background:var(--danger-soft);color:var(--danger);';
  return 'font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;background:var(--accent-soft);color:var(--accent);';
};

export function Floor() {
  const s = usePos();

  if (s.mode === 'retail') {
    return (
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 22px;background:var(--bg);')}>
        <div style={css('max-width:520px;margin:48px auto;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:40px 32px;box-shadow:var(--shadow);')}>
          <div style={css('width:60px;height:60px;border-radius:17px;margin:0 auto 16px;background:var(--surface-2);border:1px solid var(--border);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="store" size={28} />
          </div>
          <div style={css('font-size:21px;font-weight:800;letter-spacing:-.02em;')}>Retail mode — no floor</div>
          <div style={css('font-size:14.5px;color:var(--fg-muted);margin-top:8px;line-height:1.55;')}>
            In retail mode there are no tables or tickets. Every sale is a straight walk-in: items go on the register and you tender immediately.
          </div>
          <button className="pos-press" onClick={() => s.go('register')} style={css('margin-top:22px;height:58px;padding:0 26px;border-radius:15px;border:none;background:var(--accent);color:var(--accent-fg);font-size:16px;font-weight:800;cursor:pointer;')}>
            Go to register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 22px;background:var(--bg);')}>
      <div style={css('display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px;')}>
        <div style={css('font-size:22px;font-weight:800;letter-spacing:-.02em;')}>Floor</div>
        <div style={css('display:flex;gap:16px;margin-left:auto;flex-wrap:wrap;')}>
          <Legend dot="width:11px;height:11px;border-radius:4px;border:1.5px dashed var(--border-strong);" label="Open" />
          <Legend dot="width:11px;height:11px;border-radius:4px;background:var(--accent);" label="Occupied" />
          <Legend dot="width:11px;height:11px;border-radius:4px;background:var(--danger);" label="Needs attention" />
        </div>
      </div>

      {ZONE_ORDER.map((zn) => {
        const all = TABLES.filter((t) => t.zone === zn);
        const seated = all.filter((t) => t.status !== 'open').length;
        return (
          <div key={zn} style={css('margin-bottom:16px;border:1px solid var(--border);border-radius:20px;background:var(--surface-2);padding:14px 16px 16px;')}>
            <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:12px;')}>
              <span style={css('font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:5px 12px;border-radius:20px;background:var(--surface);border:1px solid var(--border);')}>{zn}</span>
              <span style={css('font-size:12px;font-weight:700;' + MONO + 'color:var(--fg-muted);')}>{seated}/{all.length} seated</span>
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(auto-fill, minmax(172px, 1fr));gap:14px;')}>
              {all.map((t) => (
                <TableTile key={t.label} t={t} total={t.current ? regTotal(s) : t.total || 0} onClick={() => s.openTable(t)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span style={css('display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--fg-muted);')}>
      <span style={css(dot)} />
      {label}
    </span>
  );
}

function TableTile({ t, total, onClick }: { t: TableInfo; total: number; onClick: () => void }) {
  const cur = !!t.current;
  const occ = t.status === 'occupied' || t.status === 'attention';
  const bStatus = cur ? 'current' : t.status;
  const tileBase = 'display:flex;flex-direction:column;text-align:left;padding:15px 15px 16px;border-radius:17px;cursor:pointer;min-height:118px;';
  let tile: string;
  if (cur) tile = tileBase + 'border:2px solid var(--accent);background:var(--surface);box-shadow:var(--shadow);';
  else if (t.status === 'attention') tile = tileBase + 'border:1.5px solid color-mix(in srgb, var(--danger) 45%, transparent);background:var(--surface);box-shadow:var(--shadow);';
  else if (t.status === 'occupied') tile = tileBase + 'border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow);';
  else tile = tileBase + 'border:1.5px dashed var(--border-strong);background:var(--surface-2);';

  const statusLabel = cur ? 'Current' : t.status === 'open' ? 'Open' : t.status === 'attention' ? 'Attention' : 'Occupied';

  return (
    <button className="pos-tile" onClick={onClick} style={css(tile)}>
      <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
        <span style={css('font-size:23px;font-weight:800;' + MONO + 'letter-spacing:-.02em;')}>{t.label}</span>
        <span style={css(badge(bStatus))}>{statusLabel}</span>
      </div>
      <div style={css('display:flex;align-items:center;gap:6px;margin-top:9px;font-size:13px;color:var(--fg-muted);font-weight:600;')}>
        <Icon name="armchair" size={15} />
        {t.seats} seats
      </div>
      {occ && (
        <>
          <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-top:14px;')}>
            <div>
              <div style={css('font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);')}>Open ticket</div>
              <div style={css('font-size:20px;font-weight:800;' + MONO + 'letter-spacing:-.01em;')}>{money(total)}</div>
            </div>
            <div style={css('display:flex;flex-direction:column;align-items:flex-end;gap:7px;')}>
              <span style={css('display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:' + (t.status === 'attention' ? 'var(--danger)' : 'var(--fg-muted)') + ';')}>
                <Icon name="clock" size={13} />
                {t.since != null ? t.since + 'm' : ''}
              </span>
              {t.server && (
                <span style={css('width:26px;height:26px;border-radius:8px;background:var(--surface-3);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;')}>{t.server}</span>
              )}
            </div>
          </div>
          {t.status === 'attention' && t.note && (
            <div style={css('display:flex;align-items:center;gap:6px;margin-top:11px;font-size:12.5px;font-weight:700;color:var(--danger);')}>
              <Icon name="bell-ring" size={14} />
              {t.note}
            </div>
          )}
        </>
      )}
      {t.status === 'open' && (
        <div style={css('margin-top:18px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700;color:var(--fg-muted);')}>
          <Icon name="plus-circle" size={16} />
          Tap to seat
        </div>
      )}
    </button>
  );
}
