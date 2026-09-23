import { usePos, curStaffOf } from '../state/store';
import { money } from '../state/calc';
import { DEMO } from '../surface';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { MONO } from '../components/AuxHeader';
import { printOnly } from '../components/print';
import { css } from '../components/css';

/**
 * End-of-day report (comp 768-783): the shift's takings as one list.
 *
 * "Print report" prints this page. "Email owner" is drawn in the comp but has
 * nothing behind it — there is no report e-mail — so, like the receipt's Email
 * and Text (DP30), it is shown in the demo only.
 */
export function EndOfDay() {
  const s = usePos();
  const t = useT();
  const sh = s.shiftTotals;
  const rows = [
    { l: t('shift.gross'), v: money(sh.gross) },
    { l: t('common.card'), v: money(sh.card) },
    { l: t('common.cash'), v: money(sh.cash) },
    { l: t('shift.qr'), v: money(sh.qr) },
    // Paid from gift cards: sold earlier, so not money taken today.
    ...(sh.gift > 0 ? [{ l: t('gift.method'), v: money(sh.gift) }] : []),
    { l: t('eod.tips'), v: money(sh.tips) },
    { l: t('shift.refunds'), v: '−' + money(sh.refunds) },
    { l: t('shift.comps'), v: '−' + money(sh.comps) },
    { l: t('eod.orders'), v: String(sh.orders) },
    { l: t('eod.avgTicket'), v: money(sh.orders > 0 ? sh.gross / sh.orders : 0) },
  ];
  const btn = 'flex:1;height:58px;border-radius:15px;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;';

  return (
    <div className="pos-scroll print-report" style={css('flex:1;min-height:0;overflow-y:auto;background:var(--bg);')}>
      <div style={css('max-width:620px;margin:0 auto;padding:30px 24px 40px;')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:22px;')}>
          <div style={css('width:44px;height:44px;border-radius:12px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;flex-shrink:0;')}>
            <Icon name="chart-column" size={22} />
          </div>
          <div style={css('min-width:0;')}>
            <h1 style={css('margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;')}>{t('eod.title')}</h1>
            <div style={css('font-size:13px;color:var(--fg-muted);')}>{t('eod.sub', { staff: curStaffOf(s).name })}</div>
          </div>
          <button className="pos-press no-print" onClick={() => usePos.setState({ view: 'register' })} style={css('margin-inline-start:auto;height:46px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;')}>
            {t('common.close')}
          </button>
        </div>
        <dl style={css('margin:0;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:10px 22px;box-shadow:var(--shadow);')}>
          {rows.map((r, i) => (
            <div key={r.l} style={css('display:flex;align-items:center;justify-content:space-between;padding:14px 0;' + (i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''))}>
              <dt style={css('font-size:14.5px;font-weight:600;color:var(--fg-muted);')}>{r.l}</dt>
              <dd style={css('margin:0;font-size:16px;font-weight:800;' + MONO)}>{r.v}</dd>
            </div>
          ))}
        </dl>
        <div className="no-print" style={css('display:flex;gap:10px;margin-top:16px;')}>
          <button className="pos-press" onClick={() => printOnly('report')} style={css(btn + 'border:none;background:var(--accent);color:var(--accent-fg);')}>
            <Icon name="printer" size={18} />
            {t('eod.print')}
          </button>
          {DEMO && (
            <button className="pos-press" onClick={() => s.showToast(t('eod.toastEmailed'), 'success')} style={css(btn + 'border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);')}>
              <Icon name="mail" size={18} />
              {t('eod.email')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
