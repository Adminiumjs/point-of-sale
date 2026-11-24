import { useT } from '../i18n';
import { boxFor } from '../state/texts';
import { usePos } from '../state/store';
import { css } from './css';

/**
 * The box for texts on the till's own forms (taking a pickup order, enrolling
 * a member): the guest's own words, the same as the booking page's box, and a
 * line for the person at the till — ask first, tick only on a yes. It starts
 * unticked, is never needed to save, and is drawn only while texts can go at
 * all. A tick is recorded by Adminium as this staff member's record of the
 * guest's yes, in these words (`POST /texts/consent`).
 *
 * A mainland China number turns it off with the line that says why; a number
 * that cannot be read, ticked, says to check it. Neither stops the save.
 */
export function TillTextsBox({ id, mobile, checked, onChange }: { id: string; mobile: string; checked: boolean; onChange: (on: boolean) => void }) {
  const t = useT();
  const ready = usePos((s) => s.textsReady);
  if (ready !== true) return null;
  const shape = boxFor(mobile);
  if (shape === 'none') return null;
  const china = shape === 'china';
  const on = checked && !china;
  return (
    <div style={css('display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border-radius:13px;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface-2)') + ';' + (china ? 'opacity:.75;' : ''))}>
      <input
        id={id}
        type="checkbox"
        checked={on}
        disabled={china}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-sub ${id}-hint`}
        style={css('width:22px;height:22px;margin:1px 0 0;flex-shrink:0;accent-color:var(--accent);cursor:' + (china ? 'not-allowed' : 'pointer') + ';')}
      />
      <div style={css('flex:1;min-width:0;')}>
        <label htmlFor={id} style={css('display:block;font-size:14px;font-weight:800;cursor:' + (china ? 'not-allowed' : 'pointer') + ';')}>{t('guest.textsLabel')}</label>
        <div id={`${id}-sub`} style={css('font-size:12.5px;color:var(--fg-muted);margin-top:3px;line-height:1.45;')}>{t('guest.textsSub')}</div>
        <div id={`${id}-hint`} aria-live="polite" style={css('font-size:12.5px;margin-top:6px;line-height:1.45;font-weight:600;color:var(--fg-muted);')}>
          {t(china ? 'guest.textsNoChina' : 'guest.textsOptional')}
        </div>
        {on && shape === 'unreadable' && <div style={css('font-size:12.5px;margin-top:4px;font-weight:700;color:var(--warn);')}>{t('guest.textsCheckNumber')}</div>}
        {!china && <div style={css('font-size:12px;margin-top:6px;font-weight:800;color:var(--accent);')}>{t('texts.boxAsk')}</div>}
      </div>
    </div>
  );
}
