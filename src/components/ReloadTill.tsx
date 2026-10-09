import { usePos } from '../state/store';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';
import { useDialog } from './useDialog';

/**
 * "Reload the till" — over everything, and not to be dismissed.
 *
 * The till's gift cards were brought into Offers & gift cards while this till
 * was open, and it has just tried to write to the old card tables, which are
 * closed. Until it reloads it would go on offering screens whose every save
 * is refused.
 */
export function ReloadTill() {
  const must = usePos((s) => s.mustReload);
  if (!must) return null;
  return <ReloadDialog />;
}

function ReloadDialog() {
  const t = useT();
  // Focus moves in and stays in: nothing behind it can be reached, and there is no way out but the reload.
  const dialog = useDialog<HTMLDivElement>();
  return (
    <div ref={dialog} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={t('cards.reload')} style={css('position:absolute;inset:0;z-index:400;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;')}>
      <div style={css('width:100%;max-width:420px;background:var(--surface);border-radius:22px;padding:28px;text-align:center;box-shadow:0 24px 60px rgba(10,10,20,.32);')}>
        <Icon name="rotate-ccw" size={34} color="var(--accent)" />
        <div style={css('font-size:20px;font-weight:800;margin-top:12px;')}>{t('cards.reload')}</div>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:8px;line-height:1.5;')}>{t('cards.reloadBody')}</div>
        <button className="pos-press" onClick={() => window.location.reload()} style={css('width:100%;height:56px;margin-top:20px;border-radius:15px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;')}>
          {t('cards.reload')}
        </button>
      </div>
    </div>
  );
}
