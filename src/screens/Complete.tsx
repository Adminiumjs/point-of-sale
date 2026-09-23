import { usePos, curStaffOf } from '../state/store';
import { source } from '../data/source';
import { demoSale, money, tableName } from '../state/calc';
import { useI18n } from '../i18n';
import { DEMO } from '../surface';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function Complete() {
  const s = usePos();
  const { t, date, number } = useI18n();
  /*
   * The receipt of the sale that just closed. Only the demo makes one up for a
   * receipt opened with no sale behind it (its dock can open this screen
   * directly); a real till shows nothing rather than a sale that never
   * happened (§0.6).
   */
  const sale = s.lastSale ?? (DEMO ? demoSale(s.ticket, curStaffOf(s).name) : null);
  if (sale === null) return <NoSale />;
  const venue = source.venue();
  const contact = [venue.address, venue.phone].filter((x): x is string => x !== null && x !== '').join(' · ');

  const methods: string[] = [];
  sale.splits.forEach((sp) => {
    const l = t(sp.method === 'cash' ? 'common.cash' : sp.method === 'card' ? 'common.card' : sp.method === 'gift_card' ? 'gift.method' : 'payment.qr');
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
            <div className="receipt-paper" style={css('width:300px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 22px 24px;box-shadow:var(--shadow-lg);')}>
              <div style={css('text-align:center;margin-bottom:6px;')}>
                <div style={css('font-size:20px;font-weight:800;letter-spacing:.04em;')}>{venue.name.toUpperCase()}</div>
                {/* The venue's own street and phone, from its settings. */}
                {contact !== '' && <div style={css('font-size:11px;color:var(--fg-muted);margin-top:3px;')}>{contact}</div>}
              </div>
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <div style={css('display:flex;justify-content:space-between;font-size:11.5px;color:var(--fg-muted);margin-bottom:11px;' + MONO)}>
                <span>{t('complete.orderNo', { n: sale.number })}</span>
                <span>{tableName(sale.table, s.mode)}</span>
              </div>
              {/* A printed receipt says when (a fill, F4): the screen above already does. */}
              <div className="receipt-when" style={css('font-size:11px;color:var(--fg-muted);margin:-6px 0 11px;' + MONO)}>
                {date(sale.at, { dateStyle: 'medium', timeStyle: 'short' })}
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
              {/* What the guest asked for on the customer display (W2-14: nothing sends it yet). */}
              {sale.receipt !== undefined && sale.receipt.via !== 'none' && (
                <div className="no-print" role="note" style={css('margin-top:9px;font-size:11.5px;color:var(--fg-muted);')}>
                  {sale.receipt.via === 'print'
                    ? t('complete.guestWantsPrint')
                    : t(sale.receipt.via === 'email' ? 'complete.guestWantsEmail' : 'complete.guestWantsText', { to: sale.receipt.to ?? '' })}
                </div>
              )}
              {/* The member the sale was for: what it earned, and where that leaves them. */}
              {sale.member !== undefined && (
                <div className="receipt-member" style={css('margin-top:9px;font-size:12px;display:flex;justify-content:space-between;gap:10px;')}>
                  <span style={css('color:var(--fg-muted);')}>{sale.member.name}</span>
                  <span style={css(MONO)}>
                    {sale.member.balance === null
                      ? t('complete.pointsEarned', { n: number(sale.member.earned) })
                      : t('complete.pointsEarnedBalance', { n: number(sale.member.earned), balance: number(sale.member.balance) })}
                  </span>
                </div>
              )}
              <div style={css('text-align:center;font-size:11px;color:var(--fg-muted);margin-top:18px;')}>
                {venue.footer === null || venue.footer === '' ? t('complete.servedBy', { staff: sale.staff }) : t('complete.servedByOnly', { staff: sale.staff })}
              </div>
              {venue.footer !== null && venue.footer !== '' && <div style={css('text-align:center;font-size:11px;color:var(--fg-muted);margin-top:4px;')}>{venue.footer}</div>}
            </div>
          </div>

          <div className="no-print" style={css('flex:1;min-width:280px;display:flex;flex-direction:column;gap:11px;')}>
            <button className="pos-press" onClick={s.printReceipt} style={css('height:66px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;')}>
              <Icon name="printer" size={21} />
              {t('complete.printReceipt')}
            </button>
            {/* No receipt e-mail or text exists yet (T72): the demo only (DP30). */}
            {DEMO && (
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
            )}
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

/** No sale to show — a real till opened on its receipt with nothing sold. */
function NoSale() {
  const s = usePos();
  const { t } = useI18n();
  return (
    <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:30px;text-align:center;')}>
      <Icon name="receipt" size={40} color="var(--fg-muted)" />
      <div style={css('font-size:16px;font-weight:700;color:var(--fg-muted);')}>{t('complete.noSale')}</div>
      <button className="pos-press" onClick={s.newOrder} style={css('height:56px;padding:0 24px;border-radius:15px;border:none;background:var(--accent);color:var(--accent-fg);font-size:16px;font-weight:800;cursor:pointer;')}>
        {t('complete.newOrder')}
      </button>
    </div>
  );
}
