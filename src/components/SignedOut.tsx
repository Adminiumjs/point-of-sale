import { usePos } from '../state/store';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

/**
 * The session ended (a 401 on a save). Everything the till was saving waits in
 * the outbox, so the notice blocks the till rather than letting more changes
 * pile up unsaved, and the way out is to sign in again — a reload goes back
 * through Adminium's sign-in and the outbox picks up where it stopped.
 */
export function SignedOut() {
  const signedOut = usePos((s) => s.sync.signedOut);
  const t = useT();
  if (!signedOut) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="pos-signed-out-title" style={css('position:absolute;inset:0;z-index:300;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div style={css('width:100%;max-width:430px;background:var(--surface);border-radius:22px;padding:26px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:14px;')}>
          <div style={css('width:46px;height:46px;border-radius:13px;background:var(--warn-soft);color:var(--warn);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="lock" size={23} />
          </div>
          <div id="pos-signed-out-title" style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('sync.signedOut.title')}</div>
        </div>
        <p style={css('margin:0 0 20px;font-size:14.5px;color:var(--fg-muted);line-height:1.55;')}>{t('sync.signedOut.body')}</p>
        <button
          className="pos-press"
          autoFocus
          onClick={() => window.location.reload()}
          style={css('width:100%;height:52px;border-radius:14px;border:none;background:var(--accent);color:#fff;font-size:16px;font-weight:800;cursor:pointer;')}
        >
          {t('sync.signedOut.action')}
        </button>
      </div>
    </div>
  );
}
