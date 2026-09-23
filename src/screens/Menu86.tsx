import { usePos } from '../state/store';
import { source } from '../data/source';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { AuxHeader, MONO } from '../components/AuxHeader';
import { css } from '../components/css';

/** 86 / Menu availability (comp 802-816): switch an item off when it runs out, on when it is back. */
export function Menu86() {
  const s = usePos();
  const t = useT();
  const menu = source.menu();
  const off = menu.filter((m) => s.unavail.includes(m.id)).length;

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('m86.title')} sub={t('m86.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')}>
        <span style={css('margin-inline-start:auto;font-size:12.5px;font-weight:800;padding:5px 12px;border-radius:20px;background:var(--danger-soft);color:var(--danger);flex-shrink:0;' + MONO)}>
          {t('m86.count', { n: off })}
        </span>
      </AuxHeader>
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 24px;')}>
        <div style={css('max-width:640px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:10px;')}>
          {menu.map((m) => {
            const isOff = s.unavail.includes(m.id);
            return (
              <div key={m.id} style={css('display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:13px;border:1px solid var(--border);background:' + (isOff ? 'var(--surface-2)' : 'var(--surface)') + ';')}>
                <div style={css('flex:1;min-width:0;')}>
                  <div style={css('font-size:15px;font-weight:700;')}>{m.name}</div>
                  <div style={css('font-size:12.5px;color:var(--fg-muted);' + MONO)}>
                    {money(m.price)} · {t(isOff ? 'm86.off' : 'm86.available')}
                  </div>
                </div>
                <button
                  className="pos-press"
                  role="switch"
                  aria-checked={!isOff}
                  aria-label={m.name}
                  onClick={() => s.toggle86(m.id)}
                  style={css(
                    'width:52px;height:30px;border-radius:20px;flex-shrink:0;padding:3px;display:flex;align-items:center;cursor:pointer;border:none;background:' +
                      (isOff ? 'var(--surface-3)' : 'var(--pos)') +
                      ';justify-content:' +
                      (isOff ? 'flex-start' : 'flex-end') +
                      ';',
                  )}
                >
                  <span style={css('width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);')} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
