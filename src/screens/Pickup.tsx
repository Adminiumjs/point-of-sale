import { useEffect, useState } from 'react';
import { usePos } from '../state/store';
import { lineName } from '../state/calc';
import { useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader } from '../components/AuxHeader';
import { css } from '../components/css';
import type { LineItem, PickupChannel, PickupOrder } from '../data/types';

const MONO = "font-family:'JetBrains Mono',monospace;";

const CHANNEL: Record<PickupChannel, { icon: string; label: MessageKey }> = {
  till: { icon: 'store', label: 'pickup.channel.till' },
  phone: { icon: 'phone', label: 'pickup.channel.phone' },
  web: { icon: 'globe', label: 'pickup.channel.web' },
  app: { icon: 'smartphone', label: 'pickup.channel.app' },
};

const LANES: { stage: PickupOrder['stage']; title: MessageKey; dot: string }[] = [
  { stage: 'queued', title: 'pickup.queued', dot: 'var(--fg-subtle)' },
  { stage: 'making', title: 'pickup.making', dot: 'var(--warn)' },
  { stage: 'ready', title: 'pickup.ready', dot: 'var(--pos)' },
];

/** "2× Latte" for each line of a ticket. */
const itemsOf = (items: LineItem[]): string[] => items.map((li) => (li.qty > 1 ? `${String(li.qty)}× ` : '') + lineName(li));

/**
 * Order-ahead pickup (COMP 735-766, logic 2053-2065): the orders taken for
 * collection — at the till or by phone (D28; Online ordering's come later) —
 * in three lanes, each moved on with one button: Start, Mark ready, Hand off.
 * A ready order can be Notified: the device's own messages open on the
 * guest's number (as Reservations' Message does, DP29), and the order notes
 * when.
 */
export function Pickup() {
  const s = usePos();
  const t = useT();
  // An order still open on this till reads its lines as they are now.
  const live = (order: PickupOrder): string[] => {
    if (order.rid === s.ticket.rid) return itemsOf(s.ticket.items);
    const held = s.held.find((h) => h.rid === order.rid);
    return held === undefined ? order.items : itemsOf(held.items);
  };
  const count = (stage: PickupOrder['stage']) => s.pickups.filter((p) => p.stage === stage).length;
  const chip = (bg: string, fg: string) => 'display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;padding:6px 12px;border-radius:20px;background:' + bg + ';color:' + fg + ';';

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('pickup.title')} sub={t('pickup.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')}>
        <div className="aux-chip" style={css('margin-inline-start:auto;display:flex;gap:8px;flex-wrap:wrap;')}>
          <span style={css(chip('var(--surface-3)', 'var(--fg-muted)'))}>{t('pickup.countQueued', { n: count('queued') })}</span>
          <span style={css(chip('var(--warn-soft)', 'var(--warn)'))}>{t('pickup.countMaking', { n: count('making') })}</span>
          <span style={css(chip('var(--pos-soft)', 'var(--pos)'))}>{t('pickup.countReady', { n: count('ready') })}</span>
        </div>
      </AuxHeader>
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 24px;')}>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;max-width:1200px;margin:0 auto;')}>
          {LANES.map((lane) => {
            const orders = s.pickups.filter((p) => p.stage === lane.stage);
            return (
              <section key={lane.stage} aria-label={t(lane.title)} style={css('display:flex;flex-direction:column;gap:12px;')}>
                <div style={css('display:flex;align-items:center;gap:9px;padding:2px 4px;')}>
                  <span aria-hidden="true" style={css('width:9px;height:9px;border-radius:50%;flex-shrink:0;background:' + lane.dot + ';')} />
                  <h2 style={css('margin:0;font-size:14px;font-weight:800;')}>{t(lane.title)}</h2>
                  <span style={css('font-size:12px;font-weight:800;color:var(--fg-muted);background:var(--surface-3);padding:1px 8px;border-radius:20px;' + MONO)}>{orders.length}</span>
                </div>
                {orders.map((o) => (
                  <OrderCard key={o.rid} order={o} items={live(o)} />
                ))}
                {orders.length === 0 && (
                  <div style={css('text-align:center;padding:22px;font-size:13px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;')}>{t('pickup.none')}</div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, items }: { order: PickupOrder; items: string[] }) {
  const s = usePos();
  const t = useT();
  const ready = order.stage === 'ready';
  const mins = Math.max(0, Math.round((Date.now() - order.placedAt) / 60000));
  const act = order.stage === 'queued' ? { label: 'pickup.start', icon: 'play' } : order.stage === 'making' ? { label: 'pickup.markReady', icon: 'check' } : { label: 'pickup.handOff', icon: 'check-check' };
  const channel = CHANNEL[order.channel];
  const edge = ready ? 'var(--pos)' : order.stage === 'making' ? 'var(--warn)' : 'var(--border-strong)';
  const notifyStyle = css('height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:13.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;text-decoration:none;font-family:inherit;');
  return (
    <article style={css('background:var(--surface);border:1px solid var(--border);border-inline-start:3px solid ' + edge + ';border-radius:16px;padding:15px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px;')}>
      <div style={css('display:flex;align-items:center;gap:8px;')}>
        <span style={css('font-size:16px;font-weight:800;' + MONO)}>#{order.number}</span>
        <span style={css('display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;background:var(--surface-3);color:var(--fg-muted);')}>
          <Icon name={channel.icon} size={12} />
          {t(channel.label)}
        </span>
        <span style={css('margin-inline-start:auto;font-size:12px;color:var(--fg-muted);font-weight:600;')}>{t('pickup.age', { m: mins })}</span>
      </div>
      <div style={css('font-size:15px;font-weight:700;')}>{order.name === '' ? t('pickup.noName') : order.name}</div>
      <div style={css('display:flex;flex-direction:column;gap:3px;')}>
        {items.map((line, i) => (
          <div key={i} style={css('font-size:13.5px;color:var(--fg-muted);')}>
            {line}
          </div>
        ))}
      </div>
      {order.notifiedAt !== null && (
        <div style={css('font-size:12px;font-weight:700;color:var(--pos);display:flex;align-items:center;gap:5px;')}>
          <Icon name="bell" size={13} />
          {t('pickup.notified')}
        </div>
      )}
      <div style={css('display:flex;gap:8px;margin-top:2px;')}>
        <button className="pos-press" onClick={() => s.advancePickup(order.rid)} style={css('flex:1;height:46px;border-radius:12px;border:none;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;color:' + (ready ? 'var(--pos-fg)' : 'var(--accent-fg)') + ';background:' + (ready ? 'var(--pos)' : 'var(--accent)') + ';')}>
          <Icon name={act.icon} size={16} />
          {t(act.label as MessageKey)}
        </button>
        {ready &&
          (order.mobile === null ? (
            <button className="pos-press" onClick={() => s.notifyPickup(order.rid)} style={notifyStyle}>
              <Icon name="bell" size={15} />
              {t('pickup.notify')}
            </button>
          ) : (
            <a href={`sms:${order.mobile.replace(/[^\d+]/g, '')}`} className="pos-press" onClick={() => s.notifyPickup(order.rid)} style={notifyStyle}>
              <Icon name="bell" size={15} />
              {t('pickup.notify')}
            </a>
          ))}
      </div>
    </article>
  );
}

/** Make the ticket on the register an order someone will collect. */
export function PickupSheet() {
  const s = usePos();
  const t = useT();
  const member = s.ticket.customerId === undefined ? undefined : s.members[s.ticket.customerId];
  const [name, setName] = useState(member?.name ?? '');
  const [mobile, setMobile] = useState(member?.mobile ?? '');
  const [channel, setChannel] = useState<PickupChannel>('till');
  const [saving, setSaving] = useState(false);
  const can = name.trim() !== '' && !saving;
  const close = () => s.setPickupSheet(false);
  const input = 'width:100%;height:50px;padding:0 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;';
  const label = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:6px;';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') usePos.getState().setPickupSheet(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <div onClick={close} style={css('position:absolute;inset:0;z-index:210;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div role="dialog" aria-modal="true" aria-labelledby="pickup-title" className="pos-scroll" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:211;width:min(460px, calc(100% - 32px));max-height:88%;overflow-y:auto;background:var(--surface);border-radius:24px;padding:22px;box-shadow:0 24px 60px rgba(10,10,20,.3);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="shopping-bag" size={21} />
          </div>
          <div id="pickup-title" style={css('flex:1;min-width:0;font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{t('pickup.sheetTitle', { n: s.ticket.number })}</div>
          <button className="pos-press" onClick={close} aria-label={t('common.close')} style={css('width:40px;height:40px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!can) return;
            setSaving(true);
            void s.markPickup({ name, mobile, channel }).finally(() => setSaving(false));
          }}
          style={css('display:flex;flex-direction:column;gap:13px;')}
        >
          <div>
            <label htmlFor="pickup-name" style={css(label)}>{t('pickup.name')}</label>
            <input id="pickup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus style={css(input)} />
          </div>
          <div>
            <label htmlFor="pickup-mobile" style={css(label)}>{t('pickup.mobile')}</label>
            <input id="pickup-mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder={t('pickup.mobileHint')} autoComplete="off" style={css(input)} />
          </div>
          <div>
            <div id="pickup-channel" style={css(label)}>{t('pickup.how')}</div>
            <div role="radiogroup" aria-labelledby="pickup-channel" style={css('display:flex;gap:7px;')}>
              {(['till', 'phone'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={channel === c} className="pos-press" onClick={() => setChannel(c)} style={css('flex:1;height:46px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid ' + (channel === c ? 'var(--accent)' : 'var(--border)') + ';background:' + (channel === c ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (channel === c ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                  <Icon name={CHANNEL[c].icon} size={16} />
                  {t(CHANNEL[c].label)}
                </button>
              ))}
            </div>
          </div>
          <div style={css('display:flex;gap:9px;margin-top:7px;')}>
            <button type="button" className="pos-press" onClick={close} style={css('width:120px;height:56px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;')}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="pos-press" disabled={!can} style={css('flex:1;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';background:' + (can ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}>
              <Icon name="shopping-bag" size={17} />
              {t('pickup.confirm')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
