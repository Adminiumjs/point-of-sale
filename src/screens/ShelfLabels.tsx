import { useMemo, useState } from 'react';

import { usePos } from '../state/store';
import { source } from '../data/source';
import { MAX_LABELS, documents, labelCount, type LabelOutcome } from '../data/documents';
import { useT, type MessageKey } from '../i18n';
import { AuxHeader, MONO } from '../components/AuxHeader';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import type { MenuItem } from '../data/types';

type Row = { state: 'idle' } | { state: 'drawing' } | { state: 'done'; url: string } | { state: 'refused'; outcome: Exclude<LabelOutcome, { ok: true }> };

/**
 * Shelf labels (retail): a sheet of labels for one item, from the barcode it
 * already has — drawn by the Barcode Labels add-on through Adminium, never
 * here. The sheet opens as a PDF in its own tab, ready to print.
 *
 * Only an item with a barcode can have a label; the others are counted, with
 * where to give them one. A refusal is said in words on the item's own row —
 * above all the one a shop meets first: a label sheet prints plain letters
 * only, so "Café crème" is refused, naming the é.
 */
export function ShelfLabels() {
  const t = useT();
  const [query, setQuery] = useState('');
  // How many labels each sheet carries: kept as typed, so a half-typed number is not thrown away.
  const [count, setCount] = useState('1');
  const wanted = labelCount(count);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const menu = source.menu();
  const labelled = useMemo(() => menu.filter((m) => (m.barcode ?? '').trim() !== ''), [menu]);
  const unlabelled = menu.length - labelled.length;
  const q = query.trim().toLowerCase();
  const shown = q === '' ? labelled : labelled.filter((m) => m.name.toLowerCase().includes(q) || (m.barcode ?? '').includes(q));

  const print = async (item: MenuItem) => {
    if (wanted === null) return;
    setRows((r) => ({ ...r, [item.id]: { state: 'drawing' } }));
    const outcome = await documents().labelSheet(item.id, wanted);
    if (outcome.ok) {
      // Straight to the sheet when the browser lets a tab open now; the link on the row either way.
      window.open(outcome.url, '_blank', 'noopener');
      setRows((r) => ({ ...r, [item.id]: { state: 'done', url: outcome.url } }));
      return;
    }
    setRows((r) => ({ ...r, [item.id]: { state: 'refused', outcome } }));
  };

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('nav.labels')} sub={t('labels.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')} />
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 24px;')}>
        <div style={css('max-width:720px;display:flex;flex-direction:column;gap:12px;')}>
          <div style={css('position:relative;')}>
            <span style={css('position:absolute;inset-inline-start:14px;top:50%;transform:translateY(-50%);color:var(--fg-subtle);display:flex;')}>
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('labels.search')}
              placeholder={t('labels.search')}
              autoComplete="off"
              style={css('width:100%;height:50px;padding-inline:44px 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;')}
            />
          </div>
          <div style={css('display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
            <label htmlFor="labels-count" style={css('font-size:14px;font-weight:700;')}>
              {t('labels.count')}
            </label>
            <input
              id="labels-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_LABELS}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-invalid={wanted === null}
              aria-describedby="labels-count-help"
              style={css('width:96px;height:46px;padding:0 12px;border-radius:12px;border:1.5px solid ' + (wanted === null ? 'var(--danger)' : 'var(--border-strong)') + ';background:var(--surface);color:var(--fg);font-size:15px;font-weight:700;font-family:inherit;outline:none;box-sizing:border-box;' + MONO)}
            />
            <span id="labels-count-help" role={wanted === null ? 'alert' : undefined} style={css('font-size:12.5px;font-weight:' + (wanted === null ? '700' : '500') + ';color:' + (wanted === null ? 'var(--danger)' : 'var(--fg-muted)') + ';')}>
              {t(wanted === null ? 'labels.countInvalid' : 'labels.countHelp', { max: MAX_LABELS })}
            </span>
          </div>
          {unlabelled > 0 && (
            <div role="note" style={css('display:flex;gap:9px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--surface-2);color:var(--fg-muted);font-size:13px;line-height:1.45;')}>
              <span style={css('flex-shrink:0;display:flex;')}>
                <Icon name="info" size={17} />
              </span>
              <span>{t('labels.noBarcode', {}, unlabelled)}</span>
            </div>
          )}
          {shown.length === 0 && <div style={css('padding:24px 4px;color:var(--fg-muted);font-size:14px;')}>{t('labels.none')}</div>}
          <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;')}>
            {shown.map((m) => (
              <LabelRow key={m.id} item={m} row={rows[m.id] ?? { state: 'idle' }} disabled={wanted === null} onPrint={() => void print(m)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LabelRow({ item, row, disabled, onPrint }: { item: MenuItem; row: Row; disabled: boolean; onPrint: () => void }) {
  const t = useT();
  const drawing = row.state === 'drawing';
  const off = drawing || disabled;
  return (
    <li style={css('display:flex;flex-direction:column;gap:9px;padding:12px 14px;border-radius:13px;border:1px solid ' + (row.state === 'refused' ? 'var(--danger)' : 'var(--border)') + ';background:var(--surface);')}>
      <div style={css('display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
        <div style={css('flex:1;min-width:160px;')}>
          <div style={css('font-size:15px;font-weight:700;')}>{item.name}</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);' + MONO)}>
            <bdi>{item.barcode}</bdi>
          </div>
        </div>
        <button
          className="pos-press"
          onClick={onPrint}
          disabled={off}
          aria-label={t('labels.printFor', { name: item.name })}
          style={css('height:46px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px;cursor:' + (drawing ? 'progress' : disabled ? 'not-allowed' : 'pointer') + ';flex-shrink:0;' + (disabled ? 'opacity:.55;' : ''))}
        >
          <Icon name="printer" size={17} />
          {t(drawing ? 'labels.drawing' : 'labels.print')}
        </button>
      </div>
      <div aria-live="polite">
        {row.state === 'done' && (
          <a href={row.url} target="_blank" rel="noopener" style={css('display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:var(--accent);')}>
            <Icon name="arrow-up-right" size={16} className="rtl-flip" />
            {t('labels.open')}
          </a>
        )}
        {row.state === 'refused' && (
          <div role="alert" style={css('display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.45;color:var(--danger);font-weight:600;')}>
            <span style={css('flex-shrink:0;display:flex;padding-top:1px;')}>
              <Icon name="alert-triangle" size={16} />
            </span>
            <span>{refusal(t, item, row.outcome)}</span>
          </div>
        )}
      </div>
    </li>
  );
}

/** Why no label was drawn, in words the shop can act on. */
export function refusal(t: (key: MessageKey, params?: Record<string, string | number>) => string, item: MenuItem, outcome: Exclude<LabelOutcome, { ok: true }>): string {
  switch (outcome.reason) {
    case 'latin':
      return t('labels.errLatin', { name: item.name, letters: outcome.letters === '' ? '…' : outcome.letters });
    case 'code':
      return t('labels.errCode', { code: item.barcode ?? '' });
    case 'missing':
      return t('labels.errMissing', { name: item.name });
    case 'off':
      return t('labels.errOff');
    case 'gone':
      return t('labels.errGone');
    case 'offline':
      return t('labels.errOffline');
    case 'other':
      return t('labels.errOther', { detail: outcome.detail });
  }
}
