import { usePos, curStaffOf } from '../state/store';
import { BRAND } from '../data/demo';
import { demoSale, money, tableName } from '../state/calc';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function Complete() {
  const s = usePos();
  const { t, date } = useI18n();
  const sale = s.lastSale || demoSale(s.ticket, curStaffOf(s).name);

  const methods: string[] = [];
  sale.splits.forEach((sp) => {
    const l = t(sp.method === 'cash' ? 'common.cash' : sp.method === 'card' ? 'common.card' : 'payment.qr');
    if (methods.indexOf(l) < 0) methods.push(l);
  });
  /*
   * The clock is `Intl`'s, not a hand-rolled 12-hour split: whether this reads
   * "2:41 PM" or "14:41" is the locale's call, and half the world does not
   * write AM/PM at all.
   */
  const at = date(sale.at, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;background:var(--bg);')}>
      <div style={css('max-width:860px;margin:0 auto;padding:34px 24px 40px;')}>
        <div style={css('text-align:center;margin-bottom:28px;')}>
          <div style={css('width:76px;height:76px;border-radius:22px;margin:0 auto;background:var(--pos-soft);color:var(--pos);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="check-circle-2" size={42} />
          </div>
          <div style={css('font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:16px;')}>{t('complete.title')}</div>
          <div style={css('font-size:14.5px;color:var(--fg-muted);margin-top:5px;')}>
            {t('complete.subtitle', { n: sale.number, table: tableName(sale.table, s.mode), time: at })}
          </div>
          <div style={css('font-size:48px;font-weight:800;' + MONO + 'letter-spacing:-.02em;margin-top:14px;')}>{money(sale.total)}</div>
          {sale.change > 0 && (
            <div style={css('display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:9px 17px;border-radius:20px;background:var(--pos-soft);color:var(--pos);font-size:15px;font-weight:800;')}>
              {t('payment.changeDue')}<span style={css(MONO)}>{money(sale.change)}</span>
            </div>
          )}
        </div>

        <div style={css('display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;justify-content:center;')}>
          <div style={css('flex:1;min-width:280px;display:flex;justify-content:center;')}>
            <div style={css('width:300px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 22px 24px;box-shadow:var(--shadow-lg);')}>
              <div style={css('text-align:center;margin-bottom:6px;')}>
                <div style={css('font-size:20px;font-weight:800;letter-spacing:.04em;')}>{BRAND.toUpperCase()}</div>
                <div style={css('font-size:11px;color:var(--fg-muted);margin-top:3px;')}>128 Alder Lane · (415) 555-0148</div>
              </div>
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <div style={css('display:flex;justify-content:space-between;font-size:11.5px;color:var(--fg-muted);margin-bottom:11px;' + MONO)}>
                <span>{t('complete.orderNo', { n: sale.number })}</span>
                <span>{tableName(sale.table, s.mode)}</span>
              </div>
              {sale.items.map((it, i) => {
                const sub = (it.mod || '') + (it.note ? (it.mod ? ' · ' : '') + '“' + it.note + '”' : '');
                return (
                  <div key={i} style={css('display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;')}>
                    <span style={css('font-size:12.5px;line-height:1.4;')}>
                      <span style={css('font-weight:700;' + MONO)}>{it.qty}×</span> {it.name}
                      {!!sub && <span style={css('display:block;font-size:11px;color:var(--fg-muted);')}>{sub}</span>}
                    </span>
                    <span style={css('font-size:12.5px;' + MONO)}>{money(it.line)}</span>
                  </div>
                );
              })}
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <ReceiptRow label={t('common.subtotal')} value={money(sale.subtotal)} />
              {/* A discounted sale used to print Subtotal / Tax / Tip over a
                  Total that had the discount removed — a receipt whose own rows
                  contradicted its total. */}
              {sale.discount > 0 && (
                <ReceiptRow label={sale.discountLabel || t('common.discount')} value={'−' + money(sale.discount)} />
              )}
              <ReceiptRow label={t('common.tax')} value={money(sale.tax)} />
              <ReceiptRow label={t('common.tip')} value={money(sale.tip)} />
              <div style={css('display:flex;justify-content:space-between;font-size:15px;font-weight:800;padding-top:9px;border-top:1px solid var(--border);margin-top:4px;')}>
                <span>{t('common.total')}</span>
                <span style={css(MONO)}>{money(sale.total)}</span>
              </div>
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <div style={css('display:flex;justify-content:space-between;font-size:12px;')}>
                <span style={css('color:var(--fg-muted);')}>{t('complete.paidWith', { methods: methods.join(' + ') })}</span>
                <span style={css(MONO)}>{money(sale.total)}</span>
              </div>
              <div style={css('text-align:center;font-size:11px;color:var(--fg-muted);margin-top:18px;')}>{t('complete.servedBy', { staff: sale.staff })}</div>
            </div>
          </div>

          <div style={css('flex:1;min-width:280px;display:flex;flex-direction:column;gap:11px;')}>
            <button className="pos-press" onClick={s.printReceipt} style={css('height:66px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;')}>
              <Icon name="printer" size={21} />
              {t('complete.printReceipt')}
            </button>
            <div style={css('display:flex;gap:11px;')}>
              <button className="pos-press" onClick={() => s.sendReceipt('email')} style={css('flex:1;height:62px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="mail" size={19} />
                {t('complete.email')}
              </button>
              <button className="pos-press" onClick={() => s.sendReceipt('text')} style={css('flex:1;height:62px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="message-square" size={19} />
                {t('complete.text')}
              </button>
            </div>
            <div style={css('display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surface);border:1px solid var(--border);')}>
              <Icon name="at-sign" size={17} color="var(--fg-subtle)" />
              <input placeholder={t('complete.contactPlaceholder')} aria-label={t('complete.contactPlaceholder')} style={css('flex:1;border:none;background:transparent;outline:none;font-size:14.5px;color:var(--fg);')} />
            </div>
            <div style={css('height:1px;background:var(--border);margin:6px 0;')} />
            <button className="pos-press" onClick={s.newOrder} style={css('height:66px;border-radius:16px;border:1.5px solid var(--accent);background:var(--accent-soft);color:var(--accent);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;')}>
              <Icon name="plus" size={21} />
              {t('complete.newOrder')}
            </button>
            {s.mode === 'restaurant' && (
              <button className="pos-press" onClick={() => usePos.setState({ view: 'floor' })} style={css('height:56px;border-radius:15px;border:none;background:transparent;color:var(--fg-muted);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="grid-3x3" size={18} />
                {t('complete.backToFloor')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={css('display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;')}>
      <span style={css('color:var(--fg-muted);')}>{label}</span>
      <span style={css("font-family:'JetBrains Mono',monospace;")}>{value}</span>
    </div>
  );
}
