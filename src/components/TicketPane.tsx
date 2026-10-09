import { useEffect, useState } from 'react';
import { isOffline, kindWord, partPaidBefore, showsEstimate, usePos } from '../state/store';
import type { LineItem } from '../data/types';
import { discountAmt, itemById, lineName, lineTotal, modLabel, money, payDue, regTotal, subtotal, tableName, tax, taxLabel } from '../state/calc';
import { useI18n, useT, type MessageKey } from '../i18n';
import { pointsLeft } from '../state/points';
import { Icon } from './Icon';
import { TotalLabel, WhyOff } from './Figures';
import { css } from './css';

const MONO = "font-family:'JetBrains Mono',monospace;";
/** The × on a reduction: a 44 px target around a small mark. */
const removeBtn = 'width:44px;height:36px;border-radius:9px;border:none;background:transparent;color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;';

interface Group {
  header: boolean;
  label: string;
  seatSub: string;
  rows: LineItem[];
}

export function TicketPane() {
  const s = usePos();
  const t = useT();
  const { number } = useI18n();
  const retail = s.mode === 'retail';
  const member = s.ticket.customerId === undefined ? undefined : s.members[s.ticket.customerId];
  const pickup = s.ticket.rid === undefined ? undefined : s.pickups.find((p) => p.rid === s.ticket.rid);
  const items = s.ticket.items;
  const empty = items.length === 0;
  const canAct = !empty;
  const hasDisc = !!s.discount;
  // Adminium's figures, or the till's estimate until they are in — then the total says so.
  const estimate = showsEstimate(s) && s.ticket.items.length > 0;
  const server = s.ticket.server;
  const offers = s.features.offers && s.connected;
  const off = isOffline(s);
  // A ticket from before tickets kept their own tax rate can never be paid: its items move to a new one.
  const rateless = s.ticket.rateless === true;
  const canPay = canAct && !rateless;
  const [code, setCode] = useState('');
  const kept = s.ticket.card;
  // What Offers said of a code belongs to the ticket it was typed on.
  const clearSaid = s.clearCodeSaid;
  const onTicket = s.ticket.rid;
  useEffect(() => clearSaid, [onTicket, clearSaid]);
  const said = s.codeSaid;
  const stockOf = (li: LineItem) => (s.features.stock && s.connected && li.giftCard === undefined ? s.stock[li.id] : undefined);
  // A gift card load never goes to the kitchen, so Send does not count it.
  const unsent = items.filter((x) => !x.sent && x.giftCard === undefined).reduce((a, x) => a + x.qty, 0);

  let groups: Group[];
  if (s.coursing && !retail && items.length) {
    /*
     * Grouped by seat *number*, and labelled only at render. Keying the map by
     * the label instead would sort the courses alphabetically by their
     * translation — "Geteilt" ahead of "Platz 1" in German — rather than
     * seat 1, seat 2, shared last, which is the order a server reads them in.
     */
    const map: Record<number, LineItem[]> = {};
    const order: number[] = [];
    items.forEach((li) => {
      const n = li.seat && li.seat > 0 ? li.seat : 0;
      if (!map[n]) {
        map[n] = [];
        order.push(n);
      }
      map[n].push(li);
    });
    order.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    groups = order.map((n) => ({
      header: true,
      label: n === 0 ? t('ticket.shared') : t('ticket.seatN', { n }),
      seatSub: money(map[n].reduce((acc, li) => acc + lineTotal(li), 0)),
      rows: map[n],
    }));
  } else {
    groups = [{ header: false, label: '', seatSub: '', rows: items }];
  }

  const title = retail ? t('table.walkIn') : tableName(s.ticket.table, s.mode);
  const sub = retail
    ? t('ticket.subRetail', { n: s.ticket.number })
    : s.ticket.table
      ? t('ticket.subSeated', {
          n: s.ticket.number,
          seats: t('common.seatsCount', undefined, s.ticket.seats),
        })
      : t('ticket.subUnassigned', { n: s.ticket.number });
  const emptyHint = retail
    ? t('ticket.emptyHintRetail')
    : t('ticket.emptyHintTable', { table: tableName(s.ticket.table, s.mode) });

  const hdrBtn = 'width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;';
  const actBase = 'flex:1;height:60px;border-radius:15px;font-size:16px;font-weight:800;cursor:' + (canAct ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:9px;';

  return (
    <aside className="ticket-aside">
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);')}>
        <div style={css('min-width:0;')}>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.02em;')}>{title}</div>
          <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-weight:500;')}>{sub}</div>
        </div>
        <div style={css('margin-inline-start:auto;display:flex;gap:8px;')}>
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
            {t('ticket.seats')}
          </button>
          <button className="pos-press" onClick={() => s.setPickupSheet(true)} title={t('ticket.forPickup')} aria-label={t('ticket.forPickup')} style={css(hdrBtn + (pickup === undefined ? '' : 'color:var(--accent);border-color:color-mix(in srgb, var(--accent) 45%, transparent);'))}>
            <Icon name="shopping-bag" size={18} />
          </button>
          <button className="pos-press" onClick={s.openMove} title={t('ticket.moveMerge')} aria-label={t('ticket.moveMerge')} style={css(hdrBtn)}>
            <Icon name="arrow-left-right" size={18} />
          </button>
          <button className="pos-press" onClick={s.openDiscount} title={t('ticket.discountComp')} aria-label={t('ticket.discountComp')} style={css(hdrBtn)}>
            <Icon name="percent" size={18} />
          </button>
        </div>
      </div>

      {rateless && <CarryStrip partPaid={s.ticket.partPaid === true || s.splits.length > 0} known={!partPaidBefore(s)} onCarry={s.carryOver} />}
      {/* A code that is for a named customer: asked for here, and tried again once the ticket names one. */}
      {s.codeAsk !== null && (
        <div role="alert" style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 12px 0;padding:10px 12px;border-radius:13px;background:var(--accent-soft);color:var(--accent);font-size:13.5px;font-weight:700;')}>
          <span style={css('flex:1;min-width:140px;')}>{s.codeAsk.noEmail ? t('code.needsEmail') : t('code.needsCustomer', { code: s.codeAsk.typed })}</span>
          <button className="pos-press" onClick={s.openLoyalty} style={css('height:38px;padding:0 14px;border-radius:11px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;')}>
            {t('code.addCustomer')}
          </button>
          <button className="pos-press" onClick={s.dismissCodeAsk} aria-label={t('common.close')} style={css('width:30px;height:30px;border-radius:9px;border:none;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {/* A pickup order (wave 2): who collects it, and where it stands. */}
      {pickup !== undefined && (
        <button className="pos-press" onClick={() => s.go('pickup')} style={css('flex-shrink:0;display:flex;align-items:center;gap:9px;margin:10px 12px 0;padding:10px 12px;border-radius:13px;border:none;background:var(--warn-soft);color:var(--warn);font-family:inherit;font-size:13.5px;font-weight:800;text-align:start;cursor:pointer;')}>
          <Icon name="shopping-bag" size={17} />
          {t('ticket.pickupFor', { name: pickup.name, stage: t(('pickup.' + pickup.stage) as MessageKey) })}
        </button>
      )}
      {/* The ticket's loyalty member (wave 2): who earns from it, and what they can still spend. */}
      {s.ticket.customerId !== undefined && (
        <div style={css('flex-shrink:0;display:flex;align-items:center;gap:9px;margin:10px 12px 0;padding:8px 8px 8px 12px;border-radius:13px;background:var(--accent-soft);color:var(--accent);')}>
          <Icon name="award" size={17} />
          <button className="pos-press" onClick={s.openLoyalty} style={css('flex:1;min-width:0;border:none;background:transparent;color:inherit;font-family:inherit;font-size:13.5px;font-weight:800;text-align:start;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;')}>
            {member === undefined ? t('ticket.member') : t('ticket.memberPoints', { name: member.name, n: number(pointsLeft(member, s.ticket.items, s.rewards)) })}
          </button>
          <button className="pos-press" onClick={s.detachMember} aria-label={t('ticket.removeMember')} style={css('width:30px;height:30px;border-radius:9px;border:none;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:8px 12px;')}>
        {empty && (
          <div style={css('height:100%;min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 20px;')}>
            <div style={css('width:64px;height:64px;border-radius:18px;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--fg-subtle);margin-bottom:16px;')}>
              <Icon name="receipt-text" size={28} />
            </div>
            <div style={css('font-size:16px;font-weight:800;')}>{t('ticket.noItems')}</div>
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
              const ml = modLabel(li);
              return (
                <div key={li.key} style={css('display:flex;align-items:flex-start;gap:11px;padding:12px 10px;border-radius:15px;margin-bottom:2px;' + (li.sent ? '' : 'background:var(--surface-2);'))}>
                  {li.giftCard?.offers === true ? (
                    // Money for a card is one of it: no stepper, only the × that takes it off.
                    <span aria-hidden="true" style={css('width:46px;height:46px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);')}>
                      <Icon name="gift" size={22} />
                    </span>
                  ) : (
                    <div style={css('display:flex;align-items:center;gap:2px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:3px;flex-shrink:0;')}>
                      <button className="pos-press" onClick={() => s.dec(li.key)} aria-label={t('ticket.decrease')} style={css('width:40px;height:40px;border-radius:9px;border:none;background:transparent;color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
                        <Icon name={li.qty <= 1 ? 'trash-2' : 'minus'} size={19} />
                      </button>
                      <span style={css('min-width:26px;text-align:center;font-size:17px;font-weight:800;' + MONO)}>{li.qty}</span>
                      {/* A reward is one of it: points buy one, and another is another reward. */}
                      <button className="pos-press" disabled={li.rewardId !== undefined || li.giftCard !== undefined} onClick={() => s.inc(li.key)} aria-label={t('ticket.increase')} style={css('width:40px;height:40px;border-radius:9px;border:none;background:transparent;color:' + (li.rewardId === undefined && li.giftCard === undefined ? 'var(--fg)' : 'var(--fg-subtle)') + ';display:flex;align-items:center;justify-content:center;cursor:' + (li.rewardId === undefined && li.giftCard === undefined ? 'pointer' : 'default') + ';')}>
                        <Icon name="plus" size={19} />
                      </button>
                    </div>
                  )}
                  <div style={css('flex:1;min-width:0;')}>
                    <div style={css('display:flex;align-items:center;gap:7px;')}>
                      <span style={css('font-size:15.5px;font-weight:700;letter-spacing:-.01em;')}>{lineName(li)}</span>
                      {li.rewardId !== undefined && (
                        <span style={css('display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--accent-soft);color:var(--accent);')}>
                          <Icon name="gift" size={11} />
                          {t('ticket.reward')}
                        </span>
                      )}
                      {li.sent && (
                        <span style={css('display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--pos-soft);color:var(--pos);')}>
                          <Icon name="check" size={11} />
                          {t('ticket.sent')}
                        </span>
                      )}
                    </div>
                    {!!ml && <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:3px;')}>{ml}</div>}
                    {/* Inventory counts none of it: the sale goes through, and the shelf wants counting. */}
                    {stockOf(li)?.state === 'out' && (
                      <div data-stock-note="" style={css('display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--fg-muted);margin-top:5px;')}>
                        <Icon name="info" size={12} />
                        {typeof stockOf(li)!.after === 'number' && li.qty === 1 ? t('stock.willShow', { n: number(stockOf(li)!.after!) }) : t('stock.countThis')}
                      </div>
                    )}
                    {/* Money for one of Offers' cards: on the card when this ticket is paid, not before. */}
                    {li.giftCard?.offers === true && (
                      <div data-card-line="" style={css('display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:3px 9px;border-radius:8px;margin-top:6px;')}>
                        <Icon name="gift" size={12} />
                        {t('cards.activeWhenPaid')}
                      </div>
                    )}
                    {!!li.note && (
                      <div style={css('display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--warn);background:var(--warn-soft);padding:3px 9px;border-radius:8px;margin-top:6px;')}>
                        <Icon name="message-square-text" size={12} />
                        {li.note}
                      </div>
                    )}
                  </div>
                  <div style={css('display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;')}>
                    <span style={css('font-size:15.5px;font-weight:800;' + MONO)}>{money(lineTotal(li))}</span>
                    <button className="pos-press" onClick={() => s.removeKey(li.key)} aria-label={t('ticket.removeLine')} style={css('width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--fg-subtle);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* With Offers, what came off the ticket is Adminium's own lines — a code, an offer, the staff discount — under the items. */}
        {offers && ((server?.applied.length ?? 0) > 0 || (s.ticket.codes ?? []).length > 0) && (
          <div data-reductions="" style={css('margin-top:6px;padding:8px 10px 2px;border-top:1px dashed var(--border-strong);')}>
            {(server?.applied ?? []).map((line, i) => (
              <div key={line.kind + line.name + String(i)} style={css('display:flex;align-items:center;gap:10px;padding:6px 0;color:var(--pos);')}>
                <span style={css('flex:1;min-width:0;')}>
                  <span style={css('display:block;font-size:14.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{line.name}</span>
                  <span style={css('display:block;font-size:12px;font-weight:600;color:var(--fg-muted);')}>{kindWord(line.kind)}</span>
                </span>
                <span dir="ltr" style={css('font-size:14.5px;font-weight:800;flex-shrink:0;' + MONO)}>−{money(line.amount)}</span>
                {/* A staff discount comes off at a tap — by its giver, or by someone whose limit covers it: the server says. */}
                {line.kind === 'staff' ? (
                  <button className="pos-press" onClick={s.clearDiscount} title={t('offers.removeLine', { name: line.name })} aria-label={t('offers.removeLine', { name: line.name })} style={css(removeBtn)}>
                    <Icon name="x" size={15} />
                  </button>
                ) : (
                  <span aria-hidden="true" style={css('width:44px;flex-shrink:0;')} />
                )}
              </div>
            ))}
            {(s.ticket.codes ?? []).map((one) => (
              <div key={one.id} style={css('display:flex;align-items:center;gap:10px;padding:2px 0;color:var(--fg-muted);')}>
                <span style={css('flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + MONO)}>{t('code.typed', { code: one.typed })}</span>
                <button className="pos-press" onClick={() => void s.removeCode(one.id)} title={t('offers.removeLine', { name: one.typed })} aria-label={t('offers.removeLine', { name: one.typed })} style={css(removeBtn)}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={css('flex-shrink:0;border-top:1px solid var(--border);padding:16px 18px;background:var(--surface);')}>
        <div style={css('display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;')}>
          <span style={css('color:var(--fg-muted);font-weight:600;')}>{t('common.subtotal')}</span>
          <span style={css(MONO + 'font-weight:600;')}>{money(subtotal(s))}</span>
        </div>
        {kept !== undefined && (
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:8px;color:var(--accent);font-weight:700;')}>
            <span style={css('display:inline-flex;align-items:center;gap:6px;min-width:0;')}>
              <Icon name="gift" size={14} />
              {[t('cards.kept', { last4: kept.last4 }), ...(kept.balance === null ? [] : [t('cards.keptBalance', { balance: money(kept.balance) })]), t('cards.keptAtPay')].join(' · ')}
            </span>
            <button className="pos-press" onClick={s.forgetCard} aria-label={t('offers.removeLine', { name: t('cards.kept', { last4: kept.last4 }) })} style={css('width:22px;height:22px;border-radius:6px;border:none;background:transparent;color:var(--fg-subtle);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
              <Icon name="x" size={13} />
            </button>
          </div>
        )}
        {hasDisc && !(offers && server !== undefined) && (
          <div style={css('display:flex;align-items:center;justify-content:space-between;font-size:14px;margin-bottom:8px;color:var(--pos);')}>
            <span style={css('display:inline-flex;align-items:center;gap:6px;font-weight:700;')}>
              <Icon name="tag" size={14} />
              {s.discount!.label}
              <button className="pos-press" onClick={s.clearDiscount} aria-label={t('ticket.removeDiscount')} style={css('width:20px;height:20px;border-radius:6px;border:none;background:transparent;color:var(--fg-subtle);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;')}>
                <Icon name="x" size={13} />
              </button>
            </span>
            <span style={css(MONO + 'font-weight:700;')}>−{money(discountAmt(s))}</span>
          </div>
        )}
        <div style={css('display:flex;justify-content:space-between;font-size:14px;margin-bottom:12px;')}>
          <span style={css('color:var(--fg-muted);font-weight:600;')}>{taxLabel()}</span>
          <span style={css(MONO + 'font-weight:600;')}>{money(tax(s))}</span>
        </div>
        <div style={css('display:flex;align-items:baseline;justify-content:space-between;padding-top:12px;border-top:1px dashed var(--border-strong);')}>
          <TotalLabel estimate={estimate} />
          <span style={css('font-size:32px;font-weight:800;' + MONO + 'letter-spacing:-.02em;')}>{money(regTotal(s))}</span>
        </div>
        {/* A code, a voucher or a gift card, typed or scanned: Offers answers, so it needs a connection. */}
        {offers && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void s.applyCode(code).then(() => {
                // A refused code stays in the field to be put right; one that was taken has done its work.
                if (usePos.getState().codeSaid?.ok !== false) setCode('');
              });
            }}
            style={css('margin-top:12px;')}
          >
            <div style={css('display:flex;gap:8px;')}>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  clearSaid();
                }}
                placeholder={t('offers.codeLabel')}
                aria-label={t('offers.codeLabel')}
                aria-describedby={said === null ? undefined : 'code-said'}
                aria-invalid={said !== null && !said.ok ? true : undefined}
                autoComplete="off"
                disabled={off}
                style={css('flex:1;min-width:0;height:44px;padding:0 12px;border-radius:12px;border:1px solid ' + (said !== null && !said.ok ? 'var(--danger)' : 'var(--border-strong)') + ';background:var(--surface-2);color:var(--fg);font-size:14px;font-weight:600;outline:none;' + MONO)}
              />
              <button type="submit" className="pos-press" disabled={off || s.codeBusy || code.trim() === ''} style={css('height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:' + (off || code.trim() === '' ? 'var(--fg-subtle)' : 'var(--fg)') + ';font-family:inherit;font-size:14px;font-weight:800;cursor:' + (off ? 'not-allowed' : 'pointer') + ';')}>
                {t(s.codeBusy ? 'offers.checking' : 'offers.apply')}
              </button>
            </div>
            {off && <WhyOff>{t('offers.applyOffline')}</WhyOff>}
            {/* What Offers answered, under the field it was typed in. */}
            {!off && said !== null && (
              <div id="code-said" role={said.ok ? 'status' : 'alert'} data-code-said={said.ok ? 'ok' : 'refused'} style={css('display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-top:7px;color:' + (said.ok ? 'var(--pos)' : 'var(--danger)') + ';')}>
                <Icon name={said.ok ? 'check' : 'x-circle'} size={14} />
                {said.words}
              </div>
            )}
          </form>
        )}
        <div style={css('display:flex;gap:10px;margin-top:16px;')}>
          <button className="pos-press" onClick={s.hold} style={css('flex:0 0 auto;width:104px;height:60px;border-radius:15px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
            <Icon name="pause" size={18} />
            {t('ticket.hold')}
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
            {t('ticket.send')}
            {unsent > 0 && (
              <span style={css('min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--accent);color:var(--accent-fg);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;' + MONO)}>{unsent}</span>
            )}
          </button>
        </div>
        <button
          className="pos-press"
          onClick={s.openPay}
          disabled={rateless}
          style={css('width:100%;height:66px;margin-top:10px;border-radius:16px;border:none;background:' + (canPay ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (canPay ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';font-size:19px;font-weight:800;cursor:' + (canPay ? 'pointer' : 'not-allowed') + ';display:flex;align-items:center;justify-content:center;gap:14px;')}
        >
          <span>{t('ticket.pay')}</span>
          <span style={css(MONO + 'font-weight:800;')}>{money(payDue(s))}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * The strip on a ticket opened before the update, which can never be paid.
 * With nothing paid on it (and only once Adminium has said so) its items move
 * to a new ticket at a tap; money already taken cannot follow them, so a
 * part-paid one has no button and says who finishes it.
 */
export function CarryStrip({ partPaid, known, onCarry }: { partPaid: boolean; known: boolean; onCarry: () => void }) {
  const t = useT();
  return (
    <div role="alert" style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 12px 0;padding:10px 12px;border-radius:13px;background:var(--warn-soft);color:var(--warn);font-size:13.5px;font-weight:700;')}>
      <Icon name="alert-triangle" size={17} />
      {partPaid ? (
        <span data-part-paid="" style={css('flex:1;min-width:140px;')}>
          {t('ticket.partPaid')} · {t('ticket.partPaidHint')}
        </span>
      ) : (
        <>
          <span style={css('flex:1;min-width:140px;')}>
            {t('ticket.carryStrip')} · {t('ticket.carryHint')}
          </span>
          {known && (
            <button className="pos-press" onClick={onCarry} style={css('height:38px;padding:0 14px;border-radius:11px;border:none;background:var(--warn);color:var(--surface);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;')}>
              {t('ticket.carryButton')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
