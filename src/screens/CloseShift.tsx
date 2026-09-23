import { usePos, curStaffOf, expectedDrawer } from '../state/store';
import { dur, money, round2 } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { MONO } from '../components/AuxHeader';
import { css } from '../components/css';

const card = 'flex:1;min-width:280px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px;box-shadow:var(--shadow);';
const countBtn = 'flex:1;height:50px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface-2);font-size:15px;font-weight:800;cursor:pointer;color:var(--fg);';

/** Close shift (comp 504-537): the takings, the drawer count, over/short, sign out. */
export function CloseShift() {
  const s = usePos();
  const t = useT();
  const sh = s.shiftTotals;
  const expected = expectedDrawer(s);
  const over = round2(s.closeCount - expected);
  const balanced = Math.abs(over) < 0.005;
  const tone = balanced ? 'var(--fg-muted)' : over > 0 ? 'var(--pos)' : 'var(--danger)';
  const rows = [
    { label: t('common.card'), v: money(sh.card), ic: 'credit-card' },
    { label: t('common.cash'), v: money(sh.cash), ic: 'banknote' },
    { label: t('shift.qr'), v: money(sh.qr), ic: 'qr-code' },
    { label: t('shift.tips'), v: money(sh.tips), ic: 'hand-coins' },
    { label: t('shift.refunds'), v: '−' + money(sh.refunds), ic: 'undo-2' },
    { label: t('shift.comps'), v: '−' + money(sh.comps), ic: 'gift' },
  ];
  const adj = [
    { v: -5, label: '−' + money(5) },
    { v: -1, label: '−' + money(1) },
    { v: 1, label: '+' + money(1) },
    { v: 5, label: '+' + money(5) },
  ];

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;background:var(--bg);')}>
      <div style={css('max-width:760px;margin:0 auto;padding:30px 24px 40px;')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:22px;')}>
          <div style={css('width:44px;height:44px;border-radius:12px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;flex-shrink:0;')}>
            <Icon name="lock-keyhole" size={22} />
          </div>
          <div style={css('min-width:0;')}>
            <h1 style={css('margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;')}>{t('shift.title')}</h1>
            <div style={css('font-size:13px;color:var(--fg-muted);')}>
              {t('shift.sub', { staff: curStaffOf(s).name, d: dur(Date.now() - s.shiftStart), orders: t('shift.orders', undefined, sh.orders) })}
            </div>
          </div>
          <button className="pos-press" onClick={() => usePos.setState({ view: 'register' })} style={css('margin-inline-start:auto;height:46px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;')}>
            {t('common.cancel')}
          </button>
        </div>
        <div style={css('display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;')}>
          <div style={css(card)}>
            <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:4px;')}>{t('shift.gross')}</div>
            <div style={css('font-size:40px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px;' + MONO)}>{money(sh.gross)}</div>
            {rows.map((r) => (
              <div key={r.ic} style={css('display:flex;align-items:center;gap:11px;padding:11px 0;border-top:1px solid var(--border);')}>
                <Icon name={r.ic} size={17} color="var(--fg-muted)" />
                <span style={css('font-size:14px;font-weight:600;')}>{r.label}</span>
                <span style={css('margin-inline-start:auto;font-weight:700;' + MONO)}>{r.v}</span>
              </div>
            ))}
          </div>
          <div style={css(card)}>
            <div style={css('font-size:16px;font-weight:800;margin-bottom:16px;display:flex;align-items:center;gap:9px;')}>
              <Icon name="calculator" size={19} color="var(--accent)" />
              {t('shift.countDrawer')}
            </div>
            <Row label={t('shift.openingFloat')} value={money(s.drawer)} />
            <Row label={t('shift.cashSales')} value={money(sh.cash)} />
            {sh.cashRefunds > 0 && <Row label={t('shift.cashRefunds')} value={'−' + money(sh.cashRefunds)} />}
            <div style={css('display:flex;justify-content:space-between;font-size:13.5px;padding-bottom:14px;border-bottom:1px dashed var(--border-strong);margin-bottom:16px;')}>
              <span style={css('color:var(--fg-muted);font-weight:600;')}>{t('shift.expected')}</span>
              <span style={css('font-weight:800;' + MONO)}>{money(expected)}</span>
            </div>
            <div style={css('text-align:center;margin-bottom:12px;')}>
              <div style={css('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);')}>{t('shift.counted')}</div>
              <div aria-live="polite" style={css('font-size:40px;font-weight:800;letter-spacing:-.02em;' + MONO)}>{money(s.closeCount)}</div>
            </div>
            <div style={css('display:flex;gap:8px;margin-bottom:16px;')}>
              {adj.map((a) => (
                <button key={a.v} className="pos-press" onClick={() => s.closeCountAdj(a.v)} style={css(countBtn)}>
                  {a.label}
                </button>
              ))}
            </div>
            <div
              style={css(
                'display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:15px;background:' +
                  (balanced ? 'var(--surface-2)' : over > 0 ? 'var(--pos-soft)' : 'var(--danger-soft)') +
                  ';',
              )}
            >
              <span style={css('font-size:14px;font-weight:800;color:' + tone + ';')}>{t(balanced ? 'shift.balanced' : over > 0 ? 'shift.over' : 'shift.short')}</span>
              <span style={css('font-size:20px;font-weight:800;color:' + tone + ';' + MONO)}>{(over > 0 ? '+' : over < 0 ? '−' : '') + money(Math.abs(over))}</span>
            </div>
            <button className="pos-press" onClick={() => void s.finishShift()} style={css('width:100%;height:64px;margin-top:16px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;')}>
              <Icon name="lock" size={20} />
              {t('shift.finish')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={css('display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:8px;')}>
      <span style={css('color:var(--fg-muted);font-weight:600;')}>{label}</span>
      <span style={css('font-weight:700;' + MONO)}>{value}</span>
    </div>
  );
}
