import { useI18n, useT } from '../i18n';
import { tOr } from '../i18n/ambient';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { useGuests } from './store';
import { CodeBox, DayGrid, Label, Notice, PartyGrid, ResultHead, Rows, SlotGrid, inputStyle, isolate, outline, primary, useWhen } from './parts';

const fieldLabel = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:7px;';

/** Book a table (COMP 890-983): When, Details, Confirmed. */
export function Book() {
  const step = useGuests((s) => s.bookStep);
  return step === 'when' ? <When /> : step === 'details' ? <Details /> : <Confirmed />;
}

function When() {
  const t = useT();
  const s = useGuests();
  const { locale } = useI18n();
  const rules = s.rules;
  // A wall time of the venue's, written the reader's way ("5:00 PM", "17:00") — no zone to convert.
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h, m));
  };
  const can = s.time !== '';
  return (
    <>
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{t('guest.reserveTitle')}</h2>
        {rules !== null && (
          <div style={css('font-size:14px;color:var(--fg-muted);margin-top:5px;line-height:1.5;')}>
            {t('guest.service', { opens: at(rules.opens), closes: at(rules.closes), hold: rules.holdMinutes })}
          </div>
        )}
      </div>
      {s.bookError !== null && <Notice tone="danger" icon="alert-triangle" alert>{t(s.bookError.kind === 'full' ? 'guest.errFilled' : 'guest.errNetwork', { venue: s.venue?.name || t('guest.theVenue') })}</Notice>}
      <PartyGrid />
      <DayGrid />
      <SlotGrid />
      <button className="pos-press" disabled={!can} onClick={s.bookNext} style={css(primary(can))}>
        {t('guest.continue')}
        <Icon name="arrow-right" size={18} className="rtl-flip" />
      </button>
      <button className="pos-press" onClick={() => s.openManage('')} style={css('align-self:center;height:40px;padding:0 12px;border:none;background:transparent;color:var(--accent);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;margin-top:-6px;')}>
        {t('guest.alreadyBooked')}
      </button>
    </>
  );
}

function Details() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const at = s.chosenStamp();
  const can = s.name.trim() !== '' && s.mobile.trim() !== '' && !s.saving;
  const occasions = ['', ...(s.rules?.occasions ?? [])];
  const pill = (on: boolean) =>
    'height:40px;padding:0 15px;border-radius:12px;cursor:pointer;font-size:13.5px;font-weight:700;font-family:inherit;border:1.5px solid ' +
    (on ? 'var(--accent)' : 'var(--border)') +
    ';background:' +
    (on ? 'var(--accent-soft)' : 'var(--surface)') +
    ';color:' +
    (on ? 'var(--accent)' : 'var(--fg-muted)') +
    ';';
  return (
    <>
      <div style={css('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--accent-soft);border:1px solid color-mix(in srgb, var(--accent) 22%, transparent);')}>
        <Icon name="calendar-check" size={19} color="var(--accent)" />
        <span style={css('flex:1;min-width:0;font-size:14.5px;font-weight:800;color:var(--accent);')}>
          {t('guest.guests', undefined, s.party)} · {at === null ? '' : when(at)}
        </span>
        <button className="pos-press" onClick={s.bookBack} style={css('height:36px;padding:0 13px;border-radius:11px;border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);background:var(--surface);color:var(--accent);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;flex-shrink:0;')}>
          {t('guest.change')}
        </button>
      </div>
      <div style={css('display:flex;flex-direction:column;gap:12px;')}>
        <div>
          <label htmlFor="guest-name" style={css(fieldLabel)}>{t('guest.fullName')}</label>
          <input id="guest-name" autoComplete="name" value={s.name} onChange={(e) => s.setField('name', e.target.value)} placeholder={t('guest.fullNameHint')} style={css(inputStyle)} />
        </div>
        <div>
          <label htmlFor="guest-mobile" style={css(fieldLabel)}>{t('guest.mobile')}</label>
          <input id="guest-mobile" type="tel" autoComplete="tel" value={s.mobile} onChange={(e) => s.setField('mobile', e.target.value)} placeholder={t('guest.mobileHint')} style={css(inputStyle)} />
        </div>
        <div>
          <label htmlFor="guest-email" style={css(fieldLabel)}>
            {t('guest.email')} <span style={css('font-weight:600;color:var(--fg-muted);')}>{t('guest.optional')}</span>
          </label>
          <input id="guest-email" type="email" autoComplete="email" value={s.email} onChange={(e) => s.setField('email', e.target.value)} placeholder="you@email.com" style={css(inputStyle)} />
        </div>
      </div>
      {occasions.length > 1 && (
        <div>
          <Label id="guest-occasion">{t('guest.occasion')}</Label>
          <div role="radiogroup" aria-labelledby="guest-occasion" style={css('display:flex;flex-wrap:wrap;gap:7px;')}>
            {occasions.map((o) => (
              <button key={o || 'none'} role="radio" aria-checked={s.occasion === o} className="pos-press" onClick={() => s.setField('occasion', o)} style={css(pill(s.occasion === o))}>
                {o === '' ? t('guest.occasionNone') : tOr('occasion.' + o, o)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label htmlFor="guest-request" style={css('display:block;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-subtle);margin-bottom:9px;')}>{t('guest.requests')}</label>
        <textarea id="guest-request" value={s.request} onChange={(e) => s.setField('request', e.target.value)} placeholder={t('guest.requestsHint')} style={css('width:100%;min-height:92px;padding:13px 15px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:500;font-family:inherit;resize:none;outline:none;box-sizing:border-box;')} />
      </div>
      {s.bookError !== null && <Notice tone="danger" icon="alert-triangle" alert>{t(s.bookError.kind === 'refused' ? 'guest.errRefused' : 'guest.errNetwork', { venue: s.venue?.name || t('guest.theVenue') })}</Notice>}
      <button className="pos-press" disabled={!can} onClick={() => void s.submitBooking()} style={css(primary(can))}>
        <Icon name="check" size={18} />
        {t(s.saving ? 'guest.booking' : 'guest.confirm')}
      </button>
      <div style={css('font-size:12.5px;color:var(--fg-muted);text-align:center;line-height:1.5;')}>{t('guest.noCard', undefined, s.rules?.cancelHours ?? 2)}</div>
    </>
  );
}

function Confirmed() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const b = s.booked;
  if (b === null) return null;
  const rows = [
    { l: t('guest.rowGuest'), v: b.name },
    { l: t('guest.party'), v: t('guest.guests', undefined, b.partySize) },
    { l: t('guest.when'), v: when(b.startsAt) },
    { l: t('guest.contact'), v: b.mobile },
    ...(b.occasion !== null ? [{ l: t('guest.occasion'), v: tOr('occasion.' + b.occasion, b.occasion) }] : []),
    ...(b.request !== null ? [{ l: t('guest.request'), v: b.request }] : []),
  ];
  return (
    <>
      <ResultHead
        tone="pos"
        icon="check"
        title={t('guest.booked')}
        // Mail only when there is an address; there is no text message to promise (DP21).
        note={b.email !== null ? t('guest.bookedEmail', { email: isolate(b.email) }) : t('guest.bookedNoEmail')}
      >
        <CodeBox code={b.code} />
      </ResultHead>
      <Rows rows={rows} />
      <button className="pos-press" onClick={s.bookReset} style={css(outline)}>
        <Icon name="plus" size={17} />
        {t('guest.bookAnother')}
      </button>
      <button className="pos-press" onClick={() => void s.manageThis()} style={css('align-self:center;height:40px;padding:0 12px;border:none;background:transparent;color:var(--accent);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;')}>
        {t('guest.manageThis')}
      </button>
    </>
  );
}
