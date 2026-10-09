import { useState } from 'react';
import { isOffline, usePos, type DiscountPreview } from '../state/store';
import type { DiscountKind } from '../data/types';
import { money, tableName } from '../state/calc';
import { useT, type MessageKey } from '../i18n';
import { Icon } from './Icon';
import { WhyOff } from './Figures';
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

/** What a staff discount is most often: the till's own short lists, a percent or the venue's money. */
const PRESETS: Record<'pct' | 'amt', readonly number[]> = { pct: [5, 10, 15, 20], amt: [2, 4, 5, 10] };
const SEGMENTS: { kind: DiscountKind; label: MessageKey }[] = [
  { kind: 'pct', label: 'discount.segPercent' },
  { kind: 'amt', label: 'discount.segAmount' },
  { kind: 'comp', label: 'discount.segComp' },
];
const MONO = "font-family:'JetBrains Mono',monospace;";

/**
 * The staff discount dialog with Offers & gift cards attached.
 *
 * A percent, an amount or a comp, and a reason from Offers' own list. Each
 * choice asks Adminium what it would take off (a dry run: nothing is saved),
 * and the button carries that figure — "Add discount −$3.78" — so nothing here
 * is the till's own sum. How much each role may give is the owner's to say:
 * over it, the server refuses and the dialog says how far this person may go,
 * in the value's own place. It never hides a choice on a guess.
 */
function OffersDiscount() {
  const s = usePos();
  const t = useT();
  const [kind, setKind] = useState<DiscountKind>('pct');
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [preview, setPreview] = useState<DiscountPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(null);
  const off = isOffline(s);
  const reasons = s.reasons ?? [];
  const chosen: Opt | null = kind === 'comp' ? { kind, value: 0 } : value === null ? null : { kind, value };

  const ask = (nextKind: DiscountKind, nextValue: number | null, why: string | null) => {
    setKind(nextKind);
    setValue(nextValue);
    setReason(why);
    setWords(null);
    setPreview(null);
    if ((nextKind !== 'comp' && nextValue === null) || why === null || off) return;
    setBusy(true);
    void s.previewDiscount(nextKind, nextKind === 'comp' ? 0 : (nextValue ?? 0), why).then((answer) => {
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
  // What it would take off: the staff line of Adminium's answer.
  const takes = preview !== null && preview.ok ? (preview.applied.find((line) => line.kind === 'staff')?.amount ?? null) : null;
  const shown = kind === 'comp' ? '100 %' : value === null ? '—' : kind === 'pct' ? `${String(value)} %` : money(value);
  const chip = (on: boolean) =>
    'flex:1;min-width:72px;height:52px;border-radius:13px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;border:1.5px solid ' +
    (on ? 'var(--accent)' : 'var(--border-strong)') +
    ';background:' +
    (on ? 'var(--accent-soft)' : 'var(--surface)') +
    ';color:' +
    (on ? 'var(--accent)' : 'var(--fg)') +
    ';';
  const caps = 'font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-muted);margin-bottom:10px;';

  return (
    <div onClick={s.closeDiscount} style={css('position:absolute;inset:0;z-index:214;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:14px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="staff-discount-title" className="pos-scroll" style={css('width:100%;max-width:520px;max-height:94%;overflow-y:auto;background:var(--surface);border-radius:22px;padding:22px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:16px;')}>
          <div style={css('flex:1;min-width:0;')}>
            <div id="staff-discount-title" style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>
              {t('discount.staffTitle')}
            </div>
            <div style={css('font-size:13px;color:var(--fg-muted);margin-top:2px;')}>
              {tableName(s.ticket.table, s.mode)} · #{s.ticket.number}
            </div>
          </div>
          <button className="pos-press" onClick={s.closeDiscount} aria-label={t('common.close')} style={css('width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
            <Icon name="x" size={19} />
          </button>
        </div>

        <div role="radiogroup" aria-labelledby="staff-discount-title" style={css('display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--surface-3);margin-bottom:16px;')}>
          {SEGMENTS.map((seg) => {
            const on = kind === seg.kind;
            return (
              <button key={seg.kind} role="radio" aria-checked={on} className="pos-press" onClick={() => ask(seg.kind, null, reason)} style={css('flex:1;height:44px;border-radius:11px;border:none;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:' + (on ? 'var(--surface)' : 'transparent') + ';color:' + (on ? 'var(--fg)' : 'var(--fg-muted)') + ';' + (on ? 'box-shadow:0 1px 3px rgba(10,10,20,.14);' : ''))}>
                {t(seg.label)}
              </button>
            );
          })}
        </div>

        <div id="staff-discount-what" style={css(caps + 'margin-bottom:4px;')}>
          {t(kind === 'pct' ? 'discount.percentOffTicket' : kind === 'amt' ? 'discount.amountOffTicket' : 'discount.compTicket')}
        </div>
        <div data-discount-value="" dir="ltr" aria-describedby={refusal === null ? undefined : 'staff-discount-refusal'} style={css('font-size:52px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin-bottom:12px;text-align:start;color:' + (refusal !== null ? 'var(--danger)' : 'var(--fg)') + ';' + MONO)}>
          {shown}
        </div>
        {kind !== 'comp' && (
          <div role="radiogroup" aria-labelledby="staff-discount-what" style={css('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;')}>
            {PRESETS[kind].map((one) => {
              const on = value === one;
              return (
                <button key={one} role="radio" aria-checked={on} className="pos-press" onClick={() => ask(kind, one, reason)} style={css(chip(on) + MONO)}>
                  {kind === 'pct' ? `${String(one)} %` : money(one)}
                </button>
              );
            })}
          </div>
        )}
        {/* The server's refusal, in the value's own place: how far this person may go, and who to ask. */}
        {refusal !== null && (
          <div id="staff-discount-refusal" role="alert" style={css('display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:13px;background:var(--danger-soft);color:var(--danger);font-size:14px;font-weight:700;margin-bottom:14px;')}>
            <Icon name="shield-alert" size={18} />
            <span>{refusal}</span>
          </div>
        )}

        <div id="offers-reason" style={css(caps)}>
          {t('discount.reason')}
        </div>
        <div role="radiogroup" aria-labelledby="offers-reason" style={css('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;')}>
          {s.reasons !== null && reasons.length === 0 && <div style={css('font-size:13.5px;color:var(--fg-muted);')}>{t('offers.noReasons')}</div>}
          {reasons.map((r) => {
            const on = reason === r.id;
            return (
              <button key={r.id} role="radio" aria-checked={on} className="pos-press" onClick={() => ask(kind, value, r.id)} style={css('font-size:13.5px;font-weight:700;min-height:44px;padding:8px 14px;border-radius:12px;cursor:pointer;font-family:inherit;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface-2)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                {r.label}
              </button>
            );
          })}
        </div>
        {chosen !== null && reason === null && <WhyOff>{t('offers.chooseReason')}</WhyOff>}

        <div style={css('display:flex;gap:10px;margin-top:12px;')}>
          <button className="pos-press" onClick={s.closeDiscount} style={css('flex:0 0 auto;height:56px;padding:0 20px;border-radius:15px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15.5px;font-weight:800;cursor:pointer;')}>
            {t('common.cancel')}
          </button>
          <button className="pos-press" disabled={!ready} onClick={apply} style={css('flex:1;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:12px;background:' + (ready ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (ready ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';cursor:' + (ready ? 'pointer' : 'not-allowed') + ';')}>
            <span>{t(busy ? 'offers.checking' : 'offers.addDiscount')}</span>
            {/* Adminium's figure for it, from the dry run. */}
            {takes !== null && !busy && (
              <span data-discount-takes="" dir="ltr" style={css(MONO)}>
                −{money(takes)}
              </span>
            )}
          </button>
        </div>
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
