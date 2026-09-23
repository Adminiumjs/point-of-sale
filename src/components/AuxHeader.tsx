import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { css } from './css';

/**
 * The header of the till's own screens (Refund, Staff, 86, Reservations): a
 * Back button, the title and a line under it, and whatever the screen puts on
 * the right. The comp draws the same header on each of them.
 */
export function AuxHeader({
  title,
  sub,
  onBack,
  backLabel,
  children,
  wrap = false,
}: {
  title: string;
  sub?: string;
  onBack: () => void;
  backLabel: string;
  children?: ReactNode;
  /** Reservations' header wraps its day tabs onto a second row. */
  wrap?: boolean;
}) {
  return (
    <header
      style={css(
        'flex-shrink:0;min-height:70px;display:flex;align-items:center;gap:14px;padding:' +
          (wrap ? '12px 18px' : '0 18px') +
          ';' +
          (wrap ? 'flex-wrap:wrap;' : '') +
          'background:var(--surface);border-bottom:1px solid var(--border);',
      )}
    >
      <button
        className="pos-press"
        onClick={onBack}
        aria-label={backLabel}
        // Reservations' wrapping header draws a smaller Back (COMP 822: 46 px, 15/11, r13, 14.5 px).
        style={css(
          'display:flex;align-items:center;gap:9px;' +
            (wrap ? 'height:46px;padding:0 15px 0 11px;border-radius:13px;font-size:14.5px;' : 'height:50px;padding:0 16px 0 12px;border-radius:14px;font-size:15px;') +
            'border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-weight:700;cursor:pointer;flex-shrink:0;',
        )}
      >
        <Icon name="arrow-left" size={19} className="rtl-flip" />
        <span className="aux-back-label">{backLabel}</span>
      </button>
      <div style={css('min-width:0;')}>
        <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;')}>{title}</div>
        {sub !== undefined && <div style={css('font-size:12.5px;color:var(--fg-muted);')}>{sub}</div>}
      </div>
      {children}
    </header>
  );
}

/** A screen's section label: small capitals over a list. */
export function Caps({ children }: { children: ReactNode }) {
  return <div style={css('font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:12px;')}>{children}</div>;
}

export const MONO = "font-family:'JetBrains Mono',monospace;";
