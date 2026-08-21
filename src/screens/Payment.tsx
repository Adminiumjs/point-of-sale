import { usePos } from '../state/store';
import type { PayMethod } from '../data/types';
import {
  chargeTarget,
  discountAmt,
  money,
  paid,
  remaining,
  subtotal,
  tableName,
  tax,
  tipAmt,
  taxLabel,
  tipFor,
  total,
} from '../state/calc';
import { useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

const tipStyle = (on: boolean) =>
  'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:64px;border-radius:14px;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';cursor:pointer;';

const methodStyle = (on: boolean) =>
  'flex:1;display:flex;align-items:center;justify-content:center;gap:9px;height:60px;border-radius:15px;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';font-size:16px;font-weight:800;cursor:pointer;';

const scStyle = (on: boolean) =>
  'flex:1;min-width:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:58px;border-radius:14px;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';cursor:pointer;';

const CASH_PAD: { t?: string; back?: boolean }[] = [
  { t: '1' }, { t: '2' }, { t: '3' }, { t: '4' }, { t: '5' }, { t: '6' }, { t: '7' }, { t: '8' }, { t: '9' }, { t: '.' }, { t: '0' }, { back: true },
];

export function Payment() {
  const s = usePos();
  const t = useT();
  const rem = remaining(s);
  const paidv = paid(s);
  const total_ = total(s);
  const isCash = s.payMethod === 'cash';
  const isCard = s.payMethod === 'card';
  const isQr = s.payMethod === 'qr';

  const tend = parseFloat(s.cash || '0') || 0;
  const target = chargeTarget(s);

  // even-split ledger
  const guests = s.mode !== 'retail' && s.ticket.seats ? s.ticket.seats : 0;
  const evenNs = [2, 3, 4];
  if (guests >= 2 && evenNs.indexOf(guests) < 0) evenNs.push(guests);
  const evenActive = s.splitMode === 'even' && s.splitN > 0;
  const base = s.splitN > 0 ? Math.round((total_ / s.splitN) * 100) / 100 : 0;
  const payersPaid = evenActive ? Math.min(s.splitN, Math.round(paidv / (base || 1))) : 0;
  const pips = Array.from({ length: s.splitN }, (_, pi) => pi < payersPaid);

  const amountChipDefs: { l: string; f: number }[] = [
    { l: '½', f: 0.5 },
    { l: '⅓', f: 1 / 3 },
    { l: '¼', f: 0.25 },
  ];

  const splitBadge = evenActive
    ? t('payment.splitBadgeEven', { n: s.splitN })
    : s.splitMode === 'amount'
      ? t('payment.splitBadgeAmount', { amount: money(parseFloat(s.splitCustom) || 0) })
      : '';
  const ledgerText = evenActive
    ? t('payment.ledger', {
        i: Math.min(payersPaid + 1, s.splitN),
        n: s.splitN,
        amount: money(base),
      })
    : '';

  // card
  const cardTitle = t(
    s.card === 'waiting'
      ? 'payment.cardWaiting'
      : s.card === 'reading'
        ? 'payment.cardReading'
        : s.card === 'approved'
          ? 'payment.cardApproved'
          : 'payment.declinedTitle',
  );
  const cardSub =
    s.card === 'waiting'
      ? t('payment.cardWaitingSub', { amount: money(rem) })
      : s.card === 'reading'
        ? t('payment.cardReadingSub')
        : s.card === 'approved'
          ? t('payment.cardApprovedSub')
          : t('payment.cardDeclinedSub');
  const cardBorder = s.card === 'approved' ? 'color-mix(in srgb, var(--pos) 45%, transparent)' : s.card === 'declined' ? 'color-mix(in srgb, var(--danger) 45%, transparent)' : 'var(--border)';
  const cardIcon = s.card === 'approved' ? 'check-circle-2' : s.card === 'declined' ? 'x-circle' : 'credit-card';
  const cardIconCol = s.card === 'approved' ? 'var(--pos)' : s.card === 'declined' ? 'var(--danger)' : 'var(--accent)';

  // charge button
  const chargeEnabled = isCash ? (s.splitMode !== 'none' ? tend >= target - 0.005 : tend > 0) : isCard ? s.card === 'waiting' || s.card === 'declined' : true;
  let chargeLabel: string;
  let chargeIcon: string;
  if (isCard) {
    chargeIcon = s.card === 'declined' ? 'rotate-ccw' : 'credit-card';
    chargeLabel =
      s.card === 'reading'
        ? t('payment.chargeReading')
        : s.card === 'approved'
          ? t('payment.cardApproved')
          : s.card === 'declined'
            ? t('payment.retryCard')
            : t('payment.charge', { amount: money(target) });
  } else if (isCash) {
    chargeIcon = 'banknote';
    chargeLabel =
      tend <= 0
        ? t('payment.enterCash')
        : s.splitMode !== 'none'
          ? t('payment.charge', { amount: money(target) })
          : tend >= rem
            ? t('payment.charge', { amount: money(rem) })
            : t('payment.addPartial', { amount: money(tend) });
  } else {
    chargeIcon = 'check';
    chargeLabel = t('payment.markPaid', { amount: money(target) });
  }

  // cash presets
  const r5 = Math.ceil(rem / 5) * 5;
  const r10 = Math.ceil(rem / 10) * 10;
  const pres: { label: string; v: number }[] = [{ label: t('payment.exact'), v: Math.round(rem * 100) / 100 }];
  if (r5 > rem) pres.push({ label: money(r5), v: r5 });
  if (r10 > rem && r10 !== r5) pres.push({ label: money(r10), v: r10 });
  if (50 > rem && pres.length < 4) pres.push({ label: money(50), v: 50 });
  if (100 > rem && pres.length < 4) pres.push({ label: money(100), v: 100 });
  const cashPresets = pres.slice(0, 4);

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <header style={css('flex-shrink:0;min-height:70px;display:flex;align-items:center;gap:14px;padding:0 18px;background:var(--surface);border-bottom:1px solid var(--border);')}>
        <button className="pos-press" onClick={() => usePos.setState({ view: 'register' })} style={css('display:flex;align-items:center;gap:9px;height:50px;padding:0 16px 0 12px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:700;cursor:pointer;')}>
          <Icon name="arrow-left" size={19} />
          {t('payment.back')}
        </button>
        <div>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;')}>{t('payment.title')}</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:2px;')}>
            {t('payment.subtitle', { n: s.ticket.number, table: tableName(s.ticket.table, s.mode) })}
          </div>
        </div>
      </header>

      {isCard && s.card === 'declined' && (
        <div style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;margin:14px 18px 0;padding:14px 16px;border-radius:14px;background:var(--danger-soft);border:1px solid color-mix(in srgb, var(--danger) 35%, transparent);color:var(--danger);')}>
          <Icon name="x-circle" size={22} />
          <div style={css('flex:1;')}>
            <div style={css('font-size:14.5px;font-weight:800;')}>{t('payment.declinedTitle')}</div>
            <div style={css('font-size:12.5px;font-weight:600;opacity:.85;')}>{t('payment.declinedHint')}</div>
          </div>
        </div>
      )}

      <div className="pay-body">
        {/* LEFT: summary rail */}
        <div className="pos-scroll pay-summary">
          <div style={css('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-subtle);')}>{t(paidv > 0 ? 'payment.remainingBalance' : 'payment.balanceDue')}</div>
          <div style={css('font-size:64px;font-weight:800;' + MONO + 'letter-spacing:-.03em;line-height:1;margin:6px 0 2px;')}>{money(rem)}</div>

          {s.splits.length > 0 && (
            <div style={css('margin-top:16px;display:flex;flex-direction:column;gap:8px;')}>
              {s.splits.map((sp, i) => (
                <div key={i} style={css('display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:13px;background:var(--surface);border:1px solid var(--border);')}>
                  <Icon name={sp.method === 'cash' ? 'banknote' : sp.method === 'card' ? 'credit-card' : 'qr-code'} size={17} color="var(--pos)" />
                  <span style={css('font-size:14px;font-weight:700;')}>
                    {t(sp.method === 'cash' ? 'common.cash' : sp.method === 'card' ? 'common.card' : 'payment.qrPay')}
                  </span>
                  <span style={css('margin-inline-start:auto;' + MONO + 'font-weight:700;')}>{money(sp.amount)}</span>
                  <Icon name="check" size={16} color="var(--pos)" />
                </div>
              ))}
            </div>
          )}

          <div style={css('margin-top:24px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>{t('common.tip')}</div>
          <div style={css('display:flex;gap:8px;')}>
            {[
              { l: t('payment.noTip'), i: 0 },
              { l: t('payment.tipPct', { pct: 10 }), i: 1 },
              { l: t('payment.tipPct', { pct: 15 }), i: 2 },
              { l: t('payment.tipPct', { pct: 20 }), i: 3 },
            ].map((x) => (
              <button key={x.i} className="pos-press" onClick={() => s.setTip(x.i)} style={css(tipStyle(s.tip === x.i))}>
                <span style={css('font-size:15px;font-weight:800;')}>{x.l}</span>
                {/* `tipFor`, not `subtotal * TIP_PRESETS[i]` — the tip is
                    assessed on the discounted goods, so the second spelling
                    quoted a figure the Tip row below contradicted. */}
                {x.i > 0 && <span style={css('font-size:12px;' + MONO + 'opacity:.7;margin-top:2px;')}>{money(tipFor(s, x.i))}</span>}
              </button>
            ))}
          </div>

          <div style={css('margin-top:22px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>
            {t('payment.splitBill')}
            {s.splitMode !== 'none' && (
              <>
                <span style={css('font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px;background:var(--accent-soft);color:var(--accent);' + MONO + 'text-transform:none;letter-spacing:0;')}>{splitBadge}</span>
                <button className="pos-press" onClick={s.clearSplit} style={css('margin-inline-start:auto;font-size:11.5px;font-weight:700;border:none;background:transparent;color:var(--fg-muted);cursor:pointer;text-transform:none;letter-spacing:0;')}>{t('common.clear')}</button>
              </>
            )}
          </div>
          <div style={css('font-size:11.5px;font-weight:700;color:var(--fg-subtle);margin-bottom:7px;')}>{t('payment.splitEvenly')}</div>
          <div style={css('display:flex;gap:8px;flex-wrap:wrap;')}>
            {evenNs.map((n) => {
              const sh = Math.round((total_ / n) * 100) / 100;
              const on = s.splitMode === 'even' && s.splitN === n;
              return (
                <button key={n} className="pos-press" onClick={() => s.setSplitN(n)} style={css(scStyle(on))}>
                  <span style={css('font-size:14.5px;font-weight:800;')}>
                    {guests === n && n > 4 ? t('payment.guestsN', { n }) : t('payment.nWays', { n })}
                  </span>
                  <span style={css('font-size:11.5px;' + MONO + 'opacity:.7;')}>{t('payment.each', { amount: money(sh) })}</span>
                </button>
              );
            })}
          </div>
          {evenActive && (
            <div style={css('margin-top:12px;padding:14px 15px;border-radius:14px;background:var(--surface);border:1px solid var(--border);')}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;')}>
                <span style={css('font-size:13.5px;font-weight:800;')}>{ledgerText}</span>
                <span style={css('font-size:12.5px;font-weight:800;' + MONO + 'color:var(--accent);white-space:nowrap;')}>{t('payment.thisCharge', { amount: money(target) })}</span>
              </div>
              <div style={css('display:flex;gap:5px;')}>
                {pips.map((filled, pi) => (
                  <span key={pi} style={css('flex:1;height:8px;border-radius:20px;background:' + (filled ? 'var(--accent)' : 'var(--surface-3)') + ';')} />
                ))}
              </div>
            </div>
          )}
          <div style={css('font-size:11.5px;font-weight:700;color:var(--fg-subtle);margin:14px 0 7px;')}>{t('payment.chargePart')}</div>
          <div style={css('display:flex;gap:8px;flex-wrap:wrap;')}>
            {amountChipDefs.map((x) => {
              const v = Math.round(rem * x.f * 100) / 100;
              const on = s.splitMode === 'amount' && Math.abs((parseFloat(s.splitCustom) || 0) - v) < 0.005;
              return (
                <button key={x.l} className="pos-press" onClick={() => s.setSplitFraction(x.f)} style={css(scStyle(on))}>
                  <span style={css('font-size:16px;font-weight:800;')}>{x.l}</span>
                  <span style={css('font-size:11.5px;' + MONO + 'opacity:.7;')}>{money(v)}</span>
                </button>
              );
            })}
          </div>

          <div style={css('margin-top:24px;padding-top:16px;border-top:1px dashed var(--border-strong);display:flex;flex-direction:column;gap:9px;')}>
            <Row label={t('common.subtotal')} value={money(subtotal(s))} />
            {/* Without this row the summary printed Subtotal + Tax + Tip beside
                a Total that had the discount taken off — four numbers that did
                not add up. The register pane has always shown it. */}
            {!!s.discount && <Row label={s.discount.label} value={'−' + money(discountAmt(s))} />}
            <Row label={taxLabel()} value={money(tax(s))} />
            <Row label={t('common.tip')} value={money(tipAmt(s))} />
            <div style={css('display:flex;justify-content:space-between;font-size:16px;padding-top:9px;border-top:1px solid var(--border);')}>
              <span style={css('font-weight:800;')}>{t('common.total')}</span>
              <span style={css(MONO + 'font-weight:800;')}>{money(total_)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: method pane */}
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
          <div style={css('flex-shrink:0;display:flex;gap:10px;padding:20px 22px 0;')}>
            {([
              { m: 'cash', l: 'common.cash', ic: 'banknote' },
              { m: 'card', l: 'common.card', ic: 'credit-card' },
              { m: 'qr', l: 'payment.qr', ic: 'qr-code' },
            ] as { m: PayMethod; l: MessageKey; ic: string }[]).map((x) => (
              <button key={x.m} className="pos-press" onClick={() => s.setMethod(x.m)} style={css(methodStyle(s.payMethod === x.m))}>
                <Icon name={x.ic} size={20} />
                {t(x.l)}
              </button>
            ))}
          </div>

          <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 22px;')}>
            {isCash && (
              <div style={css('display:flex;gap:20px;flex-wrap:wrap;')}>
                <div style={css('flex:1;min-width:220px;')}>
                  <div style={css('display:flex;flex-direction:column;gap:10px;margin-bottom:16px;')}>
                    <div style={css('display:flex;justify-content:space-between;align-items:baseline;padding:15px 16px;border-radius:15px;background:var(--surface);border:1px solid var(--border);')}>
                      <span style={css('font-size:13px;font-weight:700;color:var(--fg-muted);')}>{t('payment.tendered')}</span>
                      <span style={css('font-size:28px;font-weight:800;' + MONO)}>{money(tend)}</span>
                    </div>
                    <div style={css('display:flex;justify-content:space-between;align-items:baseline;padding:15px 16px;border-radius:15px;background:var(--pos-soft);')}>
                      <span style={css('font-size:13px;font-weight:700;color:var(--pos);')}>{t('payment.changeDue')}</span>
                      <span style={css('font-size:28px;font-weight:800;' + MONO + 'color:var(--pos);')}>{money(tend > target ? tend - target : 0)}</span>
                    </div>
                  </div>
                  <div style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
                    {cashPresets.map((cp) => (
                      <button key={cp.label} className="pos-press" onClick={() => s.cashPreset(cp.v)} style={css('flex:1;min-width:86px;height:50px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--fg);font-size:14px;font-weight:700;' + MONO + 'cursor:pointer;')}>
                        {cp.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={css('width:264px;')}>
                  <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:9px;')}>
                    {CASH_PAD.map((k, i) => (
                      <button key={i} className="pos-press" onClick={() => s.cashPush(k.back ? 'back' : (k.t as string))} aria-label={k.back ? t('login.backspace') : k.t} style={css('height:60px;border-radius:13px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:23px;font-weight:700;' + MONO + 'cursor:pointer;display:flex;align-items:center;justify-content:center;')}>
                        {k.back ? <Icon name="delete" size={21} /> : k.t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isCard && (
              <div style={css('max-width:460px;margin:8px auto;text-align:center;')}>
                <div style={css('padding:38px 30px;border-radius:22px;border:1.5px solid ' + cardBorder + ';background:var(--surface);' + (s.card === 'waiting' ? 'animation:pos-cardglow 2.2s infinite;' : ''))}>
                  <Icon name={cardIcon} size={48} color={cardIconCol} />
                  <div style={css('font-size:20px;font-weight:800;margin-top:16px;letter-spacing:-.01em;')}>{cardTitle}</div>
                  <div style={css('font-size:13.5px;color:var(--fg-muted);margin-top:6px;')}>{cardSub}</div>
                  {s.card === 'reading' && <div style={css('width:34px;height:34px;border:3px solid var(--surface-3);border-top-color:var(--accent);border-radius:50%;animation:pos-spin .8s linear infinite;margin:18px auto 0;')} />}
                </div>
                <div style={css('display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;font-size:12.5px;color:var(--fg-subtle);')}>
                  <Icon name="shield-check" size={15} />
                  {t('payment.encrypted')}
                </div>
              </div>
            )}

            {isQr && (
              <div style={css('max-width:420px;margin:8px auto;text-align:center;')}>
                <div style={css('width:224px;height:224px;margin:0 auto;border-radius:22px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);')}>
                  <Icon name="qr-code" size={156} color="var(--fg)" />
                </div>
                <div style={css('font-size:19px;font-weight:800;margin-top:18px;')}>{t('payment.scanToPay', { amount: money(rem) })}</div>
                <div style={css('font-size:13.5px;color:var(--fg-muted);margin-top:6px;line-height:1.5;')}>{t('payment.qrHint')}</div>
              </div>
            )}
          </div>

          <div style={css('flex-shrink:0;padding:16px 22px;border-top:1px solid var(--border);background:var(--surface);')}>
            <button
              className="pos-press"
              onClick={s.onCharge}
              style={css('width:100%;height:68px;border-radius:17px;border:none;background:' + (chargeEnabled ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (chargeEnabled ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';font-size:19px;font-weight:800;cursor:' + (chargeEnabled ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:11px;')}
            >
              <Icon name={chargeIcon} size={22} />
              {chargeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={css('display:flex;justify-content:space-between;font-size:14px;')}>
      <span style={css('color:var(--fg-muted);font-weight:600;')}>{label}</span>
      <span style={css("font-family:'JetBrains Mono',monospace;font-weight:600;")}>{value}</span>
    </div>
  );
}
