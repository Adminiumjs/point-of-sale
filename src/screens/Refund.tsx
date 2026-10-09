import { useEffect, useMemo, useState } from 'react';
import { payOrder, usePos, refundMoney } from '../state/store';
import { money, tableName } from '../state/calc';
import { history } from '../data/history';
import type { BackTo, PastSale, PayMethod } from '../data/types';
import { useI18n, useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader, Caps, MONO } from '../components/AuxHeader';
import { css } from '../components/css';

/** A closed sale's table; one rung up at no table was a walk-in, not a "new ticket". */
const saleTable = (table: string | null, mode: 'restaurant' | 'retail') => (table === null ? tableName('—', 'retail') : tableName(table, mode));

const METHODS: { m: PayMethod; label: MessageKey; icon: string }[] = [
  { m: 'card', label: 'common.card', icon: 'credit-card' },
  { m: 'cash', label: 'common.cash', icon: 'banknote' },
  { m: 'qr', label: 'refund.wallet', icon: 'qr-code' },
];

const METHOD_OF: Record<PayMethod, { label: MessageKey; icon: string }> = {
  card: { label: 'common.card', icon: 'credit-card' },
  cash: { label: 'common.cash', icon: 'banknote' },
  qr: { label: 'refund.wallet', icon: 'qr-code' },
  gift_card: { label: 'gift.method', icon: 'gift' },
};

const BACK: { to: BackTo; label: MessageKey }[] = [
  { to: 'shelf', label: 'refund.backShelf' },
  { to: 'damaged', label: 'refund.backDamaged' },
  { to: 'none', label: 'refund.backNone' },
];

/**
 * Refund. It starts from "Today's tickets", drawn like the held tray, with a
 * search by ticket number that also finds older sales — the comp only
 * refunds the last sale. A chosen sale opens the comp's refund screen
 * (539-579): pick the lines, where the money goes back, and issue it.
 */
export function Refund() {
  const s = usePos();
  const t = useT();
  const sale = s.refundSale;
  const sub = sale === null ? t('refund.pickSub') : t('refund.sub', { n: sale.number, table: saleTable(sale.table, s.mode) });
  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('refund.title')} sub={sub} onBack={s.refundBack} backLabel={sale === null || s.refundDone !== null ? t('nav.register') : t('refund.back')} />
      {sale === null ? <TodaysTickets /> : s.refundDone !== null ? <Issued /> : <Pick sale={sale} />}
    </div>
  );
}

function TodaysTickets() {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  const [loaded, setLoaded] = useState<PastSale[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PastSale[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let live = true;
    history()
      .today()
      .then((rows) => live && setLoaded(rows))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  // This till's own sales first (they may not have reached a read yet), then the rest by number.
  const today = useMemo(() => {
    const own = s.sales;
    const seen = new Set(own.map((x) => x.number));
    return [...own, ...(loaded ?? []).filter((x) => !seen.has(x.number))].sort((a, b) => b.closedAt - a.closedAt);
  }, [s.sales, loaded]);

  const search = async () => {
    const q = query.trim();
    if (q === '') {
      setFound(null);
      return;
    }
    setSearching(true);
    try {
      const own = s.sales.filter((x) => String(x.number) === q.replace(/\D+/g, ''));
      const rows = await history().find(q);
      const seen = new Set(own.map((x) => x.number));
      setFound([...own, ...rows.filter((x) => !seen.has(x.number))]);
    } catch {
      setFound([]);
      s.showToast(t('refund.searchFailed'), 'error');
    } finally {
      setSearching(false);
    }
  };

  const list = found ?? today;
  const when = (ms: number) => date(new Date(ms), { hour: 'numeric', minute: '2-digit' });
  const day = (ms: number) => date(new Date(ms), { month: 'short', day: 'numeric' });
  const isToday = (ms: number) => new Date(ms).toDateString() === new Date().toDateString();

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 22px;')}>
      <div style={css('max-width:720px;margin:0 auto;')}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          style={css('display:flex;gap:10px;margin-bottom:20px;')}
        >
          <div style={css('flex:1;display:flex;align-items:center;gap:10px;height:52px;padding:0 16px;background:var(--surface);border:1px solid var(--border-strong);border-radius:14px;')}>
            <Icon name="search" size={19} color="var(--fg-subtle)" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim() === '') setFound(null);
              }}
              inputMode="numeric"
              placeholder={t('refund.searchPlaceholder')}
              aria-label={t('refund.searchPlaceholder')}
              style={css('flex:1;min-width:0;border:none;background:transparent;outline:none;font-size:16px;font-weight:500;color:var(--fg);')}
            />
          </div>
          <button type="submit" className="pos-press" disabled={searching} style={css('height:52px;padding:0 20px;border-radius:14px;border:none;background:var(--accent);color:var(--accent-fg);font-size:15px;font-weight:800;cursor:pointer;flex-shrink:0;')}>
            {t(searching ? 'refund.searching' : 'refund.find')}
          </button>
        </form>
        <Caps>{found === null ? t('refund.today') : t('refund.results', { q: query.trim() })}</Caps>
        {found === null && loaded === null && !failed && s.sales.length === 0 && <Note>{t('refund.loading')}</Note>}
        {found === null && failed && <Note>{t('refund.loadFailed')}</Note>}
        {list.length === 0 && (found !== null || loaded !== null) && <Note>{found === null ? t('refund.noneToday') : t('refund.noneFound')}</Note>}
        <div style={css('display:flex;flex-direction:column;gap:12px;')}>
          {list.map((x) => {
            const names = x.lines.map((l) => (l.qty > 1 ? l.qty + '× ' : '') + l.name);
            const left = x.total - x.refunded;
            return (
              <div key={(x.rid ?? '') + x.number} style={css('border:1px solid var(--border);border-radius:16px;padding:16px;background:var(--surface);')}>
                <div style={css('display:flex;align-items:center;gap:10px;')}>
                  <span style={css('font-size:16px;font-weight:800;')}>{saleTable(x.table, s.mode)}</span>
                  <span style={css('font-size:12.5px;color:var(--fg-muted);' + MONO)}>#{x.number}</span>
                  <span style={css('margin-inline-start:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--fg-muted);')}>
                    <Icon name="clock" size={13} />
                    {isToday(x.closedAt) ? when(x.closedAt) : `${day(x.closedAt)} · ${when(x.closedAt)}`}
                  </span>
                </div>
                <div style={css('font-size:13px;color:var(--fg-muted);margin-top:8px;')}>{names.join(', ')}</div>
                <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;')}>
                  <span style={css('display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;')}>
                    <span style={css('font-size:22px;font-weight:800;' + MONO)}>{money(x.total)}</span>
                    {x.refunded > 0 && <span style={css('font-size:12.5px;font-weight:700;color:var(--danger);')}>{t('refund.alreadyRefunded', { amount: money(x.refunded) })}</span>}
                  </span>
                  <button
                    className="pos-press"
                    disabled={left <= 0.005}
                    data-refund-sale={String(x.number)}
                    onClick={() => s.pickRefundSale(x)}
                    style={css('height:48px;padding:0 20px;border-radius:13px;border:none;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;flex-shrink:0;cursor:' + (left > 0.005 ? 'pointer' : 'not-allowed') + ';background:' + (left > 0.005 ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (left > 0.005 ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}
                  >
                    <Icon name="undo-2" size={17} />
                    {t(left > 0.005 ? 'refund.choose' : 'refund.fullyRefunded')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Note({ children }: { children: string }) {
  return <div style={css('text-align:center;padding:36px 20px;font-size:14px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;margin-bottom:12px;')}>{children}</div>;
}

function Pick({ sale }: { sale: PastSale }) {
  const s = usePos();
  const t = useT();
  const sums = refundMoney(sale, s.refundSel);
  // With a server, the refund is whatever Adminium quotes for these lines; the till's own sum is only an estimate.
  const asked = s.connected && sale.rid !== undefined;
  const quote = asked ? s.refundQuote : null;
  const due = quote === null ? sums.total : quote.amount;
  const can = s.refundSel.length > 0 && !s.refunding && (asked ? quote !== null && !s.refundQuoting : sums.total > 0);
  const pays = asked ? payOrder(sale) : [];
  // Where a returned thing goes is asked in retail, with Inventory attached.
  const stockChoice = s.features.stock && s.mode === 'retail';
  return (
    <div className="refund-body" style={css('flex:1;min-height:0;display:flex;')}>
      <div className="pos-scroll refund-lines" style={css('flex:1;min-width:0;overflow-y:auto;padding:22px;border-inline-end:1px solid var(--border);')}>
        <Caps>{t('refund.select')}</Caps>
        <div role="group" aria-label={t('refund.select')} style={css('display:flex;flex-direction:column;gap:10px;')}>
          {sale.lines.map((l, i) => {
            const done = l.refunded >= l.qty || l.giftCard === true;
            const on = s.refundSel.includes(i);
            const goes = s.refundGoes[i] ?? 'shelf';
            return (
              <div key={i} style={css('display:flex;flex-direction:column;gap:6px;')}>
                <button
                  className="pos-press"
                  role="checkbox"
                  aria-checked={on}
                  disabled={done}
                  onClick={() => s.toggleRefundLine(i)}
                  style={css('display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:14px;text-align:start;font-family:inherit;color:var(--fg);border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : done ? 'var(--surface-2)' : 'var(--surface)') + ';cursor:' + (done ? 'default' : 'pointer') + ';opacity:' + (done ? '.6' : '1') + ';')}
                >
                  <span aria-hidden="true" style={css('width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:2px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent)' : 'transparent') + ';color:var(--accent-fg);')}>
                    {on && <Icon name="check" size={16} />}
                  </span>
                  <span style={css('flex:1;min-width:0;')}>
                    <span style={css('display:block;font-size:15px;font-weight:700;')}>
                      <span style={css(MONO)}>{l.qty}×</span> {l.name}
                    </span>
                    {(l.mod !== '' || done) && <span style={css('display:block;font-size:12px;color:var(--fg-muted);')}>{done ? t('refund.lineRefunded') : l.mod}</span>}
                  </span>
                  <span style={css('font-weight:800;' + MONO)}>{money(l.line)}</span>
                </button>
                {/* With Inventory, a retail line says where the thing itself goes; the shelf unless told otherwise. */}
                {on && stockChoice && (
                  <div role="radiogroup" aria-label={l.name} style={css('display:flex;gap:6px;padding-inline-start:38px;')}>
                    {BACK.map((b) => (
                      <button key={b.to} role="radio" data-back-to={b.to} aria-checked={goes === b.to} className="pos-press" onClick={() => s.setRefundGoes(i, b.to)} style={css('flex:1;height:38px;border-radius:10px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;border:1.5px solid ' + (goes === b.to ? 'var(--accent)' : 'var(--border)') + ';background:' + (goes === b.to ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (goes === b.to ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                        {t(b.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="refund-side" style={css('width:40%;min-width:300px;display:flex;flex-direction:column;')}>
        <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px;')}>
          <Caps>{t('refund.to')}</Caps>
          {pays.length > 0 ? (
            <div role="radiogroup" aria-label={t('refund.to')} style={css('display:flex;flex-direction:column;gap:8px;margin-bottom:22px;')}>
              {/* The ticket's own payments, a card's first: the money goes back where it came from, and never more than that payment took. */}
              {pays.map((x) => {
                const on = s.refundPayment === x.id;
                const max = quote?.payments.find((one) => one.key === x.id)?.max;
                const m = METHOD_OF[x.method];
                return (
                  <button key={x.id} role="radio" aria-checked={on} className="pos-press" onClick={() => s.setRefundPayment(x.id)} style={css('display:flex;align-items:center;gap:10px;height:56px;padding:0 14px;border-radius:14px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;text-align:start;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg)') + ';')}>
                    <Icon name={m.icon} size={18} />
                    <span style={css('flex:1;')}>{x.method === 'gift_card' && x.last4 !== undefined ? t('cards.kept', { last4: x.last4 }) : t(m.label)}</span>
                    {max !== undefined && <span style={css('font-size:12.5px;font-weight:700;' + MONO)}>{t('refund.canTake', { amount: money(max) })}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="radiogroup" aria-label={t('refund.to')} style={css('display:flex;gap:10px;margin-bottom:22px;')}>
              {[...METHODS, ...(sale.giftCardCode === undefined ? [] : [{ m: 'gift_card' as const, label: 'gift.method' as MessageKey, icon: 'gift' }])].map((x) => {
                const on = s.refundMethod === x.m;
                return (
                  <button key={x.m} role="radio" aria-checked={on} className="pos-press" onClick={() => s.setRefundMethod(x.m)} style={css('flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:58px;border-radius:14px;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg)') + ';font-size:15px;font-weight:800;cursor:pointer;')}>
                    <Icon name={x.icon} size={18} />
                    {t(x.label)}
                  </button>
                );
              })}
            </div>
          )}
          <div style={css('background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px;')}>
            <RefundFigures count={s.refundSel.length} quote={quote} estimate={sums} asked={asked} />
          </div>
          {s.refundQuoting && <div role="status" style={css('font-size:13px;color:var(--fg-muted);margin-top:10px;')}>{t('refund.quoting')}</div>}
          {s.refundWords !== null && (
            <div role="alert" style={css('margin-top:12px;padding:12px 14px;border-radius:13px;background:var(--danger-soft);color:var(--danger);font-size:14px;font-weight:700;')}>
              {s.refundWords}
            </div>
          )}
        </div>
        <div style={css('flex-shrink:0;padding:16px 22px;border-top:1px solid var(--border);background:var(--surface);')}>
          <button data-refund-issue="" className="pos-press" disabled={!can} onClick={() => void s.processRefund()} style={css('width:100%;height:66px;border-radius:16px;border:none;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:10px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';background:' + (can ? 'var(--danger)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--danger-fg)' : 'var(--fg-subtle)') + ';')}>
            <Icon name="undo-2" size={20} />
            {t(s.refunding ? 'refund.issuing' : 'refund.issue', { amount: money(due) })}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * What the refund comes to. With a server it is ADMINIUM's quote — worked out
 * from the lines, nothing the till added up — and until the quote is in, the
 * till's own estimate, labelled as one. The demo, which has no server, shows
 * its estimate as its figures.
 */
export function RefundFigures({ count, quote, estimate, asked }: { count: number; quote: { amount: number; tax: number } | null; estimate: { sub: number; tax: number; total: number }; asked: boolean }) {
  const t = useT();
  const row = 'display:flex;justify-content:space-between;font-size:14px;';
  return (
    <>
      <div style={css(row + 'margin-bottom:9px;')}>
        <span style={css('color:var(--fg-muted);font-weight:600;')}>{t('refund.items', { count })}</span>
        {quote === null && <span style={css('font-weight:600;' + MONO)}>{money(estimate.sub)}</span>}
      </div>
      <div style={css(row + 'margin-bottom:12px;')}>
        <span style={css('color:var(--fg-muted);font-weight:600;')}>{t('common.tax')}</span>
        <span style={css('font-weight:600;' + MONO)}>{money(quote === null ? estimate.tax : quote.tax)}</span>
      </div>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;padding-top:12px;border-top:1px dashed var(--border-strong);')}>
        <span style={css('display:inline-flex;align-items:baseline;gap:8px;font-size:15px;font-weight:800;')}>
          {t('refund.total')}
          {asked && quote === null && (
            <span data-estimate="" style={css('font-size:12px;font-weight:600;color:var(--fg-muted);')}>
              {t('common.estimate')}
            </span>
          )}
        </span>
        <span style={css('font-size:28px;font-weight:800;color:var(--danger);' + MONO)}>{money(quote === null ? estimate.total : quote.amount)}</span>
      </div>
    </>
  );
}

function Issued() {
  const s = usePos();
  const t = useT();
  const done = s.refundDone!;
  return (
    <div role="status" style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;')}>
      <div style={css('width:76px;height:76px;border-radius:22px;background:var(--pos-soft);color:var(--pos);display:flex;align-items:center;justify-content:center;')}>
        <Icon name="check-circle-2" size={42} />
      </div>
      <div style={css('font-size:24px;font-weight:800;margin-top:16px;')}>{t('refund.issued')}</div>
      <div style={css('font-size:14.5px;color:var(--fg-muted);margin-top:5px;')}>{t('refund.issuedSub', { amount: money(done.total), items: t('common.itemsCount', undefined, done.count) })}</div>
      <button className="pos-press" onClick={() => usePos.setState({ view: 'register', refundSale: null, refundDone: null })} style={css('margin-top:22px;height:60px;padding:0 26px;border-radius:15px;border:none;background:var(--accent);color:var(--accent-fg);font-size:16px;font-weight:800;cursor:pointer;')}>
        {t('refund.newOrder')}
      </button>
    </div>
  );
}
