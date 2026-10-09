import { useState } from 'react';
import { isOffline, usePos, type DiscountPreview } from '../state/store';
import type { DiscountKind } from '../data/types';
import { money } from '../state/calc';
import { useT, type MessageKey } from '../i18n';
import { Icon } from './Icon';
import { ReductionRows, WhyOff } from './Figures';
import { css } from './css';

interface Opt {
  kind: DiscountKind;
  value: number;
}

const OPTS: Opt[] = [
  { kind: 'pct', value: 10 },
  { kind: 'pct', value: 15 },
  { kind: 'pct', value: 20 },
  { kind: 'amt', value: 5 },
  { kind: 'comp', value: 0 },
];

const REASONS: MessageKey[] = [
  'discount.reasonManager',
  'discount.reasonLoyalty',
  'discount.reasonRecovery',
  'discount.reasonStaffMeal',
  'discount.reasonDamaged',
];

export function DiscountModal() {
  const s = usePos();
  const t = useT();
  // Why: picked before the discount itself, and saved with it (before, they could not be chosen).
  const [reason, setReason] = useState<MessageKey | null>(null);
  if (!s.discountOpen) return null;
  // With Offers, a staff discount is Offers' to give: its reasons, its ceiling, its figures.
  if (s.features.offers && s.connected) return <OffersDiscount />;

  /*
   * The label is rendered here and stored on the ticket as text, because it
   * goes on to be the receipt's discount row for a sale that is already closed
   * — a printed receipt does not restate itself when the till's language
   * changes. Discounts applied before a locale switch keep the wording they
   * were rung up in; the next one picks up the new locale.
   */
  const labelOf = (o: Opt): string =>
    o.kind === 'comp'
      ? t('discount.comp')
      : o.kind === 'pct'
        ? t('discount.pctOff', { pct: o.value })
        : t('discount.amountOff', { amount: money(o.value) });

  return (
    <div onClick={s.closeDiscount} style={css('position:absolute;inset:0;z-index:214;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} className="pos-scroll" style={css('width:100%;max-width:520px;max-height:86%;overflow-y:auto;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('discount.title')}</div>
          <button className="pos-press" onClick={s.closeDiscount} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:40px;height:40px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:10px;margin-bottom:18px;')}>
          {OPTS.map((o) => {
            const comp = o.kind === 'comp';
            const label = labelOf(o);
            return (
              <button key={o.kind + String(o.value)} className="pos-press" onClick={() => s.applyDiscount(o.kind, o.value, label, reason === null ? undefined : t(reason))} style={css('display:flex;align-items:center;gap:12px;padding:16px;border-radius:15px;border:1.5px solid ' + (comp ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'var(--border-strong)') + ';background:var(--surface);cursor:pointer;text-align:start;')}>
                <span style={css('width:40px;height:40px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + (comp ? 'var(--danger-soft)' : 'var(--accent-soft)') + ';color:' + (comp ? 'var(--danger)' : 'var(--accent)') + ';')}>
                  <Icon name={comp ? 'gift' : o.kind === 'pct' ? 'percent' : 'minus'} size={19} />
                </span>
                <span style={css('flex:1;text-align:start;')}>
                  <span style={css('display:block;font-size:16px;font-weight:800;')}>{label}</span>
                  <span style={css('display:block;font-size:12.5px;color:var(--fg-muted);')}>
                    {comp
                      ? t('discount.fullComp')
                      : o.kind === 'pct'
                        ? t('discount.percentageOff')
                        : t('discount.fixedAmount')}
                  </span>
                </span>
                <Icon name="chevron-right" size={18} color="var(--fg-subtle)" />
              </button>
            );
          })}
        </div>
        <div id="discount-reason" style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>{t('discount.reason')}</div>
        <div role="radiogroup" aria-labelledby="discount-reason" style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
          {REASONS.map((r) => {
            const on = reason === r;
            return (
              <button
                key={r}
                role="radio"
                aria-checked={on}
                className="pos-press"
                onClick={() => setReason(on ? null : r)}
                style={css('font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px;cursor:pointer;font-family:inherit;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface-2)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg-muted)') + ';')}
              >
                {t(r)}
              </button>
            );
          })}
        </div>
        {!!s.discount && (
          <button className="pos-press" onClick={s.clearDiscount} style={css('width:100%;height:52px;margin-top:18px;border-radius:14px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:15px;font-weight:800;cursor:pointer;')}>
            {t('discount.removeCurrent', { label: s.discount.label })}
          </button>
        )}
      </div>
    </div>
  );
}

const labelFor = (t: ReturnType<typeof useT>, o: Opt): string =>
  o.kind === 'comp' ? t('discount.comp') : o.kind === 'pct' ? t('discount.pctOff', { pct: o.value }) : t('discount.amountOff', { amount: money(o.value) });

/**
 * The discount sheet with Offers & gift cards attached.
 *
 * The reasons are Offers' own list. Choosing one and an amount asks Adminium
 * what the ticket would then come to (a dry run: nothing is saved) and shows
 * its answer; Apply saves exactly that. How much each role may give is the
 * owner's to say, so a discount over the ceiling is refused by the server and
 * the sheet says so in plain words — it never hides the button on a guess.
 */
function OffersDiscount() {
  const s = usePos();
  const t = useT();
  const [reason, setReason] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Opt | null>(null);
  const [preview, setPreview] = useState<DiscountPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(null);
  const off = isOffline(s);
  const reasons = s.reasons ?? [];

  const ask = (o: Opt | null, why: string | null) => {
    setChosen(o);
    setReason(why);
    setWords(null);
    setPreview(null);
    if (o === null || why === null || off) return;
    setBusy(true);
    void s.previewDiscount(o.kind, o.value, why).then((answer) => {
      setBusy(false);
      setPreview(answer);
    });
  };
  const apply = () => {
    if (chosen === null || reason === null) return;
    setBusy(true);
    void s.giveDiscount(chosen.kind, chosen.value, labelFor(t, chosen), reason).then((refusal) => {
      setBusy(false);
      setWords(refusal);
    });
  };
  const refusal = words ?? (preview !== null && !preview.ok ? preview.words : null);
  const ready = chosen !== null && reason !== null && preview !== null && preview.ok && !busy && !off;

  return (
    <div onClick={s.closeDiscount} style={css('position:absolute;inset:0;z-index:214;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} className="pos-scroll" style={css('width:100%;max-width:520px;max-height:86%;overflow-y:auto;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('discount.title')}</div>
          <button className="pos-press" onClick={s.closeDiscount} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:40px;height:40px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div id="offers-reason" style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>{t('discount.reason')}</div>
        <div role="radiogroup" aria-labelledby="offers-reason" style={css('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;')}>
          {s.reasons !== null && reasons.length === 0 && <div style={css('font-size:13.5px;color:var(--fg-muted);')}>{t('offers.noReasons')}</div>}
          {reasons.map((r) => {
            const on = reason === r.id;
            return (
              <button key={r.id} role="radio" aria-checked={on} className="pos-press" onClick={() => ask(chosen, r.id)} style={css('font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px;cursor:pointer;font-family:inherit;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface-2)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                {r.label}
              </button>
            );
          })}
        </div>
        <div role="radiogroup" aria-label={t('discount.title')} style={css('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;')}>
          {OPTS.map((o) => {
            const on = chosen !== null && chosen.kind === o.kind && chosen.value === o.value;
            return (
              <button key={o.kind + String(o.value)} role="radio" aria-checked={on} className="pos-press" onClick={() => ask(o, reason)} style={css('flex:1;min-width:96px;height:54px;border-radius:13px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg)') + ';')}>
                {labelFor(t, o)}
              </button>
            );
          })}
        </div>
        {chosen !== null && reason === null && <WhyOff>{t('offers.chooseReason')}</WhyOff>}
        {busy && <div role="status" style={css('font-size:13.5px;color:var(--fg-muted);margin-bottom:10px;')}>{t('offers.checking')}</div>}
        {/* Adminium's answer to the dry run: what the ticket would come to. Nothing here is the till's own sum. */}
        {preview !== null && preview.ok && (
          <div style={css('border:1px solid var(--border);border-radius:15px;padding:14px 16px;margin-bottom:12px;')}>
            <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>{t('offers.preview')}</div>
            <ReductionRows lines={preview.applied} />
            <div style={css('display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;')}>
              <span style={css('color:var(--fg-muted);font-weight:600;')}>{t('common.tax')}</span>
              <span style={css("font-family:'JetBrains Mono',monospace;font-weight:600;")}>{money(preview.tax)}</span>
            </div>
            <div style={css('display:flex;justify-content:space-between;font-size:16px;font-weight:800;')}>
              <span>{t('common.total')}</span>
              <span style={css("font-family:'JetBrains Mono',monospace;")}>{money(preview.total)}</span>
            </div>
          </div>
        )}
        {refusal !== null && (
          <div role="alert" style={css('padding:12px 14px;border-radius:13px;background:var(--danger-soft);color:var(--danger);font-size:14px;font-weight:700;margin-bottom:12px;')}>
            {refusal}
          </div>
        )}
        <button className="pos-press" disabled={!ready} onClick={apply} style={css('width:100%;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:16px;font-weight:800;background:' + (ready ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (ready ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';cursor:' + (ready ? 'pointer' : 'not-allowed') + ';')}>
          {t('offers.applyDiscount')}
        </button>
        {off && <WhyOff>{t('offers.discountOffline')}</WhyOff>}
        {!!s.discount && (
          <button className="pos-press" onClick={s.clearDiscount} style={css('width:100%;height:52px;margin-top:14px;border-radius:14px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:15px;font-weight:800;cursor:pointer;')}>
            {t('discount.removeCurrent', { label: s.discount.label })}
          </button>
        )}
      </div>
    </div>
  );
}
