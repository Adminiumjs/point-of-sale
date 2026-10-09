/**
 * The small pieces every screen that shows a ticket's money shares.
 *
 * A figure on screen is Adminium's, or it is the till's own estimate shown
 * until Adminium's answer is in — and then it says so, with the word
 * "Estimate" beside "Total". The reductions (a code, an offer, a staff
 * discount) are Adminium's lines, one row each.
 */
import type { AppliedLine } from '../data/types';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

/** "Total", and beside it "Estimate" while the figures are the till's own. */
export function TotalLabel({ estimate, style = 'font-size:15px;font-weight:800;' }: { estimate: boolean; style?: string }) {
  const t = useT();
  return (
    <span style={css('display:inline-flex;align-items:baseline;gap:8px;' + style)}>
      {t('common.total')}
      {estimate && (
        <span data-estimate="" style={css('font-size:12px;font-weight:600;color:var(--fg-muted);')}>
          {t('common.estimate')}
        </span>
      )}
    </span>
  );
}

/** The reductions Adminium applied, a row each; a row that can be taken off has its ×. */
export function ReductionRows({ lines, onRemove, size = 14 }: { lines: readonly AppliedLine[]; onRemove?: (line: AppliedLine) => (() => void) | undefined; size?: number }) {
  const t = useT();
  return (
    <>
      {lines.map((line, i) => {
        const remove = onRemove?.(line);
        return (
          <div key={line.kind + line.name + String(i)} style={css('display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:' + String(size) + 'px;margin-bottom:8px;color:var(--pos);')}>
            <span style={css('display:inline-flex;align-items:center;gap:6px;font-weight:700;min-width:0;')}>
              <Icon name="tag" size={size} />
              <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{line.name}</span>
              {remove !== undefined && (
                <button className="pos-press" onClick={remove} aria-label={t('offers.removeLine', { name: line.name })} style={css('width:20px;height:20px;border-radius:6px;border:none;background:transparent;color:var(--fg-subtle);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
                  <Icon name="x" size={13} />
                </button>
              )}
            </span>
            <span style={css(MONO + 'font-weight:700;')}>−{money(line.amount)}</span>
          </div>
        );
      })}
    </>
  );
}

/** One line under a control that is off, saying why (offline, mostly). */
export function WhyOff({ children }: { children: string }) {
  return (
    <div role="note" style={css('font-size:12.5px;font-weight:600;color:var(--fg-muted);margin-top:6px;')}>
      {children}
    </div>
  );
}
