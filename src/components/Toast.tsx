import { usePos } from '../state/store';
import { Icon } from './Icon';
import { css } from './css';

export function Toast() {
  const toast = usePos((s) => s.toast);
  if (!toast) return null;
  const tone =
    toast.kind === 'error'
      ? 'background:var(--danger);color:#fff;'
      : toast.kind === 'success'
        ? 'background:var(--pos);color:#fff;'
        : 'background:var(--fg);color:var(--bg);';
  const icon = toast.kind === 'error' ? 'x-circle' : toast.kind === 'success' ? 'check-circle-2' : 'bell';
  return (
    <div
      style={css(
        'position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:260;display:flex;align-items:center;gap:10px;padding:14px 20px;border-radius:14px;font-size:15px;font-weight:800;box-shadow:0 12px 34px rgba(10,10,20,.3);animation:pos-toast .24s cubic-bezier(.2,.8,.2,1);' +
          tone,
      )}
    >
      <Icon name={icon} size={18} />
      {toast.msg}
    </div>
  );
}
