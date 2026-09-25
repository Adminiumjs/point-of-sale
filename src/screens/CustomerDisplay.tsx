import { usePos } from '../state/store';
import { discountAmt, lineName, lineTotal, modLabel, money, subtotal, tableName, tax, tipAmt, tipFor, total } from '../state/calc';
import { source } from '../data/source';
import { useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import type { ReceiptVia } from '../data/types';

const MONO = "font-family:'JetBrains Mono',monospace;";

const RECEIPTS: { via: ReceiptVia; label: MessageKey; icon: string }[] = [
  { via: 'email', label: 'display.receiptEmail', icon: 'mail' },
  { via: 'text', label: 'display.receiptText', icon: 'message-square' },
  { via: 'print', label: 'display.receiptPrint', icon: 'printer' },
  { via: 'none', label: 'display.receiptNone', icon: 'x' },
];

/** The receipt choices a guest is offered: by email only while the till can send one (Invoices & Receipts attached). */
export const receiptChoices = (emailing: boolean) => RECEIPTS.filter((o) => o.via !== 'email' || emailing);

const chip = (on: boolean) =>
  'flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:62px;border-radius:15px;border:2px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';cursor:pointer;font-family:inherit;font-size:16px;font-weight:800;';

/**
 * The customer-facing display (COMP 581-619, logic 2001-2019): the guest sees
 * their order and the money, chooses a tip — the same buttons as Payment, and
 * Payment keeps the choice (fix 7) — then signs and says how they want their
 * receipt (COMP 635-654). Done saves the signature's time and the choice on the
 * ticket (`signed_at`, `receipt_via`, `receipt_to`).
 *
 * Beyond the comp (numbered in the plan's progress):
 *   W2-11 the tip buttons are the venue's presets plus Custom (DP18's rule), not
 *         a fixed 15 % / 20 %;
 *   W2-12 the signature box shows ONE state at a time (comp defect 1: both
 *         bound to `cfdSigned`); a tap is the signature;
 *   W2-13 Email and Text ask where to send it; Done names what is missing.
 */
export function CustomerDisplay() {
  const s = usePos();
  const t = useT();
  const items = s.ticket.items;
  const count = items.reduce((sum, x) => sum + x.qty, 0);
  const venue = source.brand();
  const title =
    s.mode !== 'retail' && s.ticket.table !== null && s.ticket.table !== '—'
      ? t('display.orderFor', { table: tableName(s.ticket.table, s.mode) })
      : venue === ''
        ? t('display.welcomePlain')
        : t('display.welcome', { venue });
  const presets = source.tipPresets();
  const custom = s.tip === 'c';

  if (s.display.step === 'sign') return <SignStep />;

  return (
    <div className="display-root" style={css('flex:1;min-height:0;display:flex;background:var(--bg);')}>
      <div className="display-brand" style={css('width:40%;min-width:300px;background:var(--accent);color:var(--accent-fg);display:flex;flex-direction:column;justify-content:space-between;padding:40px;')}>
        <div style={css('display:flex;align-items:center;gap:14px;')}>
          <div aria-hidden="true" style={css('width:56px;height:56px;border-radius:16px;background:color-mix(in srgb, var(--accent-fg) 16%, transparent);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;')}>
            {venue.charAt(0)}
          </div>
          <div style={css('font-size:26px;font-weight:800;letter-spacing:-.02em;')}>{venue}</div>
        </div>
        <div>
          <h1 style={css('margin:0;font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.1;')}>{title}</h1>
          <div style={css('font-size:16px;opacity:.9;margin-top:12px;')}>{t('display.itemsOnOrder', undefined, count)}</div>
        </div>
        <div style={css('font-size:14px;opacity:.85;display:flex;align-items:center;gap:8px;')}>
          <Icon name="shield-check" size={16} />
          {t('display.review')}
        </div>
      </div>

      <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;background:var(--surface);')}>
        <div style={css('flex-shrink:0;display:flex;align-items:center;padding:22px 26px;border-bottom:1px solid var(--border);')}>
          <h2 style={css('margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('display.yourOrder')}</h2>
          <button className="pos-press" onClick={() => usePos.setState({ view: 'register' })} style={css('margin-inline-start:auto;height:44px;padding:0 15px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg-muted);font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;')}>
            <Icon name="arrow-left" size={16} className="rtl-flip" />
            {t('nav.register')}
          </button>
        </div>
        <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:8px 26px;')}>
          {items.length === 0 ? (
            <div style={css('height:100%;min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--fg-muted);')}>
              <div style={css('width:64px;height:64px;border-radius:18px;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--fg-subtle);margin-bottom:16px;')}>
                <Icon name="hand-platter" size={28} />
              </div>
              <div style={css('font-size:17px;font-weight:800;color:var(--fg);')}>{t('display.welcomeEmpty')}</div>
              <div style={css('font-size:14px;margin-top:6px;')}>{t('display.emptyHint')}</div>
            </div>
          ) : (
            items.map((li) => {
              const mod = modLabel(li);
              return (
                <div key={li.key} style={css('display:flex;align-items:flex-start;gap:14px;padding:15px 4px;border-bottom:1px solid var(--border);')}>
                  <span style={css('min-width:34px;font-size:18px;font-weight:800;color:var(--accent);' + MONO)}>{li.qty}×</span>
                  <div style={css('flex:1;min-width:0;')}>
                    <div style={css('font-size:18px;font-weight:700;letter-spacing:-.01em;')}>{lineName(li)}</div>
                    {mod !== '' && <div style={css('font-size:14px;color:var(--fg-muted);margin-top:3px;')}>{mod}</div>}
                  </div>
                  <span style={css('font-size:18px;font-weight:800;' + MONO)}>{money(lineTotal(li))}</span>
                </div>
              );
            })
          )}
        </div>
        <div style={css('flex-shrink:0;border-top:1px solid var(--border);padding:22px 26px;background:var(--surface);')}>
          {items.length > 0 && (
            <>
              <div id="display-tip" style={css('font-size:14px;font-weight:800;margin-bottom:11px;display:flex;align-items:center;gap:8px;')}>
                <Icon name="hand-coins" size={17} color="var(--accent)" />
                {t('display.tipAsk')}
              </div>
              <div role="radiogroup" aria-labelledby="display-tip" style={css('display:flex;gap:10px;margin-bottom:20px;')}>
                {presets.map((p, i) => {
                  const on = s.tip === i;
                  return (
                    <button key={i} role="radio" aria-checked={on} className="pos-press" onClick={() => s.displayTip(i)} style={css(chip(on))}>
                      <span>{p === 0 ? t('payment.noTip') : t('payment.tipPct', { pct: Math.round(p * 1000) / 10 })}</span>
                      {p > 0 && <span style={css('font-size:12px;opacity:.75;margin-top:2px;' + MONO)}>{money(tipFor(s, i))}</span>}
                    </button>
                  );
                })}
                <button role="radio" aria-checked={custom} className="pos-press" onClick={() => s.displayTip('custom')} style={css(chip(custom))}>
                  <span>{t('display.custom')}</span>
                  {custom && tipAmt(s) > 0 && <span style={css('font-size:12px;opacity:.75;margin-top:2px;' + MONO)}>{money(tipAmt(s))}</span>}
                </button>
              </div>
            </>
          )}
          <Row label={t('common.subtotal')} value={money(subtotal(s))} />
          {s.discount !== null && <Row label={s.discount.label} value={'−' + money(discountAmt(s))} tone="var(--pos)" />}
          <Row label={t('common.tax')} value={money(tax(s))} gap={14} />
          {tipAmt(s) > 0 && <Row label={t('common.tip')} value={money(tipAmt(s))} tone="var(--accent)" gap={14} />}
          <div style={css('display:flex;align-items:baseline;justify-content:space-between;padding-top:16px;border-top:1px dashed var(--border-strong);')}>
            <span style={css('font-size:20px;font-weight:800;')}>{t('common.total')}</span>
            <span style={css('font-size:46px;font-weight:800;letter-spacing:-.02em;' + MONO)}>{money(total(s))}</span>
          </div>
          {items.length > 0 && (
            <button className="pos-press" onClick={s.displayContinue} style={css('width:100%;height:60px;margin-top:16px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
              {t('display.confirmSign')}
              <Icon name="arrow-right" size={19} className="rtl-flip" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone, gap = 8 }: { label: string; value: string; tone?: string; gap?: number }) {
  return (
    <div style={css('display:flex;justify-content:space-between;font-size:15px;margin-bottom:' + String(gap) + 'px;' + (tone === undefined ? '' : 'color:' + tone + ';'))}>
      <span style={css('font-weight:' + (tone === undefined ? '600;color:var(--fg-muted)' : '700') + ';')}>{label}</span>
      <span style={css('font-weight:' + (tone === undefined ? '600' : '700') + ';' + MONO)}>{value}</span>
    </div>
  );
}

function SignStep() {
  const s = usePos();
  const t = useT();
  const d = s.display;
  const needsWhere = d.receipt === 'email' || d.receipt === 'text';
  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface);animation:pos-slidein .28s cubic-bezier(.2,.8,.2,1);')}>
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:20px 26px;border-bottom:1px solid var(--border);')}>
        <button className="pos-press" onClick={s.displayBack} aria-label={t('display.backToOrder')} style={css('width:44px;height:44px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
          <Icon name="arrow-left" size={19} className="rtl-flip" />
        </button>
        <div>
          <h1 style={css('margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('display.almostDone')}</h1>
          <div style={css('font-size:13px;color:var(--fg-muted);')}>{t('display.signAndChoose')}</div>
        </div>
        <div style={css('margin-inline-start:auto;font-size:26px;font-weight:800;' + MONO)}>{money(total(s))}</div>
      </div>
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:24px;max-width:720px;width:100%;margin:0 auto;box-sizing:border-box;')}>
        <div style={css('font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>{t('display.signature')}</div>
        <button
          className="pos-press"
          aria-pressed={d.signed}
          onClick={s.displaySign}
          style={css('width:100%;height:150px;border:2px dashed ' + (d.signed ? 'var(--pos)' : 'var(--border-strong)') + ';border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-family:inherit;cursor:pointer;background:' + (d.signed ? 'var(--pos-soft)' : 'var(--surface-2)') + ';color:' + (d.signed ? 'var(--pos)' : 'var(--fg-muted)') + ';')}
        >
          <Icon name={d.signed ? 'check-circle-2' : 'pen-line'} size={d.signed ? 34 : 30} />
          <span style={css('font-size:15px;font-weight:' + (d.signed ? '800' : '700') + ';')}>{t(d.signed ? 'display.signed' : 'display.tapToSign')}</span>
        </button>
        <div id="display-receipt" style={css('font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin:24px 0 11px;')}>{t('display.receipt')}</div>
        <div role="radiogroup" aria-labelledby="display-receipt" style={css('display:flex;flex-wrap:wrap;gap:10px;')}>
          {receiptChoices(s.features['emailed-receipts']).map((o) => {
            const on = d.receipt === o.via;
            return (
              <button key={o.via} role="radio" aria-checked={on} className="pos-press" onClick={() => s.displayReceipt(o.via)} style={css('flex:1;min-width:118px;display:flex;align-items:center;justify-content:center;gap:8px;height:56px;border-radius:14px;font-family:inherit;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg)') + ';font-size:15px;font-weight:800;cursor:pointer;')}>
                <Icon name={o.icon} size={18} />
                {t(o.label)}
              </button>
            );
          })}
        </div>
        {needsWhere && (
          <div style={css('margin-top:14px;')}>
            <label htmlFor="display-receipt-to" style={css('display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:6px;')}>
              {t(d.receipt === 'email' ? 'display.emailLabel' : 'display.phoneLabel')}
            </label>
            <input
              id="display-receipt-to"
              type={d.receipt === 'email' ? 'email' : 'tel'}
              value={d.receiptTo}
              onChange={(e) => s.displayReceiptTo(e.target.value)}
              autoComplete="off"
              style={css('width:100%;height:52px;padding:0 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;')}
            />
          </div>
        )}
      </div>
      <div style={css('flex-shrink:0;padding:16px 26px;border-top:1px solid var(--border);max-width:720px;width:100%;margin:0 auto;box-sizing:border-box;')}>
        <button className="pos-press" disabled={!d.signed} onClick={s.displayDone} style={css('width:100%;height:62px;border-radius:16px;border:none;font-family:inherit;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:9px;cursor:' + (d.signed ? 'pointer' : 'not-allowed') + ';background:' + (d.signed ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (d.signed ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}>
          <Icon name="check" size={20} />
          {t('display.done')}
        </button>
      </div>
    </div>
  );
}
