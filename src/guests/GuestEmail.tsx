import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { usePos } from '../state/store';
import { useGuests } from './store';
import { useWhen } from './parts';

const MONO = "font-family:'JetBrains Mono',monospace;";

/** A mail client's colours: the email is drawn as each would show it. */
const LIGHT = { frame: '#f1f1f4', edge: '#ececef', card: '#ffffff', fg: '#191920', muted: '#55555f', faint: '#6b6b76', rule: '#ececef', dash: '#e2e2e8' };
const DARK = { frame: '#0a0a0d', edge: 'rgba(255,255,255,.1)', card: '#17171c', fg: '#f4f4f6', muted: '#b4b4be', faint: '#9a9aa6', rule: 'rgba(255,255,255,.1)', dash: 'rgba(255,255,255,.16)' };

/**
 * The confirmation email, previewed (COMP 1133-1201) — a DEMO-only view (DP27).
 *
 * Adminium sends the real email (its built-in `booking-confirmation`
 * template, 55-T75); the app never shows it. The demo shows what a guest
 * receives, in a light and a dark mail client, for the last booking made on
 * the guest page (else the demo's MR-4829, read from the till — this view is
 * rendered by the demo's till only). "Manage your booking" opens Manage with the
 * code filled in, as the email's link does.
 */
export function GuestEmail() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const venue = s.venue;
  // The last booking made on the guest page, else the demo's own MR-4829 (this view lives in the demo only).
  const demoBooking = usePos((p) => p.reservations.find((r) => r.code === 'MR-4829'));
  const booked = s.booked ?? (demoBooking === undefined ? null : { code: 'MR-4829', startsAt: demoBooking.startsAt, partySize: demoBooking.partySize, name: demoBooking.name });
  const code = booked?.code ?? 'MR-4829';
  const rows = [
    { l: t('guest.when'), v: booked === null ? '—' : when(booked.startsAt) },
    { l: t('guest.party'), v: t('guest.guests', undefined, booked?.partySize ?? 2) },
    { l: t('guest.name'), v: booked?.name ?? '—' },
  ];
  const card = (c: typeof LIGHT) => (
    <div style={css('background:' + c.frame + ';border:1px solid ' + c.edge + ';border-radius:20px;padding:16px;')}>
      <div style={css('background:' + c.card + ';border-radius:15px;padding:26px 24px;box-shadow:0 1px 3px rgba(20,20,35,.1);')}>
        <div style={css('display:flex;align-items:center;gap:11px;')}>
          <div style={css('width:40px;height:40px;border-radius:12px;background:var(--accent-light);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;letter-spacing:-.03em;')}>{venue?.mark ?? 'D'}</div>
          <div style={css('font-size:15px;font-weight:800;letter-spacing:-.01em;color:' + c.fg + ';')}>{venue?.name}</div>
        </div>
        <div style={css('font-size:23px;font-weight:800;letter-spacing:-.025em;margin:18px 0 7px;color:' + c.fg + ';')}>{t('email.heading')}</div>
        <div style={css('font-size:14px;line-height:1.55;color:' + c.muted + ';')}>{t('email.intro', { venue: venue?.name ?? '' })}</div>
        <div style={css('margin:18px 0;padding:14px;border-radius:14px;border:1.5px dashed ' + c.dash + ';text-align:center;')}>
          <div style={css('font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:' + c.faint + ';')}>{t('guest.code')}</div>
          <div style={css('font-size:24px;font-weight:800;letter-spacing:.02em;margin-top:4px;color:' + c.fg + ';' + MONO)}>{code}</div>
        </div>
        {rows.map((row) => (
          <div key={row.l} style={css('display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid ' + c.rule + ';')}>
            <span style={css('font-size:13px;font-weight:700;color:' + c.muted + ';')}>{row.l}</span>
            <span style={css('font-size:14.5px;font-weight:700;margin-inline-start:auto;text-align:end;color:' + c.fg + ';')}>
              <bdi>{row.v}</bdi>
            </span>
          </div>
        ))}
        {/* The email's own colour, whatever the app's theme: a mail client does not take on the demo's dark accent, and white on it falls below 4.5:1. */}
        <button className="pos-press" onClick={() => s.openManage(code)} style={css('width:100%;height:52px;margin-top:20px;border-radius:14px;border:none;background:var(--accent-light);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
          {t('guest.manageTitle')}
          <Icon name="arrow-right" size={17} className="rtl-flip" />
        </button>
        <div style={css('font-size:12.5px;font-weight:600;text-align:center;margin-top:11px;color:' + c.muted + ';')}>{t('email.cancel', undefined, s.rules?.cancelHours ?? 2)}</div>
        <div style={css('border-top:1px solid ' + c.rule + ';margin-top:20px;padding-top:15px;text-align:center;font-size:12px;font-weight:600;line-height:1.65;color:' + c.faint + ';')}>
          <bdi>{venue?.address}</bdi>
          <br />
          <bdi>{venue?.phone}</bdi>
        </div>
      </div>
    </div>
  );
  const column = (label: string, c: typeof LIGHT) => (
    <div style={css('flex:1 1 340px;min-width:min(290px,100%);max-width:410px;display:flex;flex-direction:column;gap:9px;')}>
      <div style={css('font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);')}>{label}</div>
      {card(c)}
    </div>
  );
  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <header style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--surface);border-bottom:1px solid var(--border);')}>
        <div aria-hidden="true" style={css('width:38px;height:38px;border-radius:12px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:-.03em;')}>{venue?.mark ?? 'D'}</div>
        <div>
          <div style={css('font-size:16.5px;font-weight:800;letter-spacing:-.02em;')}>{venue?.name}</div>
          <h1 style={css('margin:0;font-size:12px;font-weight:400;color:var(--fg-muted);')}>{t('email.title')}</h1>
        </div>
        <span style={css('margin-inline-start:auto;font-size:11.5px;font-weight:800;padding:5px 11px;border-radius:20px;background:var(--surface-3);color:var(--fg-muted);white-space:nowrap;')}>{t('email.preview')}</span>
      </header>
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px 18px 30px;')}>
        <div style={css('display:flex;flex-wrap:wrap;gap:18px;justify-content:center;align-items:flex-start;max-width:900px;margin:0 auto;')}>
          {column(t('email.light'), LIGHT)}
          {column(t('email.dark'), DARK)}
        </div>
      </div>
    </div>
  );
}
