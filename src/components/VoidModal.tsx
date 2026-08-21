import { usePos } from '../state/store';
import { itemById } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

/* The typed confirmation is a fixed token, not copy: `confirmVoid` compares
   against it, so it stays VOID in every locale. */
const CONFIRM_WORD = 'VOID';

export function VoidModal() {
  const s = usePos();
  const t = useT();
  if (!s.voidOpen) return null;
  const vit = s.ticket.items.find((x) => x.key === s.voidKey);
  const vm = vit ? itemById(vit.id) : null;
  const desc =
    vm && vit
      ? vit.qty > 1
        ? t('void.confirmQty', { qty: vit.qty, name: vm.name })
        : t('void.confirmOne', { name: vm.name })
      : '';
  const can = s.voidText.trim().toUpperCase() === CONFIRM_WORD;
  // Split on the placeholder rather than paying for the emphasis with two
  // half-sentence keys nobody can translate in isolation.
  const [bodyBefore, bodyAfter] = t('void.body').split('{word}');

  return (
    <div onClick={s.closeVoid} style={css('position:absolute;inset:0;z-index:220;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} style={css('width:100%;max-width:430px;background:var(--surface);border-radius:22px;padding:26px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:14px;')}>
          <div style={css('width:46px;height:46px;border-radius:13px;background:var(--danger-soft);color:var(--danger);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="alert-triangle" size={23} />
          </div>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('void.title')}</div>
        </div>
        <p style={css('margin:0 0 18px;font-size:14.5px;color:var(--fg-muted);line-height:1.55;')}>
          {desc} {bodyBefore}
          <span style={css(MONO + 'font-weight:800;color:var(--fg);')}>{CONFIRM_WORD}</span>
          {bodyAfter}
        </p>
        <input
          value={s.voidText}
          onChange={(e) => s.setVoidText(e.target.value)}
          placeholder={CONFIRM_WORD}
          aria-label={t('void.title')}
          style={css('width:100%;height:56px;padding:0 16px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface-2);font-size:17px;font-weight:700;' + MONO + 'letter-spacing:.1em;color:var(--fg);outline:none;margin-bottom:18px;')}
        />
        <div style={css('display:flex;gap:10px;')}>
          <button className="pos-press" onClick={s.closeVoid} style={css('flex:1;height:58px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:800;cursor:pointer;')}>
            {t('common.cancel')}
          </button>
          <button
            className="pos-press"
            onClick={s.confirmVoid}
            style={css('flex:1;height:58px;border-radius:14px;border:none;background:' + (can ? 'var(--danger)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--danger-fg)' : 'var(--fg-subtle)') + ';font-size:16px;font-weight:800;cursor:' + (can ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:8px;')}
          >
            <Icon name="trash-2" size={18} />
            {t('void.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
