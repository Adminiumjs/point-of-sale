import { usePos } from '../state/store';
import type { DiscountKind } from '../data/types';
import { money } from '../state/calc';
import { useT, type MessageKey } from '../i18n';
import { Icon } from './Icon';
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
  if (!s.discountOpen) return null;

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
              <button key={o.kind + String(o.value)} className="pos-press" onClick={() => s.applyDiscount(o.kind, o.value, label)} style={css('display:flex;align-items:center;gap:12px;padding:16px;border-radius:15px;border:1.5px solid ' + (comp ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'var(--border-strong)') + ';background:var(--surface);cursor:pointer;text-align:start;')}>
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
        <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>{t('discount.reason')}</div>
        <div style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
          {REASONS.map((r) => (
            <span key={r} style={css('font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px;background:var(--surface-2);border:1px solid var(--border);color:var(--fg-muted);')}>
              {t(r)}
            </span>
          ))}
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
