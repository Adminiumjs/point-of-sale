import { useEffect } from 'react';
import { cardState, usePos } from '../state/store';
import { createScanDetector } from '../state/scanner';
import { source } from '../data/source';
import { catName, groupsOf, itemById, money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { MenuThumb } from '../components/MenuThumb';
import { css } from '../components/css';
import { TicketPane } from '../components/TicketPane';
import { CardMoveBanner } from '../components/CardMoveBanner';
import { CardPrints } from '../components/CardPrints';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function Register() {
  const s = usePos();
  const t = useT();
  const dark = s.theme === 'dark';

  /*
   * THE SCANNER: it types like a keyboard, only far faster, and
   * ends with Enter. A burst like that anywhere on the register — the search
   * field included — is a scan; the item whose barcode it is joins the ticket.
   */
  useEffect(() => {
    const detector = createScanDetector();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const code = detector.key(e.key, e.timeStamp);
      if (code === null) return;
      e.preventDefault();
      usePos.getState().scanCode(code);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const dense = s.menuDensity === 'dense';

  const q = s.search.trim().toLowerCase();
  const list = source.menu().filter((m) => (q ? m.name.toLowerCase().indexOf(q) >= 0 : s.cat === 'all' || m.cat === s.cat));
  /*
   * STOCK WORDS (Inventory): how many are left of what is on screen, asked for
   * the tiles shown — a category at a time — and again after a sale closes.
   * A word is advice: an item that reads "Out" still sells, and says so.
   */
  const stockOn = s.features.stock && s.connected;
  const shownIds = list.map((m) => m.id).join(',');
  const closed = s.sales.length;
  const loadStock = s.loadStock;
  useEffect(() => {
    if (stockOn && shownIds !== '') void loadStock(shownIds.split(','));
  }, [stockOn, shownIds, closed, loadStock]);
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
        <CardMoveBanner />
        {/* A card sold a moment ago and not printed yet — still here after a reload. */}
        <CardPrints compact />
        {/* Quick add favourites */}
        <div className="pos-scroll" style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:12px 18px 2px;overflow-x:auto;')}>
          <span style={css('display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);flex-shrink:0;')}>
            <Icon name="star" size={14} />
            {t('register.quickAdd')}
          </span>
          {source.favourites().map((id) => {
            const m = itemById(id);
            if (!m) return null;
            return (
              <button
                key={id}
                className="pos-press"
                onClick={() => s.tapTile(id)}
                style={css('display:flex;align-items:center;gap:10px;height:54px;padding:0 16px 0 8px;border-radius:15px;border:1px solid var(--border);background:var(--surface);cursor:pointer;flex-shrink:0;box-shadow:var(--shadow);')}
              >
                <MenuThumb item={m} dark={dark} radius="11px" box="width:38px;height:38px;flex-shrink:0;" iconSize={19} />
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
            {source.categories().map((c) => {
              const on = s.cat === c.slug;
              const cnt = c.slug === 'all' ? source.menu().length : source.menu().filter((m) => m.cat === c.slug).length;
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
                  {catName(c)}
                  {/* The comp lightens the accent under the count (white .22); that drops white 12px text below 4.5:1, so it darkens instead (DP-A11Y1). */}
                  <span style={css('font-size:12px;font-weight:800;' + MONO + 'padding:1px 8px;border-radius:20px;background:' + (on ? 'rgba(0,0,0,.2)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={css('display:flex;gap:3px;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;padding:3px;flex-shrink:0;')}>
            <button className="pos-press" onClick={() => s.setDensity('cozy')} title={t('register.densityComfortable')} aria-label={t('register.densityComfortable')} style={css(densSeg(!dense))}>
              <Icon name="layout-grid" size={17} />
            </button>
            <button className="pos-press" onClick={() => s.setDensity('dense')} title={t('register.densityDense')} aria-label={t('register.densityDense')} style={css(densSeg(dense))}>
              <Icon name="grip" size={17} />
            </button>
          </div>
        </div>

        {/* Menu grid */}
        <div className="pos-scroll" style={css('flex:1;overflow-y:auto;padding:18px;')}>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fill, minmax(' + (dense ? '120px' : '166px') + ', 1fr));gap:' + (dense ? '10px' : '14px') + ';')}>
            {/* The cards were moved to Offers and Offers is switched off: one plain line where the tile was, no screen that could only be refused. */}
            {cardState(s) === 4 && s.connected && q === '' && (
              <div role="note" data-cards-off="" style={css('grid-column:1 / -1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);color:var(--fg-muted);font-size:13px;font-weight:600;')}>
                <Icon name="gift" size={15} />
                {t('cards.needOffers')}
              </div>
            )}
            {/* Gift cards kept by Offers are sold and topped up from here — the first tile, once the till's own cards have moved. */}
            {cardState(s) === 3 && s.connected && q === '' && (
              <button className="pos-tile" data-gift-tile="" onClick={() => s.setCardSale(true)} style={css('display:flex;flex-direction:column;text-align:start;padding:0;border:1px solid var(--border);border-radius:' + rad + ';background:var(--surface);cursor:pointer;overflow:hidden;box-shadow:var(--shadow);font-family:inherit;color:var(--fg);')}>
                <span aria-hidden="true" style={css('height:' + imgH + ';display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);')}>
                  <Icon name="gift" size={dense ? 26 : 34} />
                </span>
                <span style={css('display:block;padding:' + (dense ? '8px 10px 9px' : '11px 12px 12px') + ';text-align:start;')}>
                  <span style={css('display:block;font-size:' + (dense ? '13px' : '15px') + ';font-weight:700;letter-spacing:-.01em;line-height:1.2;margin-bottom:' + (dense ? '3px' : '5px') + ';')}>{t('cards.title')}</span>
                  <span style={css('display:block;font-size:' + (dense ? '12px' : '13px') + ';font-weight:600;color:var(--fg-muted);')}>{t('cards.tileSub')}</span>
                </span>
              </button>
            )}
            {list.map((m) => {
              const sold = m.available === false || s.unavail.indexOf(m.id) >= 0;
              return (
                <button
                  key={m.id}
                  className="pos-tile"
                  onClick={() => s.tapTile(m.id)}
                  style={css('display:flex;flex-direction:column;text-align:start;padding:0;border:1px solid var(--border);border-radius:' + rad + ';background:var(--surface);cursor:' + (sold ? 'default' : 'pointer') + ';overflow:hidden;box-shadow:var(--shadow);opacity:' + (sold ? '.6' : '1') + ';')}
                >
                  <MenuThumb
                    item={m}
                    dark={dark}
                    radius="0"
                    box={'height:' + imgH + ';'}
                    iconSize={dense ? 26 : 34}
                    overlay={
                      <>
                        {sold && (
                          <div style={css('position:absolute;inset:0;background:color-mix(in srgb, var(--surface) 62%, transparent);display:flex;align-items:center;justify-content:center;')}>
                            <span style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-muted);background:var(--surface);padding:5px 11px;border-radius:9px;box-shadow:var(--shadow);')}>
                              {t('register.soldOut')}
                            </span>
                          </div>
                        )}
                        {!sold && stockOn && <StockChip word={s.stock[m.id]} />}
                        {groupsOf(m.id).length > 0 && (
                          <span title={t('register.hasOptions')} style={css('position:absolute;top:8px;inset-inline-end:8px;width:24px;height:24px;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);')}>
                            <Icon name="sliders-horizontal" size={13} color="var(--fg-muted)" />
                          </span>
                        )}
                      </>
                    }
                  />
                  <div style={css('padding:' + (dense ? '8px 10px 9px' : '11px 12px 12px') + ';text-align:start;')}>
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

/** A tile's stock word: how many are left when it runs low, "Out" at none. Nothing while there is plenty, or nobody counts it. */
export function StockChip({ word }: { word: { state: 'in' | 'low' | 'out'; exact: number | null } | undefined }) {
  const t = useT();
  if (word === undefined || word.state === 'in') return null;
  if (word.state === 'low' && word.exact === null) return null;
  const out = word.state === 'out';
  return (
    <span data-stock={word.state} style={css('position:absolute;top:8px;inset-inline-start:8px;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:20px;background:var(--surface);color:' + (out ? 'var(--danger)' : 'var(--warn)') + ';border:1px solid var(--border);' + (out ? 'text-transform:uppercase;letter-spacing:.04em;' : ''))}>
      {!out && <Icon name="package" size={12} />}
      {out ? t('stock.out') : t('stock.left', { n: word.exact ?? 0 })}
    </span>
  );
}
