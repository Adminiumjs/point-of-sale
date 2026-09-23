import { useEffect, useState } from 'react';
import { usePos } from '../state/store';
import { roleName } from '../state/calc';
import { useI18n, useT } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader } from '../components/AuxHeader';
import { css } from '../components/css';

/** The manifest's `roles` option list: the roles a staff row may carry. */
export const STAFF_ROLES = ['Barista', 'Shift lead'] as const;

const rowBtn =
  'height:46px;padding:0 15px;border-radius:12px;border:1px solid var(--border-strong);font-size:13.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:7px;flex-shrink:0;';

/**
 * Staff & time clock (comp 785-800, D61/DP20): who works here, who is on
 * shift, clock in and out, add and deactivate. There is no PIN sign-in yet, so
 * "PINs" is not in the title and "Reset PIN" is not drawn.
 */
export function StaffClock() {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  // A second tap confirms a deactivation; it lapses after a few seconds.
  useEffect(() => {
    if (confirming === null) return;
    const timer = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);
  const time = (ms: number) => date(new Date(ms), { hour: 'numeric', minute: '2-digit' });
  const onShift = s.roster.filter((p) => s.clock.some((c) => c.staffId === p.id)).length;

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('staff.title')} sub={t('staff.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')}>
        <span className="aux-chip" style={css('margin-inline-start:auto;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;padding:7px 13px;border-radius:20px;background:var(--pos-soft);color:var(--pos);flex-shrink:0;')}>
          <Icon name="users" size={15} />
          {t('staff.onShift', { n: onShift })}
        </span>
        <button className="pos-press" onClick={() => setAdding(true)} style={css('height:48px;padding:0 18px;border-radius:13px;border:none;background:var(--accent);color:var(--accent-fg);font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;flex-shrink:0;')}>
          <Icon name="user-plus" size={17} />
          <span className="aux-back-label">{t('staff.add')}</span>
        </button>
      </AuxHeader>
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 24px;')}>
        <ul style={css('list-style:none;margin:0 auto;padding:0;max-width:680px;display:flex;flex-direction:column;gap:11px;')}>
          {s.roster.length === 0 && <li style={css('text-align:center;padding:36px 20px;font-size:14px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;')}>{t('staff.empty')}</li>}
          {s.roster.map((p) => {
            const entry = s.clock.find((c) => c.staffId === p.id);
            const on = entry !== undefined;
            const out = s.clockedOutAt[p.id];
            const last = on ? t('staff.since', { time: time(entry.since) }) : out !== undefined ? t('staff.outAt', { time: time(out) }) : t('staff.clockedOut');
            const confirm = confirming === p.id;
            return (
              <li key={p.id} className="staff-row" style={css('display:flex;align-items:center;flex-wrap:wrap;gap:14px;padding:15px 16px;border-radius:16px;background:var(--surface);border:1px solid var(--border);')}>
                <div aria-hidden="true" style={css('width:46px;height:46px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;background:' + (on ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}>
                  {p.initials}
                </div>
                <div style={css('flex:1;min-width:160px;')}>
                  <div style={css('display:flex;align-items:center;gap:9px;flex-wrap:wrap;')}>
                    <span style={css('font-size:16px;font-weight:700;')}>{p.name}</span>
                    <span style={css('display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:20px;background:' + (on ? 'var(--pos-soft)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--pos)' : 'var(--fg-muted)') + ';')}>
                      <span style={css('width:7px;height:7px;border-radius:50%;background:' + (on ? 'var(--pos)' : 'var(--fg-subtle)') + ';')} />
                      {t(on ? 'staff.statusOn' : 'staff.statusOff')}
                    </span>
                  </div>
                  <div style={css('font-size:13px;color:var(--fg-muted);margin-top:2px;')}>{[p.role === '' ? null : roleName(p.role), last].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={css('display:flex;gap:8px;')}>
                  <button className="pos-press" onClick={() => (on ? s.clockOut(p.id) : s.clockIn(p.id))} style={css(rowBtn + 'background:var(--surface-2);color:var(--fg);')}>
                    <Icon name={on ? 'log-out' : 'log-in'} size={16} />
                    {t(on ? 'staff.clockOut' : 'staff.clockIn')}
                  </button>
                  <button
                    className="pos-press"
                    onClick={() => {
                      if (confirm) {
                        setConfirming(null);
                        s.deactivateStaff(p.id);
                      } else setConfirming(p.id);
                    }}
                    aria-label={confirm ? undefined : t('staff.deactivateName', { name: p.name })}
                    style={css(rowBtn + (confirm ? 'background:var(--danger);color:var(--danger-fg);border-color:transparent;' : 'background:var(--surface);color:var(--fg);'))}
                  >
                    <Icon name="user-minus" size={16} />
                    {t(confirm ? 'staff.confirmDeactivate' : 'staff.deactivate')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {adding && <AddStaffSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddStaffSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const addStaff = usePos((s) => s.addStaff);
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(STAFF_ROLES[0]);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const can = name.trim() !== '' && !saving;
  const input = 'width:100%;height:50px;padding:0 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;';
  const label = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:6px;';
  const submit = async () => {
    if (!can) return;
    setSaving(true);
    const ok = await addStaff({ name, role, email });
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <>
      <div onClick={onClose} style={css('position:absolute;inset:0;z-index:210;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div role="dialog" aria-modal="true" aria-labelledby="add-staff-title" className="pos-scroll" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:211;width:min(460px, calc(100% - 32px));max-height:88%;overflow-y:auto;background:var(--surface);border-radius:24px;padding:22px;box-shadow:0 24px 60px rgba(10,10,20,.3);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="user-plus" size={21} />
          </div>
          <div id="add-staff-title" style={css('flex:1;min-width:0;font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{t('staff.addTitle')}</div>
          <button className="pos-press" onClick={onClose} aria-label={t('common.close')} style={css('width:40px;height:40px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:13px;')}>
          <div>
            <label htmlFor="staff-name" style={css(label)}>{t('staff.name')}</label>
            <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" style={css(input)} />
          </div>
          <div>
            <div id="staff-role" style={css(label)}>{t('staff.role')}</div>
            <div role="radiogroup" aria-labelledby="staff-role" style={css('display:flex;flex-wrap:wrap;gap:7px;')}>
              {STAFF_ROLES.map((r) => (
                <button key={r} role="radio" aria-checked={role === r} className="pos-press" onClick={() => setRole(r)} style={css('height:44px;padding:0 16px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;border:1.5px solid ' + (role === r ? 'var(--accent)' : 'var(--border)') + ';background:' + (role === r ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (role === r ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                  {roleName(r)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="staff-email" style={css(label)}>{t('staff.email')}</label>
            <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('staff.emailHint')} autoComplete="off" style={css(input)} />
          </div>
        </div>
        <div style={css('display:flex;gap:9px;margin-top:20px;')}>
          <button className="pos-press" onClick={onClose} style={css('width:120px;height:56px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;')}>
            {t('common.cancel')}
          </button>
          <button className="pos-press" disabled={!can} onClick={() => void submit()} style={css('flex:1;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';background:' + (can ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}>
            <Icon name="check" size={17} />
            {t('staff.addConfirm')}
          </button>
        </div>
      </div>
    </>
  );
}
