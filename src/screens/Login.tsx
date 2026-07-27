import { usePos, curStaffOf } from '../state/store';
import { STAFF } from '../data/demo';
import { money } from '../state/calc';
import { Icon } from './../components/Icon';
import { css } from './../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

const PAD: { t?: string; kind: 'num' | 'clear' | 'back' }[] = [
  { t: '1', kind: 'num' },
  { t: '2', kind: 'num' },
  { t: '3', kind: 'num' },
  { t: '4', kind: 'num' },
  { t: '5', kind: 'num' },
  { t: '6', kind: 'num' },
  { t: '7', kind: 'num' },
  { t: '8', kind: 'num' },
  { t: '9', kind: 'num' },
  { kind: 'clear' },
  { t: '0', kind: 'num' },
  { kind: 'back' },
];

export function Login() {
  const s = usePos();
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = curStaffOf(s).name.split(' ')[0];

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:28px;')}>
      <div style={css('width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;')}>
        <div style={css('width:64px;height:64px;border-radius:19px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:32px;letter-spacing:-.03em;box-shadow:0 8px 24px color-mix(in srgb, var(--accent) 42%, transparent);margin-bottom:18px;')}>
          D
        </div>
        <div style={css('font-size:26px;font-weight:800;letter-spacing:-.03em;')}>Daybreak Coffee</div>
        <div style={css('font-size:14.5px;color:var(--fg-muted);margin-top:4px;font-weight:500;')}>{greet} — tap in to start your shift</div>

        {s.loginStep === 'pin' && (
          <div style={css('width:100%;margin-top:26px;')}>
            <div style={css('display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;')}>
              {STAFF.map((st) => {
                const on = s.staffSel === st.id;
                return (
                  <button
                    key={st.id}
                    className="pos-press"
                    onClick={() => s.selStaff(st.id)}
                    style={css(
                      'flex:1;min-width:120px;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:15px;border:1.5px solid ' +
                        (on ? 'var(--accent)' : 'var(--border)') +
                        ';background:' +
                        (on ? 'var(--accent-soft)' : 'var(--surface)') +
                        ';cursor:pointer;',
                    )}
                  >
                    <div style={css('width:38px;height:38px;border-radius:11px;flex-shrink:0;background:' + (on ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;')}>
                      {st.initials}
                    </div>
                    <div style={css('text-align:left;line-height:1.2;')}>
                      <div style={css('font-size:13.5px;font-weight:700;')}>{st.name}</div>
                      <div style={css('font-size:11px;color:var(--fg-muted);')}>{st.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={css('display:flex;justify-content:center;gap:14px;' + (s.pinErr ? 'animation:pos-shake .4s;' : ''))}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={css(
                    'width:16px;height:16px;border-radius:50%;' +
                      (i < s.pin.length
                        ? 'background:' + (s.pinErr ? 'var(--danger)' : 'var(--accent)') + ';'
                        : 'background:transparent;border:2px solid var(--border-strong);'),
                  )}
                />
              ))}
            </div>
            <div style={css('text-align:center;font-size:12.5px;margin:12px 0 16px;min-height:16px;color:' + (s.pinErr ? 'var(--danger)' : 'var(--fg-muted)') + ';font-weight:600;')}>
              {s.pinErr ? 'Incorrect PIN — try again' : "Enter " + firstName + "'s 4-digit PIN"}
            </div>

            <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:10px;')}>
              {PAD.map((k, i) => (
                <button
                  key={i}
                  className="pos-press"
                  onClick={() => s.pinPush(k.kind === 'num' ? (k.t as string) : k.kind)}
                  style={css("height:62px;border-radius:15px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:24px;font-weight:700;" + MONO + "cursor:pointer;display:flex;align-items:center;justify-content:center;")}
                >
                  {k.kind === 'back' ? (
                    <Icon name="delete" size={22} />
                  ) : k.kind === 'clear' ? (
                    <span style={css("font-size:15px;font-weight:700;font-family:'Manrope';")}>Clear</span>
                  ) : (
                    k.t
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {s.loginStep === 'drawer' && (
          <div style={css('width:100%;margin-top:26px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:var(--shadow);')}>
            <div style={css('display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;')}>
              <Icon name="calculator" size={19} color="var(--accent)" />
              Open shift · count drawer
            </div>
            <div style={css('font-size:13.5px;color:var(--fg-muted);margin-top:6px;line-height:1.5;')}>
              Count the cash in the drawer to start the shift. This becomes the opening float.
            </div>
            <div style={css('text-align:center;margin:22px 0;')}>
              <div style={css('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-subtle);')}>Starting cash</div>
              <div style={css('font-size:52px;font-weight:800;' + MONO + 'letter-spacing:-.02em;margin-top:4px;')}>{money(s.drawer)}</div>
            </div>
            <div style={css('display:flex;gap:8px;margin-bottom:14px;')}>
              <button className="pos-press" onClick={() => s.drawerAdj(-10)} style={css('flex:1;height:56px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface-2);font-size:20px;font-weight:800;cursor:pointer;color:var(--fg);')}>
                −$10
              </button>
              <button className="pos-press" onClick={() => s.drawerAdj(10)} style={css('flex:1;height:56px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface-2);font-size:20px;font-weight:800;cursor:pointer;color:var(--fg);')}>
                +$10
              </button>
            </div>
            <div style={css('display:flex;gap:8px;margin-bottom:18px;')}>
              {[150, 200, 250].map((v) => {
                const on = s.drawer === v;
                return (
                  <button
                    key={v}
                    className="pos-press"
                    onClick={() => s.drawerPreset(v)}
                    style={css(
                      'flex:1;height:48px;border-radius:12px;border:1.5px solid ' +
                        (on ? 'var(--accent)' : 'var(--border-strong)') +
                        ';background:' +
                        (on ? 'var(--accent-soft)' : 'var(--surface-2)') +
                        ';color:' +
                        (on ? 'var(--accent)' : 'var(--fg)') +
                        ';font-size:15px;font-weight:800;' + MONO + 'cursor:pointer;',
                    )}
                  >
                    {money(v)}
                  </button>
                );
              })}
            </div>
            <button className="pos-press" onClick={s.openShift} style={css('width:100%;height:64px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-size:18px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;')}>
              <Icon name="unlock" size={20} />
              Open shift
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
