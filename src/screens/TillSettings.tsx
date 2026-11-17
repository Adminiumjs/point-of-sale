import { useEffect, type KeyboardEvent } from 'react';

import { usePos } from '../state/store';
import { usableReaders } from '../data/payments';
import { useI18n, useT } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader, Caps } from '../components/AuxHeader';
import { css } from '../components/css';

/**
 * Till settings: this till's own choices, kept on this device. Today one:
 * which card reader it takes cards on — a reader paired in Adminium, or none
 * (a standalone terminal). Another till chooses its own. Shown only while the
 * till takes payments through Adminium, to the people who may change the
 * till's settings.
 */
export function TillSettings() {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  useEffect(() => {
    void usePos.getState().loadReaders();
    usePos.setState({ tillSaved: false });
  }, []);
  const readers = s.readers === null ? null : usableReaders(s.readers, s.payments);
  const choices = readers === null ? [] : [...readers.map((r) => ({ id: r.id as string | null, reader: r })), { id: null as string | null, reader: null }];
  const chosen = readers !== null && s.readerId !== null && readers.some((r) => r.id === s.readerId) ? s.readerId : null;
  const pick = (id: string | null) => s.pickReader(id);
  const arrows = (e: KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const back = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rtl ? -step : step;
    const next = choices[(i + back + choices.length) % choices.length]!;
    pick(next.id);
    document.getElementById(`till-reader-${next.id ?? 'none'}`)?.focus();
  };
  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('till.title')} sub={t('till.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')} />
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px;')}>
        <div style={css('max-width:640px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px;')}>
          <Caps>{t('till.readerHead')}</Caps>
          {readers === null ? (
            <div role="status" style={css('font-size:14px;color:var(--fg-muted);padding:12px 0;')}>{t('till.loading')}</div>
          ) : readers.length === 0 ? (
            <div data-no-readers="" style={css('display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;border:1.5px dashed var(--border-strong);font-size:14px;font-weight:600;color:var(--fg-muted);line-height:1.5;')}>
              <Icon name="info" size={18} />
              <span>{t('till.noReaders')}</span>
            </div>
          ) : (
            <div role="radiogroup" aria-label={t('till.readerHead')} style={css('display:flex;flex-direction:column;gap:8px;')}>
              {choices.map((c, i) => {
                const on = c.id === chosen;
                const r = c.reader;
                return (
                  <button
                    key={c.id ?? 'none'}
                    id={`till-reader-${c.id ?? 'none'}`}
                    role="radio"
                    aria-checked={on}
                    tabIndex={on || (chosen === null && c.id === null) ? 0 : -1}
                    data-reader={c.id ?? 'none'}
                    className="pos-press"
                    onClick={() => pick(c.id)}
                    onKeyDown={(e) => arrows(e, i)}
                    style={css('display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px;border-radius:14px;font-family:inherit;text-align:start;cursor:pointer;color:var(--fg);border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';')}
                  >
                    <span aria-hidden="true" style={css('width:22px;height:22px;flex-shrink:0;border-radius:999px;border:2px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';display:flex;align-items:center;justify-content:center;')}>
                      {on && <span style={css('width:10px;height:10px;border-radius:999px;background:var(--accent);')} />}
                    </span>
                    <Icon name={r === null ? 'credit-card' : 'smartphone'} size={18} color="var(--fg-muted)" />
                    <span style={css('flex:1;min-width:0;')}>
                      <span style={css('display:block;font-size:15px;font-weight:800;')}>{r === null ? t('till.none') : <bdi>{r.label}</bdi>}</span>
                      {r !== null && r.locationName !== null && <span style={css('display:block;font-size:12.5px;color:var(--fg-muted);')}>{r.locationName}</span>}
                    </span>
                    {r !== null && r.mode === 'test' && <span style={css('font-size:11.5px;font-weight:800;padding:2px 9px;border-radius:999px;background:var(--warn-soft);color:var(--warn);')}>{t('till.test')}</span>}
                    {r !== null && (
                      <span style={css('display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--fg-muted);white-space:nowrap;')}>
                        <span aria-hidden="true" style={css('width:8px;height:8px;border-radius:999px;background:' + (r.online ? 'var(--pos)' : 'var(--warn)') + ';')} />
                        {r.online
                          ? t('reader.online')
                          : r.lastSeenAt === null
                            ? t('reader.offline')
                            : t('reader.offlineSince', { time: date(new Date(r.lastSeenAt), { hour: 'numeric', minute: '2-digit' }) })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div style={css('margin-top:14px;font-size:13px;color:var(--fg-muted);line-height:1.5;')}>{t('till.readerHelp')}</div>
          <div role="status" aria-live="polite" style={css('margin-top:8px;min-height:20px;font-size:13px;font-weight:700;color:var(--pos);')}>
            {s.tillSaved ? t('till.saved') : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
