import type { ReactNode } from 'react';
import { useI18n, useT } from '../i18n';
import type { BookingDay } from '../state/bookings';
import { venueStamp } from '../data/venueTime';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { useGuests } from './store';

const MONO = "font-family:'JetBrains Mono',monospace;";

/**
 * A value set inside a sentence, isolated so it keeps its own direction: a
 * phone number in an Arabic sentence otherwise reads backwards.
 */
export const isolate = (value: string): string => `\u2066${value}\u2069`;

/** A tile of the party, day or time grid (the comp's `box()`, 2166). */
export const box = (on: boolean) =>
  'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;height:58px;border-radius:14px;cursor:pointer;font-family:inherit;border:1.5px solid ' +
  (on ? 'var(--accent)' : 'var(--border-strong)') +
  ';background:' +
  (on ? 'var(--accent-soft)' : 'var(--surface)') +
  ';color:' +
  (on ? 'var(--accent)' : 'var(--fg)') +
  ';';

/** The page's main button (2167): off-looking and inert until it can do something. */
export const primary = (on: boolean) =>
  'width:100%;height:60px;border-radius:16px;border:none;font-family:inherit;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:9px;cursor:' +
  (on ? 'pointer' : 'not-allowed') +
  ';background:' +
  (on ? 'var(--accent)' : 'var(--surface-3)') +
  ';color:' +
  (on ? 'var(--accent-fg)' : 'var(--fg-subtle)') +
  ';';

export const outline =
  'width:100%;height:54px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;';

export const inputStyle =
  'width:100%;height:54px;padding:0 15px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;';

/** The header every Guests page shares (893-898, 988-994): the venue's mark and name, the page, the steps. */
export function GuestHeader({ subtitle, steps, current }: { subtitle: string; steps: string[]; current: number }) {
  const venue = useGuests((s) => s.venue);
  const name = venue?.name ?? '';
  const mark = (venue?.mark ?? name.charAt(0)) || '•';
  return (
    <header style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;background:var(--surface);border-bottom:1px solid var(--border);')}>
      <div aria-hidden="true" style={css('width:38px;height:38px;border-radius:12px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:-.03em;flex-shrink:0;')}>{mark}</div>
      <div style={css('min-width:0;')}>
        {name !== '' && <div style={css('font-size:16.5px;font-weight:800;letter-spacing:-.02em;')}>{name}</div>}
        <h1 style={css('margin:0;font-size:12px;font-weight:400;color:var(--fg-muted);')}>{subtitle}</h1>
      </div>
      <ol style={css('list-style:none;margin:0;margin-inline-start:auto;padding:0;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;')}>
        {steps.map((label, i) => {
          const on = i === current;
          return (
            <li
              key={label}
              aria-current={on ? 'step' : undefined}
              style={css('font-size:11.5px;font-weight:800;letter-spacing:.02em;padding:5px 11px;border-radius:20px;white-space:nowrap;background:' + (on ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}
            >
              {label}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

export function Label({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div id={id} style={css('font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-subtle);margin-bottom:9px;')}>
      {children}
    </div>
  );
}

/** "Today" / "Tomorrow" / the weekday, and the date under it — on the venue's calendar. */
export function useDayLabels() {
  const t = useT();
  const { date } = useI18n();
  const tz = useGuests((s) => s.port?.timeZone());
  const noon = (d: BookingDay) => new Date(venueStamp(d.day, '12:00', tz));
  return {
    label: (d: BookingDay) => (d.index === 0 ? t('guest.today') : d.index === 1 ? t('guest.tomorrow') : date(noon(d), { weekday: 'long' })),
    sub: (d: BookingDay) => date(noon(d), { weekday: 'short', day: 'numeric' }),
    time: (ms: number) => date(new Date(ms), { hour: 'numeric', minute: '2-digit' }),
  };
}

/** A booking's day and time, as a guest reads it: "Today · 7:30 PM", or the date further out. */
export function useWhen() {
  const { label, time } = useDayLabels();
  const { date } = useI18n();
  const days = useGuests((s) => s.days)();
  const tz = useGuests((s) => s.port?.timeZone());
  return (ms: number) => {
    const d = days.find((x) => venueStamp(x.day, '00:00', tz) <= ms && ms < venueStamp(x.day, '23:59', tz) + 60_000);
    return `${d !== undefined ? label(d) : date(new Date(ms), { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(ms)}`;
  };
}

/** Party sizes 1 … `max_party` (DP10), then the venue's phone for anything bigger. */
export function PartyGrid() {
  const t = useT();
  const s = useGuests();
  const max = Math.max(1, Math.min(12, s.rules?.maxParty ?? 8));
  const phone = s.venue?.phone ?? null;
  return (
    <div>
      <Label id="guest-party">{t('guest.partySize')}</Label>
      <div role="radiogroup" aria-labelledby="guest-party" className="guest-party-grid">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} role="radio" aria-checked={s.party === n} className="pos-press" onClick={() => s.setParty(n)} style={css(box(s.party === n))}>
            <span style={css('font-size:18px;font-weight:800;')}>{n}</span>
            {/* Dimmed only when unselected: on the accent a 75 % line falls below 4.5:1 (the comp's .75 everywhere; DP-A11Y2). */}
            <span style={css('font-size:10.5px;font-weight:600;opacity:' + (s.party === n ? '1' : '.75') + ';')}>{t('guest.guestWord', undefined, n)}</span>
          </button>
        ))}
      </div>
      <div style={css('font-size:12.5px;font-weight:600;color:var(--fg-muted);margin-top:9px;')}>
        {phone === null ? t('guest.moreCallNoPhone', { n: max }) : t('guest.moreCall', { n: max, phone: isolate(phone) })}
      </div>
    </div>
  );
}

export function DayGrid() {
  const t = useT();
  const s = useGuests();
  const { label, sub } = useDayLabels();
  return (
    <div>
      <Label id="guest-day">{t('guest.date')}</Label>
      <div role="radiogroup" aria-labelledby="guest-day" className="guest-day-grid">
        {s.days().map((d) => (
          <button key={d.day} role="radio" aria-checked={s.day === d.index} className="pos-press" onClick={() => s.setDay(d.index)} style={css(box(s.day === d.index))}>
            <span style={css('font-size:14.5px;font-weight:800;')}>{label(d)}</span>
            <span style={css('font-size:11px;font-weight:600;opacity:' + (s.day === d.index ? '1' : '.75') + ';')}>{sub(d)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A day's times, free or full as Adminium answers; a full one is struck through AND says so (DP34). */
export function SlotGrid() {
  const t = useT();
  const s = useGuests();
  const { time } = useDayLabels();
  const d = s.days()[s.day];
  const tz = s.port?.timeZone();
  return (
    <div>
      <Label id="guest-time">{t('guest.time')}</Label>
      {s.slots === null ? (
        <div role="status" style={css('font-size:13.5px;font-weight:600;color:var(--fg-muted);padding:12px 0;')}>{t('guest.loadingTimes')}</div>
      ) : s.slots.length === 0 ? (
        <div role="status" style={css('font-size:13.5px;font-weight:600;color:var(--fg-muted);padding:12px 0;')}>{t('guest.noTimes')}</div>
      ) : (
        <div role="radiogroup" aria-labelledby="guest-time" className="guest-slot-grid">
          {s.slots.map((slot) => {
            const full = slot.state === 'full';
            const on = s.time === slot.time;
            const text = d === undefined ? slot.time : time(venueStamp(d.day, slot.time, tz));
            return (
              <button
                key={slot.time}
                role="radio"
                aria-checked={on}
                aria-disabled={full}
                aria-label={full ? t('guest.slotFull', { time: text }) : text}
                className="pos-press"
                onClick={() => s.pickTime(slot.time, t('guest.toastFull'))}
                style={css(
                  'display:flex;align-items:center;justify-content:center;height:52px;border-radius:13px;font-family:inherit;font-size:14px;font-weight:800;cursor:' +
                    (full ? 'not-allowed' : 'pointer') +
                    ';border:1.5px solid ' +
                    (on ? 'var(--accent)' : 'var(--border)') +
                    ';background:' +
                    (on ? 'var(--accent)' : full ? 'var(--surface-2)' : 'var(--surface)') +
                    ';color:' +
                    (on ? 'var(--accent-fg)' : full ? 'var(--fg-subtle)' : 'var(--fg)') +
                    ';text-decoration:' +
                    (full ? 'line-through' : 'none') +
                    ';',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The rows card (1023-1030, 966-973): label on one side, value on the other. */
export function Rows({ rows }: { rows: { l: string; v: string }[] }) {
  return (
    <dl style={css('margin:0;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface);')}>
      {rows.map((row, i) => (
        <div key={row.l} style={css('display:flex;align-items:flex-start;gap:14px;padding:14px 16px;' + (i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''))}>
          <dt style={css('font-size:13px;font-weight:700;color:var(--fg-muted);flex-shrink:0;')}>{row.l}</dt>
          {/* <bdi>: a phone number keeps its own direction on a right-to-left page. */}
          <dd style={css('margin:0;margin-inline-start:auto;font-size:14.5px;font-weight:700;text-align:end;line-height:1.45;overflow-wrap:anywhere;')}>
            <bdi>{row.v}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A message block: an error (danger), a lockout or a warning (warn), or a plain note. */
export function Notice({ tone, icon, children, alert = false }: { tone: 'danger' | 'warn' | 'plain'; icon: string; children: ReactNode; alert?: boolean }) {
  const fg = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--fg-muted)';
  const bg = tone === 'danger' ? 'var(--danger-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--surface-2)';
  const edge = tone === 'plain' ? 'var(--border)' : 'color-mix(in srgb, ' + fg + ' 30%, transparent)';
  return (
    <div role={alert ? 'alert' : undefined} style={css('display:flex;align-items:center;gap:11px;padding:14px 16px;border-radius:15px;background:' + bg + ';border:1px solid ' + edge + ';color:' + fg + ';')}>
      <Icon name={icon} size={18} />
      <span style={css('flex:1;min-width:0;font-size:13.5px;font-weight:700;line-height:1.45;')}>{children}</span>
    </div>
  );
}

/** A code, big and in mono (the Confirmed and Changed tiles). */
export function CodeBox({ code, small = false }: { code: string; small?: boolean }) {
  return small ? (
    <div style={css('font-size:20px;font-weight:800;letter-spacing:.02em;color:var(--fg-muted);' + MONO)}>{code}</div>
  ) : (
    <div style={css('font-size:26px;font-weight:800;letter-spacing:.02em;padding:11px 22px;border-radius:15px;background:var(--surface);border:1.5px dashed var(--border-strong);' + MONO)}>{code}</div>
  );
}

/** The success / cancelled tile over a result (963-965, 1084-1088, 1102-1106). */
export function ResultHead({ tone, icon, title, note, children }: { tone: 'pos' | 'danger'; icon: string; title: string; note: string; children?: ReactNode }) {
  return (
    <div role="status" style={css('display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:8px 0 4px;')}>
      <div style={css('width:64px;height:64px;border-radius:20px;background:var(--' + tone + '-soft);color:var(--' + tone + ');display:flex;align-items:center;justify-content:center;')}>
        <Icon name={icon} size={32} />
      </div>
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{title}</h2>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:6px;line-height:1.5;')}>{note}</div>
      </div>
      {children}
    </div>
  );
}
