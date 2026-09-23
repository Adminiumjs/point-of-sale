import { useEffect, useState } from 'react';
import { usePos } from '../state/store';
import { source } from '../data/source';
import { tableName } from '../state/calc';
import { bookingDays, dayIndexOf, daySlots, liveOn, slotFull, slotStamp, tablesFor, type BookingDay } from '../state/bookings';
import type { Reservation, ReservationStatus, TableInfo } from '../data/types';
import { tenantZone, tOr } from '../i18n/ambient';
import { useI18n, useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader, MONO } from '../components/AuxHeader';
import { css } from '../components/css';

const STATUS: Record<ReservationStatus, { label: MessageKey; bg: string; fg: string }> = {
  confirmed: { label: 'resv.statusConfirmed', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  seated: { label: 'resv.statusSeated', bg: 'var(--pos-soft)', fg: 'var(--pos)' },
  no_show: { label: 'resv.statusNoShow', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  cancelled: { label: 'resv.statusCancelled', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};
const CHANNEL_ICON: Record<Reservation['channel'], string> = { online: 'globe', phone: 'phone', walk_in: 'footprints' };

const pill = (st: ReservationStatus) =>
  'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap;flex-shrink:0;background:' +
  STATUS[st].bg +
  ';color:' +
  STATUS[st].fg +
  ';';

const act = (kind: 'primary' | 'plain' | 'warn' | 'danger') => {
  const bg = { primary: 'var(--accent)', plain: 'var(--surface)', warn: 'var(--warn-soft)', danger: 'var(--danger-soft)' }[kind];
  const fg = { primary: 'var(--accent-fg)', plain: 'var(--fg)', warn: 'var(--warn)', danger: 'var(--danger)' }[kind];
  return (
    'display:flex;align-items:center;justify-content:center;gap:8px;height:50px;padding:0 14px;border-radius:13px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:800;text-decoration:none;border:' +
    (kind === 'primary' ? 'none' : '1px solid var(--border-strong)') +
    ';background:' +
    bg +
    ';color:' +
    fg +
    ';'
  );
};

/** A day's tab label: Today, Tomorrow, then the weekday. */
function useDayLabel() {
  const t = useT();
  const { date } = useI18n();
  return (d: BookingDay) =>
    d.index === 0 ? t('resv.today') : d.index === 1 ? t('resv.tomorrow') : date(new Date(slotStamp(d.day, '12:00', tenantZone())), { weekday: 'short' });
}

/** The table a booking names, as the floor labels it. */
const tableOf = (floor: TableInfo[], id: string | null): TableInfo | undefined =>
  id === null ? undefined : floor.find((x) => x.id === id || x.label === id);

/**
 * Reservations (comp 818-888), with Appendix D's fixes: "Seat now" picks a
 * table the party fits, No-show and Cancel go once a party is seated, the staff
 * note is its own field, and a phone booking and a reinstated one take their
 * place through the same capacity check as a guest's.
 */
export function Reservations() {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  const dayLabel = useDayLabel();
  const tz = tenantZone();
  const rules = source.bookingRules();
  const days = bookingDays(rules, Date.now(), tz);
  const dayIdx = Math.min(s.resvDay, days.length - 1);
  const list = s.reservations.filter((r) => dayIndexOf(r, days, tz) === dayIdx).sort((a, b) => a.startsAt - b.startsAt);
  const current = list.find((r) => r.id === s.resvSel) ?? list[0] ?? null;
  const live = liveOn(s.reservations, days, dayIdx, tz);
  const covers = live.reduce((sum, r) => sum + r.partySize, 0);
  const [tableOpen, setTableOpen] = useState(false);
  const [note, setNote] = useState(current?.note ?? '');
  useEffect(() => setNote(current?.note ?? ''), [current?.id, current?.note]);
  const time = (ms: number) => date(new Date(ms), { hour: 'numeric', minute: '2-digit' });
  const guests = (n: number) => t('resv.guests', undefined, n);

  const rows: { l: string; v: string; ic: string }[] =
    current === null
      ? []
      : [
          { l: t('resv.party'), v: guests(current.partySize), ic: 'users' },
          { l: t('resv.when'), v: `${dayLabel(days[dayIdx]!)} · ${time(current.startsAt)}`, ic: 'clock' },
          { l: t('resv.table'), v: tableOf(s.floor, current.tableId) ? tableName(tableOf(s.floor, current.tableId)!.label, 'restaurant') : t('resv.notAssigned'), ic: 'armchair' },
          { l: t('resv.phone'), v: current.mobile ?? '—', ic: 'phone' },
          { l: t('resv.email'), v: current.email ?? '—', ic: 'mail' },
          { l: t('resv.via'), v: t(current.channel === 'phone' ? 'resv.viaPhone' : current.channel === 'walk_in' ? 'resv.viaWalkIn' : 'resv.viaOnline'), ic: current.channel === 'phone' ? 'phone-call' : 'globe' },
          ...(current.occasion !== null && current.occasion !== '' ? [{ l: t('resv.occasion'), v: tOr('occasion.' + current.occasion, current.occasion), ic: 'party-popper' }] : []),
          ...(current.request !== null && current.request !== '' ? [{ l: t('resv.request'), v: current.request, ic: 'message-square-text' }] : []),
        ];
  const confirmed = current?.status === 'confirmed';
  const ended = current?.status === 'cancelled' || current?.status === 'no_show';

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader
        wrap
        title={t('resv.title')}
        sub={t('resv.sub', { bookings: t('resv.bookings', undefined, live.length), covers: t('resv.covers', undefined, covers) })}
        onBack={() => usePos.setState({ view: 'register' })}
        backLabel={t('nav.register')}
      >
        <div role="tablist" aria-label={t('resv.days')} style={css('display:flex;gap:6px;margin-inline-start:auto;flex-wrap:wrap;')}>
          {days.map((d) => {
            const on = d.index === dayIdx;
            const count = liveOn(s.reservations, days, d.index, tz).length;
            return (
              <button key={d.day} role="tab" aria-selected={on} className="pos-press" onClick={() => s.resvSetDay(d.index)} style={css('display:flex;align-items:center;gap:7px;height:38px;padding:0 13px;border-radius:11px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;border:1px solid ' + (on ? 'transparent' : 'var(--border)') + ';background:' + (on ? 'var(--accent)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}>
                {dayLabel(d)}
                {/* The comp lightens the accent under the count (white .22); that drops white 12px text below 4.5:1, so it darkens instead (DP-A11Y1). */}
                <span style={css('font-size:11.5px;font-weight:800;padding:1px 7px;border-radius:20px;background:' + (on ? 'rgba(0,0,0,.2)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';' + MONO)}>{count}</span>
              </button>
            );
          })}
        </div>
        <button className="pos-press" onClick={() => usePos.setState({ resvNewOpen: true })} aria-label={t('resv.new')} style={css('height:46px;padding:0 17px;border-radius:13px;border:none;background:var(--accent);color:var(--accent-fg);font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;')}>
          <Icon name="plus" size={17} />
          <span className="aux-back-label">{t('resv.newShort')}</span>
        </button>
      </AuxHeader>
      <div className="resv-body">
        <div className="pos-scroll resv-list">
          {list.map((r) => {
            const on = current?.id === r.id;
            const table = tableOf(s.floor, r.tableId);
            return (
              <button key={r.id} className="pos-press resv-row" aria-pressed={on} onClick={() => s.resvPick(r.id)} style={css('width:100%;text-align:start;padding:12px 13px;border-radius:15px;cursor:pointer;font-family:inherit;color:var(--fg);border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';')}>
                <span className="resv-time" style={css('font-size:15px;font-weight:800;flex-shrink:0;color:' + (on ? 'var(--accent)' : 'var(--fg)') + ';' + MONO)}>{time(r.startsAt)}</span>
                <span className="resv-main" style={css('min-width:0;display:flex;flex-direction:column;gap:3px;')}>
                  <span style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                    <span style={css('font-size:15.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{r.name}</span>
                    <Icon name={CHANNEL_ICON[r.channel]} size={13} color="var(--fg-subtle)" />
                  </span>
                  <span style={css('font-size:12.5px;color:var(--fg-muted);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                    {guests(r.partySize)} · {table ? tableName(table.label, 'restaurant') : t('resv.noTable')}
                  </span>
                </span>
                {r.occasion !== null && r.occasion !== '' && (
                  <span className="resv-occasion" style={css('font-size:11.5px;font-weight:700;color:var(--fg-muted);background:var(--surface-3);padding:3px 9px;border-radius:20px;white-space:nowrap;')}>
                    {tOr('occasion.' + r.occasion, r.occasion)}
                  </span>
                )}
                <span className="resv-status" style={css(pill(r.status))}>{t(STATUS[r.status].label)}</span>
              </button>
            );
          })}
          {list.length === 0 && <div style={css('text-align:center;padding:36px 20px;font-size:14px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;')}>{t('resv.empty')}</div>}
        </div>
        <aside className="pos-scroll resv-aside" aria-label={current?.name ?? t('resv.title')}>
          {current !== null && (
            <>
              <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:16px;')}>
                <div aria-hidden="true" style={css('width:46px;height:46px;border-radius:14px;flex-shrink:0;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;')}>{initials(current.name)}</div>
                <div style={css('flex:1;min-width:0;')}>
                  <div style={css('font-size:17px;font-weight:800;letter-spacing:-.02em;')}>{current.name}</div>
                  <div style={css('font-size:12.5px;color:var(--fg-muted);margin-top:2px;' + MONO)}>{current.code ?? t('resv.saving')}</div>
                </div>
                <span style={css(pill(current.status))}>{t(STATUS[current.status].label)}</span>
              </div>
              <dl style={css('margin:0 0 14px;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:15px;overflow:hidden;')}>
                {rows.map((row, i) => (
                  <div key={row.l} style={css('display:flex;align-items:center;gap:10px;padding:11px 13px;background:var(--surface-2);' + (i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''))}>
                    <Icon name={row.ic} size={15} color="var(--fg-subtle)" />
                    <dt style={css('font-size:12.5px;font-weight:700;color:var(--fg-muted);min-width:78px;')}>{row.l}</dt>
                    {/* <bdi>: a phone number or an address keeps its own direction on a right-to-left page. */}
                    <dd style={css('margin:0;margin-inline-start:auto;font-size:13.5px;font-weight:700;text-align:end;overflow-wrap:anywhere;')}>
                      <bdi>{row.v}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
              <label htmlFor="resv-note" style={css('display:block;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:8px;')}>{t('resv.staffNote')}</label>
              <textarea id="resv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('resv.staffNoteHint')} style={css('width:100%;min-height:74px;padding:12px 14px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface-2);color:var(--fg);font-size:14px;font-weight:500;font-family:inherit;resize:none;outline:none;box-sizing:border-box;')} />
              <button className="pos-press" onClick={() => s.saveResvNote(current.id, note)} disabled={(current.note ?? '') === note.trim()} style={css('margin-top:8px;height:42px;padding:0 15px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:13.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:7px;')}>
                <Icon name="check" size={15} />
                {t('resv.saveNote')}
              </button>
              <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px;')}>
                {confirmed && (
                  <button className="pos-press" onClick={() => s.seatResv(current.id)} style={css(act('primary') + 'grid-column:1 / -1;')}>
                    <Icon name="armchair" size={17} />
                    {t('resv.seatNow')}
                  </button>
                )}
                {current.status !== 'seated' && (
                  <button className="pos-press" onClick={() => setTableOpen(true)} style={css(act('plain'))}>
                    <Icon name="arrow-left-right" size={16} />
                    {t('resv.tableAction')}
                  </button>
                )}
                {/* The till sends no text: "Message" opens the device's own messaging (DP29). */}
                {current.mobile !== null && (
                  <a className="pos-press" href={'sms:' + current.mobile.replace(/[^\d+]/g, '')} style={css(act('plain'))}>
                    <Icon name="message-square" size={16} />
                    {t('resv.message')}
                  </a>
                )}
                {confirmed && (
                  <button className="pos-press" onClick={() => s.setResvStatus(current.id, 'no_show')} style={css(act('warn'))}>
                    <Icon name="user-x" size={16} />
                    {t('resv.noShow')}
                  </button>
                )}
                {confirmed && (
                  <button className="pos-press" onClick={() => s.setResvStatus(current.id, 'cancelled')} style={css(act('danger'))}>
                    <Icon name="x-circle" size={16} />
                    {t('resv.cancel')}
                  </button>
                )}
                {ended && (
                  <button className="pos-press" onClick={() => s.setResvStatus(current.id, 'confirmed')} style={css(act('plain') + 'grid-column:1 / -1;')}>
                    <Icon name="rotate-ccw" size={16} />
                    {t('resv.reinstate')}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {s.resvNewOpen && <NewReservation days={days} startDay={dayIdx} onClose={() => usePos.setState({ resvNewOpen: false })} />}
      {tableOpen && current !== null && <AssignTable r={current} onClose={() => setTableOpen(false)} />}
    </div>
  );
}

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((x) => x.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

function Sheet({ title, sub, icon, onClose, width, children }: { title: string; sub: string; icon?: string; onClose: () => void; width: number; children: React.ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={css('position:absolute;inset:0;z-index:210;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div role="dialog" aria-modal="true" aria-label={title} className="pos-scroll" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:211;width:min(' + width + 'px, calc(100% - 32px));max-height:88%;overflow-y:auto;background:var(--surface);border-radius:24px;padding:22px;box-shadow:0 24px 60px rgba(10,10,20,.3);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          {icon !== undefined && (
            <div style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;')}>
              <Icon name={icon} size={21} />
            </div>
          )}
          <div style={css('flex:1;min-width:0;')}>
            <div style={css('font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{title}</div>
            <div style={css('font-size:12.5px;color:var(--fg-muted);')}>{sub}</div>
          </div>
          <button className="pos-press" onClick={onClose} aria-label={t('common.close')} style={css('width:40px;height:40px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** New reservation (comp 1203-1238): a booking taken by phone or at the door. */
function NewReservation({ days, startDay, onClose }: { days: BookingDay[]; startDay: number; onClose: () => void }) {
  const t = useT();
  const { date } = useI18n();
  const dayLabel = useDayLabel();
  const s = usePos();
  const tz = tenantZone();
  const rules = source.bookingRules();
  const slots = daySlots(rules);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [party, setParty] = useState(2);
  const [day, setDay] = useState(startDay);
  const [slot, setSlot] = useState(slots.includes('19:00') ? '19:00' : (slots[0] ?? ''));
  const [note, setNote] = useState('');
  const d = days[day] ?? days[0]!;
  const now = Date.now();
  const stampOf = (time: string) => slotStamp(d.day, time, tz);
  const closed = (time: string) => stampOf(time) < now || slotFull(s.reservations, rules, stampOf(time), party);
  const can = name.trim() !== '' && mobile.trim() !== '' && slot !== '' && !closed(slot);
  const input = 'width:100%;height:50px;padding:0 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;';
  const label = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:6px;';
  const stepBtn = 'width:42px;height:42px;border-radius:10px;border:none;background:var(--surface);color:var(--fg);display:flex;align-items:center;justify-content:center;cursor:pointer;';
  const submit = () => {
    if (!can) return;
    if (s.createResv({ name, mobile, party, startsAt: stampOf(slot), note })) {
      s.resvSetDay(day);
      onClose();
    }
  };
  return (
    <Sheet title={t('resv.newTitle')} sub={t('resv.newSub')} icon="calendar-plus" onClose={onClose} width={520}>
      <div style={css('display:flex;flex-direction:column;gap:13px;')}>
        <div>
          <label htmlFor="nr-name" style={css(label)}>{t('resv.guestName')}</label>
          <input id="nr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('resv.guestNameHint')} autoComplete="off" style={css(input)} />
        </div>
        <div>
          <label htmlFor="nr-phone" style={css(label)}>{t('resv.phone')}</label>
          <input id="nr-phone" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+1 415 555 0000" autoComplete="off" style={css(input)} />
        </div>
        <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;')}>
          <span id="nr-party" style={css('font-size:12.5px;font-weight:800;color:var(--fg-muted);')}>{t('resv.partySize')}</span>
          <div role="group" aria-labelledby="nr-party" style={css('display:flex;align-items:center;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:13px;padding:4px;')}>
            <button className="pos-press" aria-label={t('ticket.decrease')} onClick={() => setParty((p) => Math.max(1, p - 1))} style={css(stepBtn)}>
              <Icon name="minus" size={18} />
            </button>
            <span aria-live="polite" style={css('min-width:44px;text-align:center;font-size:19px;font-weight:800;' + MONO)}>{party}</span>
            <button className="pos-press" aria-label={t('ticket.increase')} onClick={() => setParty((p) => Math.min(20, p + 1))} style={css(stepBtn)}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <div>
          <div id="nr-day" style={css(label)}>{t('resv.day')}</div>
          <div role="radiogroup" aria-labelledby="nr-day" style={css('display:flex;flex-wrap:wrap;gap:7px;')}>
            {days.map((x) => {
              const on = x.index === day;
              return (
                <button key={x.day} role="radio" aria-checked={on} className="pos-press" onClick={() => setDay(x.index)} style={css('height:40px;padding:0 14px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (on ? 'var(--accent)' : 'var(--fg-muted)') + ';')}>
                  {dayLabel(x)}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div id="nr-time" style={css(label)}>{t('resv.time')}</div>
          <div role="radiogroup" aria-labelledby="nr-time" style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:7px;')}>
            {slots.map((x) => {
              const on = x === slot;
              const off = closed(x);
              const label$ = date(new Date(stampOf(x)), { hour: 'numeric', minute: '2-digit' });
              return (
                <button key={x} role="radio" aria-checked={on} disabled={off} aria-label={off ? t('resv.slotFull', { time: label$ }) : label$} className="pos-press" onClick={() => setSlot(x)} style={css('height:44px;border-radius:12px;font-family:inherit;font-size:13.5px;font-weight:800;border:1.5px solid ' + (on && !off ? 'var(--accent)' : 'var(--border)') + ';background:' + (on && !off ? 'var(--accent)' : off ? 'var(--surface-2)' : 'var(--surface)') + ';color:' + (on && !off ? 'var(--accent-fg)' : off ? 'var(--fg-subtle)' : 'var(--fg)') + ';cursor:' + (off ? 'not-allowed' : 'pointer') + ';' + (off ? 'text-decoration:line-through;' : ''))}>
                  {label$}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label htmlFor="nr-note" style={css(label)}>{t('resv.note')}</label>
          <textarea id="nr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('resv.noteHint')} style={css('width:100%;min-height:70px;padding:12px 14px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:500;font-family:inherit;resize:none;outline:none;box-sizing:border-box;')} />
        </div>
      </div>
      <div style={css('display:flex;gap:9px;margin-top:20px;')}>
        <button className="pos-press" onClick={onClose} style={css('width:120px;height:56px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;')}>
          {t('common.cancel')}
        </button>
        <button className="pos-press" disabled={!can} onClick={submit} style={css('flex:1;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';background:' + (can ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}>
          <Icon name="check" size={17} />
          {t('resv.add')}
        </button>
      </div>
    </Sheet>
  );
}

/** Assign a table (comp 1240-1254): only free tables the party fits at (Appendix D 12). */
function AssignTable({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const t = useT();
  const s = usePos();
  const fits = tablesFor(s.floor, r.partySize);
  return (
    <Sheet title={t('resv.assignTitle')} sub={`${r.name} · ${r.code ?? ''}`} onClose={onClose} width={480}>
      {fits.length === 0 ? (
        <div style={css('text-align:center;padding:26px 16px;font-size:14px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;')}>{t('resv.toastNoTable', { n: r.partySize })}</div>
      ) : (
        <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:9px;')}>
          {fits.map((x) => {
            const on = tableOf(s.floor, r.tableId)?.label === x.label;
            return (
              <button
                key={x.label}
                className="pos-press"
                aria-pressed={on}
                onClick={() => {
                  s.assignResvTable(r.id, x);
                  onClose();
                }}
                style={css('display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:14px;border-radius:15px;cursor:pointer;font-family:inherit;text-align:start;border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:var(--surface);color:var(--fg);')}
              >
                <span style={css('font-size:17px;font-weight:800;' + MONO)}>{x.label}</span>
                <span style={css('font-size:12px;color:var(--fg-muted);font-weight:600;')}>{t('common.seatsCount', undefined, x.seats)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
