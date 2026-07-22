import { usePos } from '../state/store';
import type { DiscountKind } from '../data/types';
import { Icon } from './Icon';
import { css } from './css';

interface Opt {
  kind: DiscountKind;
  value: number;
  label: string;
}

const OPTS: Opt[] = [
  { kind: 'pct', value: 10, label: '10% off' },
  { kind: 'pct', value: 15, label: '15% off' },
  { kind: 'pct', value: 20, label: '20% off' },
  { kind: 'amt', value: 5, label: '$5.00 off' },
  { kind: 'comp', value: 0, label: 'Comp · 100%' },
];

const REASONS = ['Manager comp', 'Loyalty member', 'Service recovery', 'Staff meal', 'Damaged item'];

export function DiscountModal() {
  const s = usePos();
  if (!s.discountOpen) return null;

  return (
    <div onClick={s.closeDiscount} style={css('position:absolute;inset:0;z-index:214;background:rgba(10,10,15,.5);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} className="pos-scroll" style={css('width:100%;max-width:520px;max-height:86%;overflow-y:auto;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>Discount &amp; comps</div>
          <button className="pos-press" onClick={s.closeDiscount} style={css('margin-left:auto;width:40px;height:40px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:10px;margin-bottom:18px;')}>
          {OPTS.map((o) => {
            const comp = o.kind === 'comp';
            return (
              <button key={o.label} className="pos-press" onClick={() => s.applyDiscount(o.kind, o.value, o.label)} style={css('display:flex;align-items:center;gap:12px;padding:16px;border-radius:15px;border:1.5px solid ' + (comp ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'var(--border-strong)') + ';background:var(--surface);cursor:pointer;text-align:left;')}>
                <span style={css('width:40px;height:40px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + (comp ? 'var(--danger-soft)' : 'var(--accent-soft)') + ';color:' + (comp ? 'var(--danger)' : 'var(--accent)') + ';')}>
                  <Icon name={comp ? 'gift' : o.kind === 'pct' ? 'percent' : 'minus'} size={19} />
                </span>
                <span style={css('flex:1;text-align:left;')}>
                  <span style={css('display:block;font-size:16px;font-weight:800;')}>{o.label}</span>
                  <span style={css('display:block;font-size:12.5px;color:var(--fg-muted);')}>{comp ? 'Full comp' : o.kind === 'pct' ? 'Percentage off' : 'Fixed amount'}</span>
                </span>
                <Icon name="chevron-right" size={18} color="var(--fg-subtle)" />
              </button>
            );
          })}
        </div>
        <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>Reason (logged on the shift)</div>
        <div style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
          {REASONS.map((r) => (
            <span key={r} style={css('font-size:13px;font-weight:700;padding:8px 13px;border-radius:11px;background:var(--surface-2);border:1px solid var(--border);color:var(--fg-muted);')}>
              {r}
            </span>
          ))}
        </div>
        {!!s.discount && (
          <button className="pos-press" onClick={s.clearDiscount} style={css('width:100%;height:52px;margin-top:18px;border-radius:14px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:15px;font-weight:800;cursor:pointer;')}>
            Remove current · {s.discount.label}
          </button>
        )}
      </div>
    </div>
  );
}
