import { usePos } from '../state/store';
import type { LineItem } from '../data/types';
import { discountAmt, itemById, lineTotal, modLabel, money, regTotal, subtotal, tableName, tax } from '../state/calc';
import { Icon } from './Icon';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";

interface Group {
  header: boolean;
  label: string;
  seatSub: string;
  rows: LineItem[];
}

export function TicketPane() {
  const s = usePos();
  const retail = s.mode === 'retail';
  const items = s.ticket.items;
  const empty = items.length === 0;
  const canAct = !empty;
  const hasDisc = !!s.discount;
  const unsent = items.filter((x) => !x.sent).reduce((a, x) => a + x.qty, 0);

  let groups: Group[];
  if (s.coursing && !retail && items.length) {
    const map: Record<string, LineItem[]> = {};
    const order: string[] = [];
    items.forEach((li) => {
      const nm = li.seat && li.seat > 0 ? 'Seat ' + li.seat : 'Shared';
      if (!map[nm]) {
        map[nm] = [];
        order.push(nm);
      }
      map[nm].push(li);
    });
    order.sort((a, b) => (a === b ? 0 : a === 'Shared' ? 1 : b === 'Shared' ? -1 : a < b ? -1 : 1));
    groups = order.map((nm) => ({
      header: true,
      label: nm,
      seatSub: money(map[nm].reduce((acc, li) => acc + lineTotal(li), 0)),
      rows: map[nm],
    }));
  } else {
    groups = [{ header: false, label: '', seatSub: '', rows: items }];
  }

  const title = retail ? 'Walk-in sale' : tableName(s.ticket.table, s.mode);
  const sub = 'Ticket #' + s.ticket.number + (retail ? '' : s.ticket.table ? ' · ' + s.ticket.seats + ' seats' : ' · unassigned');
  const emptyHint = retail ? 'Scan or tap items to build the sale.' : 'Tap the menu to start ' + tableName(s.ticket.table, s.mode) + '’s ticket.';

  const hdrBtn = 'width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;';
  const actBase = 'flex:1;height:60px;border-radius:15px;font-size:16px;font-weight:800;cursor:' + (canAct ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:9px;';

  return (
    <aside className="ticket-aside">
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);')}>
        <div style={css('min-width:0;')}>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;')}>{title}</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-weight:500;')}>{sub}</div>
        </div>
        <div style={css('margin-left:auto;display:flex;gap:8px;')}>
          <button
            className="pos-press"
            onClick={s.toggleCoursing}
            style={css(
              'display:flex;align-items:center;gap:7px;height:44px;padding:0 14px;border-radius:12px;border:1px solid ' +
                (s.coursing ? 'transparent' : 'var(--border)') +
                ';background:' +
                (s.coursing ? 'var(--accent)' : 'var(--surface-2)') +
                ';color:' +
                (s.coursing ? 'var(--accent-fg)' : 'var(--fg-muted)') +
                ';font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;',
            )}
          >
            <Icon name="rows-3" size={17} />
            Seats
          </button>
          <button className="pos-press" onClick={s.openMove} title="Move / merge" style={css(hdrBtn)}>
            <Icon name="arrow-left-right" size={18} />
          </button>
          <button className="pos-press" onClick={s.openDiscount} title="Discount / comp" style={css(hdrBtn)}>
            <Icon name="percent" size={18} />
          </button>
        </div>
      </div>

      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:8px 12px;')}>
        {empty && (
          <div style={css('height:100%;min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 20px;')}>
            <div style={css('width:64px;height:64px;border-radius:18px;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--fg-subtle);margin-bottom:16px;')}>
              <Icon name="receipt-text" size={28} />
            </div>
            <div style={css('font-size:16px;font-weight:800;')}>No items yet</div>
            <div style={css('font-size:13.5px;color:var(--fg-muted);margin-top:6px;max-width:220px;line-height:1.5;')}>{emptyHint}</div>
          </div>
        )}

        {groups.map((g, gi) => (
          <div key={gi}>
            {g.header && (
              <div style={css('display:flex;align-items:center;gap:8px;padding:12px 10px 6px;')}>
                <span style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);')}>{g.label}</span>
                <span style={css('flex:1;height:1px;background:var(--border);')} />
                <span style={css('font-size:12.5px;font-weight:700;' + MONO + 'color:var(--fg-muted);')}>{g.seatSub}</span>
              </div>
            )}
            {g.rows.map((li) => {
              const m = itemById(li.id);
              const ml = modLabel(li);
              return (
                <div key={li.key} style={css('display:flex;align-items:flex-start;gap:11px;padding:12px 10px;border-radius:15px;margin-bottom:2px;' + (li.sent ? '' : 'background:var(--surface-2);'))}>
                  <div style={css('display:flex;align-items:center;gap:2px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:3px;flex-shrink:0;')}>
                    <button className="pos-press" onClick={() => s.dec(li.key)} style={css('width:40px;height:40px;border-radius:9px;border:none;background:transparent;color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
                      <Icon name={li.qty <= 1 ? 'trash-2' : 'minus'} size={19} />
                    </button>
                    <span style={css('min-width:26px;text-align:center;font-size:17px;font-weight:800;' + MONO)}>{li.qty}</span>
                    <button className="pos-press" onClick={() => s.inc(li.key)} style={css('width:40px;height:40px;border-radius:9px;border:none;background:transparent;color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
                      <Icon name="plus" size={19} />
                    </button>
                  </div>
                  <div style={css('flex:1;min-width:0;')}>
                    <div style={css('display:flex;align-items:center;gap:7px;')}>
                      <span style={css('font-size:15.5px;font-weight:700;letter-spacing:-.01em;')}>{m ? m.name : li.id}</span>
                      {li.sent && (
                        <span style={css('display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--pos-soft);color:var(--pos);')}>
                          <Icon name="check" size={11} />
                          Sent
                        </span>
                      )}
                    </div>
                    {!!ml && <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:3px;')}>{ml}</div>}
                    {!!li.note && (
                      <div style={css('display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--warn);background:var(--warn-soft);padding:3px 9px;border-radius:8px;margin-top:6px;')}>
                        <Icon name="message-square-text" size={12} />
                        {li.note}
                      </div>
                    )}
                  </div>
                  <div style={css('display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;')}>
                    <span style={css('font-size:15.5px;font-weight:800;' + MONO)}>{money(lineTotal(li))}</span>
                    <button className="pos-press" onClick={() => s.removeKey(li.key)} style={css('width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--fg-subtle);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={css('flex-shrink:0;border-top:1px solid var(--border);padding:16px 18px;background:var(--surface);')}>
        <div style={css('display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;')}>
          <span style={css('color:var(--fg-muted);font-weight:600;')}>Subtotal</span>
          <span style={css(MONO + 'font-weight:600;')}>{money(subtotal(s))}</span>
        </div>
        {hasDisc && (
          <div style={css('display:flex;align-items:center;justify-content:space-between;font-size:14px;margin-bottom:8px;color:var(--pos);')}>
            <span style={css('display:inline-flex;align-items:center;gap:6px;font-weight:700;')}>
              <Icon name="tag" size={14} />
              {s.discount!.label}
              <button className="pos-press" onClick={s.clearDiscount} style={css('width:20px;height:20px;border-radius:6px;border:none;background:transparent;color:var(--fg-subtle);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;')}>
                <Icon name="x" size={13} />
              </button>
            </span>
            <span style={css(MONO + 'font-weight:700;')}>−{money(discountAmt(s))}</span>
          </div>
        )}
        <div style={css('display:flex;justify-content:space-between;font-size:14px;margin-bottom:12px;')}>
          <span style={css('color:var(--fg-muted);font-weight:600;')}>Tax · 8.25%</span>
          <span style={css(MONO + 'font-weight:600;')}>{money(tax(s))}</span>
        </div>
        <div style={css('display:flex;align-items:baseline;justify-content:space-between;padding-top:12px;border-top:1px dashed var(--border-strong);')}>
          <span style={css('font-size:15px;font-weight:800;')}>Total</span>
          <span style={css('font-size:32px;font-weight:800;' + MONO + 'letter-spacing:-.02em;')}>{money(regTotal(s))}</span>
        </div>
        <div style={css('display:flex;gap:10px;margin-top:16px;')}>
          <button className="pos-press" onClick={s.hold} style={css('flex:0 0 auto;width:104px;height:60px;border-radius:15px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
            <Icon name="pause" size={18} />
            Hold
          </button>
          <button
            className="pos-press"
            onClick={s.send}
            style={css(
              actBase +
                'border:1.5px solid ' +
                (canAct ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border)') +
                ';background:' +
                (canAct ? 'var(--accent-soft)' : 'var(--surface-2)') +
                ';color:' +
                (canAct ? 'var(--accent)' : 'var(--fg-subtle)') +
                ';',
            )}
          >
            <Icon name="send" size={18} />
            Send
            {unsent > 0 && (
              <span style={css('min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--accent);color:var(--accent-fg);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;' + MONO)}>{unsent}</span>
            )}
          </button>
        </div>
        <button
          className="pos-press"
          onClick={s.openPay}
          style={css('width:100%;height:66px;margin-top:10px;border-radius:16px;border:none;background:' + (canAct ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (canAct ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';font-size:19px;font-weight:800;cursor:' + (canAct ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:14px;')}
        >
          <span>Pay</span>
          <span style={css(MONO + 'font-weight:800;')}>{money(regTotal(s))}</span>
        </button>
      </div>
    </aside>
  );
}
