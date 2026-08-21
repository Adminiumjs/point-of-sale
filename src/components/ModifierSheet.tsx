import type { ReactNode } from 'react';
import { usePos } from '../state/store';
import { EXTRAS, MILKS, SIZES } from '../data/demo';
import { extraDelta, itemById, milkDelta, money, sizeDelta, sizeLabel } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { MenuThumb } from './MenuThumb';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

const optBox = (on: boolean) =>
  'display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:64px;border-radius:15px;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface-2)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';cursor:pointer;';

const chipBox = (on: boolean) =>
  'display:inline-flex;align-items:center;gap:7px;height:52px;padding:0 20px;border-radius:14px;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface-2)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';font-size:15.5px;font-weight:700;cursor:pointer;';

export function ModifierSheet() {
  const s = usePos();
  const t = useT();
  if (!s.sheetOpen) return null;
  const m = itemById(s.sheetId || '');
  if (!m) return null;
  const dark = s.theme === 'dark';
  const ms = m.mods;
  const hasSize = ms === 'coffee' || ms === 'tea' || ms === 'cold';
  const hasMilk = ms === 'coffee' || ms === 'tea';
  const hasExtras = ms === 'coffee' || ms === 'cold';
  const hasSeat = s.mode !== 'retail' && (s.ticket.seats || 0) > 0;

  let line = m.price + sizeDelta(s.sheetSize) + milkDelta(s.sheetMilk);
  s.sheetExtras.forEach((x) => {
    line += extraDelta(x);
  });
  line *= s.sheetQty;

  const summaryParts: string[] = [];
  if (hasSize) summaryParts.push(sizeLabel(s.sheetSize));
  if (hasMilk && s.sheetMilk !== 'Whole') summaryParts.push(t('mod.milkSuffix', { milk: s.sheetMilk }));
  s.sheetExtras.forEach((x) => summaryParts.push(x));
  if (s.sheetSeat > 0) summaryParts.push(t('ticket.seatN', { n: s.sheetSeat }));
  const summary = summaryParts.length ? summaryParts.join(' · ') : t('sheet.noCustomizations');

  const seats: { v: number; label: string }[] = [{ v: 0, label: t('ticket.shared') }];
  for (let i = 1; i <= (s.ticket.seats || 0); i++) seats.push({ v: i, label: t('ticket.seatN', { n: i }) });

  return (
    <>
      <div onClick={s.closeSheet} style={css('position:absolute;inset:0;z-index:200;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div style={css('position:absolute;left:0;right:0;bottom:0;z-index:201;background:var(--surface);border-radius:26px 26px 0 0;max-height:90%;display:flex;flex-direction:column;box-shadow:0 -12px 40px rgba(10,10,20,.24);animation:pos-sheet .3s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;justify-content:center;padding:12px 0 4px;')}>
          <div style={css('width:44px;height:5px;border-radius:3px;background:var(--border-strong);')} />
        </div>
        <div style={css('flex-shrink:0;display:flex;align-items:center;gap:14px;padding:10px 24px 18px;border-bottom:1px solid var(--border);')}>
          <MenuThumb item={m} dark={dark} radius="16px" box="width:60px;height:60px;flex-shrink:0;" />
          <div style={css('flex:1;min-width:0;')}>
            <div style={css('font-size:21px;font-weight:800;letter-spacing:-.02em;')}>{m.name}</div>
            <div style={css('font-size:14px;color:var(--fg-muted);' + MONO + 'margin-top:2px;')}>{t('sheet.base', { amount: money(m.price) })}</div>
          </div>
          <button className="pos-press" onClick={s.closeSheet} aria-label={t('sheet.close')} style={css('width:46px;height:46px;border-radius:13px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
            <Icon name="x" size={22} />
          </button>
        </div>

        <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px 24px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;')}>
            <span style={css('font-size:15px;font-weight:800;')}>{t('sheet.quantity')}</span>
            <div style={css('display:flex;align-items:center;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:4px;')}>
              <button className="pos-press" onClick={s.sheetQtyDec} aria-label={t('ticket.decrease')} style={css('width:48px;height:48px;border-radius:11px;border:none;background:var(--surface);color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow);')}>
                <Icon name="minus" size={20} />
              </button>
              <span style={css('min-width:44px;text-align:center;font-size:22px;font-weight:800;' + MONO)}>{s.sheetQty}</span>
              <button className="pos-press" onClick={s.sheetQtyInc} aria-label={t('ticket.increase')} style={css('width:48px;height:48px;border-radius:11px;border:none;background:var(--surface);color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow);')}>
                <Icon name="plus" size={20} />
              </button>
            </div>
          </div>

          {hasSize && (
            <>
              <SectionLabel>{t('sheet.size')}</SectionLabel>
              <div style={css('display:flex;gap:10px;margin-bottom:24px;')}>
                {SIZES.map((o) => {
                  const on = s.sheetSize === o.v;
                  const d = sizeDelta(o.v);
                  const lbl = sizeLabel(o.v);
                  const delta = (d < 0 ? '−' : '+') + money(Math.abs(d));
                  return (
                    <button key={o.v} className="pos-press" onClick={() => s.setSheetSize(o.v)} style={css(optBox(on))}>
                      <span style={css('font-size:16px;font-weight:800;')}>{lbl}</span>
                      {d !== 0 && <span style={css('font-size:12.5px;' + MONO + 'opacity:.7;margin-top:3px;')}>{delta}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {hasMilk && (
            <>
              <SectionLabel>{t('sheet.milk')}</SectionLabel>
              <div style={css('display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;')}>
                {MILKS.map(({ v, delta: d }) => {
                  const on = s.sheetMilk === v;
                  return (
                    <button key={v} className="pos-press" onClick={() => s.setSheetMilk(v)} style={css(chipBox(on))}>
                      {v}
                      {d > 0 && <span style={css('font-size:12px;' + MONO + 'opacity:.7;margin-inline-start:6px;')}>+{money(d)}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {hasExtras && (
            <>
              <SectionLabel>{t('sheet.extras')}</SectionLabel>
              <div style={css('display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;')}>
                {EXTRAS.map((o) => {
                  const on = s.sheetExtras.indexOf(o.v) >= 0;
                  const d = extraDelta(o.v);
                  return (
                    <button key={o.v} className="pos-press" onClick={() => s.toggleSheetExtra(o.v)} style={css(chipBox(on))}>
                      <Icon name={o.icon} size={16} />
                      {o.v}
                      {d > 0 && <span style={css('font-size:12px;' + MONO + 'opacity:.7;margin-inline-start:2px;')}>+{money(d)}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {hasSeat && (
            <>
              <SectionLabel>{t('sheet.seat')}</SectionLabel>
              <div style={css('display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;')}>
                {seats.map((o) => (
                  <button key={o.v} className="pos-press" onClick={() => s.setSheetSeat(o.v)} style={css(chipBox(s.sheetSeat === o.v))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <SectionLabel>{t('sheet.itemNote')}</SectionLabel>
          <textarea
            value={s.sheetNote}
            onChange={(e) => s.setSheetNote(e.target.value)}
            placeholder={t('sheet.notePlaceholder')}
            aria-label={t('sheet.itemNote')}
            style={css('width:100%;min-height:70px;resize:none;border:1px solid var(--border-strong);background:var(--surface-2);border-radius:14px;padding:14px 16px;font-size:15px;font-weight:500;color:var(--fg);outline:none;')}
          />
        </div>

        <div style={css('flex-shrink:0;padding:16px 24px;border-top:1px solid var(--border);')}>
          <div style={css('display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg-muted);margin-bottom:12px;padding:0 2px;')}>
            <Icon name="check" size={15} color="var(--pos)" />
            <span style={css('font-weight:600;')}>{summary}</span>
          </div>
          <button className="pos-press" onClick={s.sheetAdd} style={css('width:100%;height:66px;border-radius:17px;border:none;background:var(--accent);color:var(--accent-fg);font-size:18px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;')}>
            <span>{t('sheet.addToTicket', { qty: s.sheetQty })}</span>
            <span style={css(MONO + 'font-weight:800;')}>{money(line)}</span>
          </button>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={css('font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:11px;')}>{children}</div>;
}
