import { usePos } from '../state/store';
import { CATS, FAVOURITES, MENU } from '../data/demo';
import { itemById, money } from '../state/calc';
import { Icon } from '../components/Icon';
import { MenuThumb } from '../components/MenuThumb';
import { css } from '../components/css';
import { TicketPane } from '../components/TicketPane';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function Register() {
  const s = usePos();
  const dark = s.theme === 'dark';
  const dense = s.menuDensity === 'dense';

  const q = s.search.trim().toLowerCase();
  const list = MENU.filter((m) => (q ? m.name.toLowerCase().indexOf(q) >= 0 : s.cat === 'all' || m.cat === s.cat));
  const imgH = dense ? '62px' : '98px';
  const rad = dense ? '13px' : '18px';

  const densSeg = (on: boolean) =>
    'width:42px;height:34px;border-radius:9px;border:none;background:' +
    (on ? 'var(--accent)' : 'transparent') +
    ';color:' +
    (on ? 'var(--accent-fg)' : 'var(--fg-muted)') +
    ';display:flex;align-items:center;justify-content:center;cursor:pointer;';

  return (
    <div className="reg-body">
      {/* LEFT: menu */}
      <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg);')}>
        {/* Quick add favourites */}
        <div className="pos-scroll" style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:12px 18px 2px;overflow-x:auto;')}>
          <span style={css('display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);flex-shrink:0;')}>
            <Icon name="star" size={14} />
            Quick add
          </span>
          {FAVOURITES.map((id) => {
            const m = itemById(id);
            if (!m) return null;
            return (
              <button
                key={id}
                className="pos-press"
                onClick={() => s.tapTile(id)}
                style={css('display:flex;align-items:center;gap:10px;height:54px;padding:0 16px 0 8px;border-radius:15px;border:1px solid var(--border);background:var(--surface);cursor:pointer;flex-shrink:0;box-shadow:var(--shadow);')}
              >
                <MenuThumb item={m} dark={dark} radius="11px" box="width:38px;height:38px;flex-shrink:0;" />
                <span>
                  <span style={css('display:block;font-size:14px;font-weight:700;line-height:1.15;')}>{m.name}</span>
                  <span style={css('display:block;font-size:12px;font-weight:700;' + MONO + 'color:var(--fg-muted);')}>{money(m.price)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Category row + density */}
        <div style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:12px 18px 14px;border-bottom:1px solid var(--border);')}>
          <div className="pos-scroll" style={css('flex:1;min-width:0;display:flex;gap:10px;overflow-x:auto;')}>
            {CATS.map((c) => {
              const on = s.cat === c.slug;
              const cnt = c.slug === 'all' ? MENU.length : MENU.filter((m) => m.cat === c.slug).length;
              return (
                <button
                  key={c.slug}
                  className="pos-press"
                  onClick={() => s.setCat(c.slug)}
                  style={css(
                    'display:flex;align-items:center;gap:8px;height:46px;padding:0 18px;border-radius:14px;border:1px solid ' +
                      (on ? 'transparent' : 'var(--border)') +
                      ';background:' +
                      (on ? 'var(--accent)' : 'var(--surface)') +
                      ';color:' +
                      (on ? 'var(--accent-fg)' : 'var(--fg)') +
                      ';font-size:15px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;',
                  )}
                >
                  <Icon name={c.icon} size={17} />
                  {c.name}
                  <span style={css('font-size:12px;font-weight:800;' + MONO + 'padding:1px 8px;border-radius:20px;background:' + (on ? 'rgba(255,255,255,.22)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={css('display:flex;gap:3px;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;padding:3px;flex-shrink:0;')}>
            <button className="pos-press" onClick={() => s.setDensity('cozy')} title="Comfortable" style={css(densSeg(!dense))}>
              <Icon name="layout-grid" size={17} />
            </button>
            <button className="pos-press" onClick={() => s.setDensity('dense')} title="Dense" style={css(densSeg(dense))}>
              <Icon name="grip" size={17} />
            </button>
          </div>
        </div>

        {/* Menu grid */}
        <div className="pos-scroll" style={css('flex:1;overflow-y:auto;padding:18px;')}>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fill, minmax(' + (dense ? '120px' : '166px') + ', 1fr));gap:' + (dense ? '10px' : '14px') + ';')}>
            {list.map((m) => {
              const sold = m.available === false || s.unavail.indexOf(m.id) >= 0;
              return (
                <button
                  key={m.id}
                  className="pos-tile"
                  onClick={() => s.tapTile(m.id)}
                  style={css('display:flex;flex-direction:column;text-align:left;padding:0;border:1px solid var(--border);border-radius:' + rad + ';background:var(--surface);cursor:' + (sold ? 'default' : 'pointer') + ';overflow:hidden;box-shadow:var(--shadow);opacity:' + (sold ? '.6' : '1') + ';')}
                >
                  <MenuThumb
                    item={m}
                    dark={dark}
                    radius="0"
                    box={'height:' + imgH + ';'}
                    overlay={
                      <>
                        {sold && (
                          <div style={css('position:absolute;inset:0;background:color-mix(in srgb, var(--surface) 62%, transparent);display:flex;align-items:center;justify-content:center;')}>
                            <span style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-muted);background:var(--surface);padding:5px 11px;border-radius:9px;box-shadow:var(--shadow);')}>
                              Sold out
                            </span>
                          </div>
                        )}
                        {!!m.mods && (
                          <span style={css('position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);')}>
                            <Icon name="sliders-horizontal" size={13} color="var(--fg-muted)" />
                          </span>
                        )}
                      </>
                    }
                  />
                  <div style={css('padding:' + (dense ? '8px 10px 9px' : '11px 12px 12px') + ';text-align:left;')}>
                    <div style={css('font-size:' + (dense ? '13px' : '15px') + ';font-weight:700;letter-spacing:-.01em;line-height:1.2;margin-bottom:' + (dense ? '3px' : '5px') + ';')}>{m.name}</div>
                    <div style={css('font-size:' + (dense ? '13px' : '15px') + ';font-weight:700;' + MONO + 'color:var(--fg-muted);')}>{money(m.price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: ticket */}
      <TicketPane />
    </div>
  );
}
