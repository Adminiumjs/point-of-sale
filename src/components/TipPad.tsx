import { useEffect } from 'react';
import { usePos } from '../state/store';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/**
 * The custom-tip pad (COMP 621-633, logic 1992-1995): the guest's own amount,
 * typed on a keypad. The customer display opens it, and so does Payment's
 * Custom — one pad, so the two screens offer the same four tip buttons (the
 * plan's fix 7).
 */
export function TipPad() {
  const s = usePos();
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') usePos.getState().closeTipPad();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (s.tipPad === null) return null;
  const value = parseFloat(s.tipPad || '0') || 0;
  return (
    <div onClick={s.closeTipPad} style={css('position:absolute;inset:0;z-index:216;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div role="dialog" aria-modal="true" aria-labelledby="tip-pad-title" onClick={(e) => e.stopPropagation()} style={css('width:100%;max-width:360px;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:4px;')}>
          <div id="tip-pad-title" style={css('font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{t('display.customTip')}</div>
          <button className="pos-press" onClick={s.closeTipPad} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:38px;height:38px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div role="status" style={css('text-align:center;margin:10px 0 18px;font-size:52px;font-weight:800;letter-spacing:-.02em;' + MONO)}>{money(value)}</div>
        <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px;')}>
          {KEYS.map((k) => (
            <button key={k} className="pos-press" onClick={() => s.tipPadPush(k)} aria-label={k === 'back' ? t('display.backspace') : undefined} style={css('height:58px;border-radius:13px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:23px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;' + MONO)}>
              {k === 'back' ? <Icon name="delete" size={21} className="rtl-flip" /> : k}
            </button>
          ))}
        </div>
        <button className="pos-press" onClick={s.applyTipPad} style={css('width:100%;height:60px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
          <Icon name="hand-coins" size={19} />
          {t('display.addTip')}
        </button>
      </div>
    </div>
  );
}
