import { usePos, curStaffOf } from '../state/store';
import { demoSale, money, tableName } from '../state/calc';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

export function Complete() {
  const s = usePos();
  const sale = s.lastSale || demoSale(s.ticket, curStaffOf(s).name);

  const methods: string[] = [];
  sale.splits.forEach((sp) => {
    const l = sp.method === 'cash' ? 'Cash' : sp.method === 'card' ? 'Card' : 'QR';
    if (methods.indexOf(l) < 0) methods.push(l);
  });
  const d = new Date(sale.at);
  const hh = d.getHours();
  const mm = ('0' + d.getMinutes()).slice(-2);
  const h12 = ((hh + 11) % 12) + 1;
  const ap = hh < 12 ? 'AM' : 'PM';

  return (
    <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;background:var(--bg);')}>
      <div style={css('max-width:860px;margin:0 auto;padding:34px 24px 40px;')}>
        <div style={css('text-align:center;margin-bottom:28px;')}>
          <div style={css('width:76px;height:76px;border-radius:22px;margin:0 auto;background:var(--pos-soft);color:var(--pos);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="check-circle-2" size={42} />
          </div>
          <div style={css('font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:16px;')}>Payment complete</div>
          <div style={css('font-size:14.5px;color:var(--fg-muted);margin-top:5px;')}>Order #{sale.number} · {tableName(sale.table, s.mode)} · {h12}:{mm} {ap}</div>
          <div style={css('font-size:48px;font-weight:800;' + MONO + 'letter-spacing:-.02em;margin-top:14px;')}>{money(sale.total)}</div>
          {sale.change > 0 && (
            <div style={css('display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:9px 17px;border-radius:20px;background:var(--pos-soft);color:var(--pos);font-size:15px;font-weight:800;')}>
              Change due<span style={css(MONO)}>{money(sale.change)}</span>
            </div>
          )}
        </div>

        <div style={css('display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;justify-content:center;')}>
          <div style={css('flex:1;min-width:280px;display:flex;justify-content:center;')}>
            <div style={css('width:300px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 22px 24px;box-shadow:var(--shadow-lg);')}>
              <div style={css('text-align:center;margin-bottom:6px;')}>
                <div style={css('font-size:20px;font-weight:800;letter-spacing:.04em;')}>MARTIN'S</div>
                <div style={css('font-size:11px;color:var(--fg-muted);margin-top:3px;')}>128 Alder Lane · (415) 555-0148</div>
              </div>
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <div style={css('display:flex;justify-content:space-between;font-size:11.5px;color:var(--fg-muted);margin-bottom:11px;' + MONO)}>
                <span>Order #{sale.number}</span>
                <span>{tableName(sale.table, s.mode)}</span>
              </div>
              {sale.items.map((it, i) => {
                const sub = (it.mod || '') + (it.note ? (it.mod ? ' · ' : '') + '“' + it.note + '”' : '');
                return (
                  <div key={i} style={css('display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;')}>
                    <span style={css('font-size:12.5px;line-height:1.4;')}>
                      <span style={css('font-weight:700;' + MONO)}>{it.qty}×</span> {it.name}
                      {!!sub && <span style={css('display:block;font-size:11px;color:var(--fg-muted);')}>{sub}</span>}
                    </span>
                    <span style={css('font-size:12.5px;' + MONO)}>{money(it.line)}</span>
                  </div>
                );
              })}
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <ReceiptRow label="Subtotal" value={money(sale.subtotal)} />
              <ReceiptRow label="Tax" value={money(sale.tax)} />
              <ReceiptRow label="Tip" value={money(sale.tip)} />
              <div style={css('display:flex;justify-content:space-between;font-size:15px;font-weight:800;padding-top:9px;border-top:1px solid var(--border);margin-top:4px;')}>
                <span>Total</span>
                <span style={css(MONO)}>{money(sale.total)}</span>
              </div>
              <div style={css('border-top:1px dashed var(--border-strong);margin:13px 0;')} />
              <div style={css('display:flex;justify-content:space-between;font-size:12px;')}>
                <span style={css('color:var(--fg-muted);')}>Paid · {methods.join(' + ')}</span>
                <span style={css(MONO)}>{money(sale.total)}</span>
              </div>
              <div style={css('text-align:center;font-size:11px;color:var(--fg-muted);margin-top:18px;')}>Served by {sale.staff} · Thank you!</div>
            </div>
          </div>

          <div style={css('flex:1;min-width:280px;display:flex;flex-direction:column;gap:11px;')}>
            <button className="pos-press" onClick={s.printReceipt} style={css('height:66px;border-radius:16px;border:none;background:var(--accent);color:var(--accent-fg);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;')}>
              <Icon name="printer" size={21} />
              Print receipt
            </button>
            <div style={css('display:flex;gap:11px;')}>
              <button className="pos-press" onClick={() => s.sendReceipt('Email')} style={css('flex:1;height:62px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="mail" size={19} />
                Email
              </button>
              <button className="pos-press" onClick={() => s.sendReceipt('Text')} style={css('flex:1;height:62px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="message-square" size={19} />
                Text
              </button>
            </div>
            <div style={css('display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surface);border:1px solid var(--border);')}>
              <Icon name="at-sign" size={17} color="var(--fg-subtle)" />
              <input placeholder="guest@email.com or phone number" style={css('flex:1;border:none;background:transparent;outline:none;font-size:14.5px;color:var(--fg);')} />
            </div>
            <div style={css('height:1px;background:var(--border);margin:6px 0;')} />
            <button className="pos-press" onClick={s.newOrder} style={css('height:66px;border-radius:16px;border:1.5px solid var(--accent);background:var(--accent-soft);color:var(--accent);font-size:17px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;')}>
              <Icon name="plus" size={21} />
              New order
            </button>
            {s.mode === 'restaurant' && (
              <button className="pos-press" onClick={() => usePos.setState({ view: 'floor' })} style={css('height:56px;border-radius:15px;border:none;background:transparent;color:var(--fg-muted);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
                <Icon name="grid-3x3" size={18} />
                Back to floor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={css('display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;')}>
      <span style={css('color:var(--fg-muted);')}>{label}</span>
      <span style={css("font-family:'JetBrains Mono',monospace;")}>{value}</span>
    </div>
  );
}
