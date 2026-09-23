import { useEffect, useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { tOr } from '../i18n/ambient';
import type { ReservationStatus } from '../data/types';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { useGuests, type GuestNotice } from './store';
import { CodeBox, DayGrid, Notice, PartyGrid, ResultHead, Rows, SlotGrid, inputStyle, isolate, outline, primary, useWhen } from './parts';

const MONO = "font-family:'JetBrains Mono',monospace;";
const fieldLabel = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:7px;';

const STATUS: Record<ReservationStatus, { label: MessageKey; bg: string; fg: string }> = {
  confirmed: { label: 'guest.statusConfirmed', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  seated: { label: 'guest.statusSeated', bg: 'var(--pos-soft)', fg: 'var(--pos)' },
  no_show: { label: 'guest.statusNoShow', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  cancelled: { label: 'guest.statusCancelled', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

/** "Manage my booking" (§5.8.1): find, the booking, a new time, changed, cancelled. */
export function ManageBooking() {
  const s = useGuests();
  // `find` whenever there is no booking to show (2164).
  const step = s.booking === null ? 'find' : s.manageStep;
  return step === 'find' ? <Find /> : step === 'booking' ? <Booking /> : step === 'when' ? <When /> : step === 'changed' ? <Changed /> : <Cancelled />;
}

/** Minutes until a lockout lifts, kept ticking so the form opens again by itself (DP25). */
function useLockMinutes(notice: GuestNotice | null): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (notice?.kind !== 'locked') return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [notice]);
  if (notice?.kind !== 'locked' || notice.until === undefined) return null;
  const left = notice.until - Date.now();
  return left > 0 ? Math.max(1, Math.ceil(left / 60_000)) : null;
}

function Find() {
  const t = useT();
  const s = useGuests();
  const phone = s.venue?.phone ?? null;
  const lockMinutes = useLockMinutes(s.findError);
  const locked = lockMinutes !== null;
  const can = !locked && !s.finding && s.code.trim() !== '' && s.findMobile.trim() !== '';
  const error = s.findError;
  const message =
    error === null
      ? null
      : locked
        ? phone === null
          ? t('guest.errLockedNoPhone', undefined, lockMinutes)
          : t('guest.errLocked', { phone: isolate(phone) }, lockMinutes)
        : error.kind === 'no-match'
          ? t('guest.errNoMatch')
          : error.kind === 'expired'
            ? t('guest.errExpired')
            : error.kind === 'locked'
              ? null
              : t('guest.errNetwork', { venue: s.venue?.name || t('guest.theVenue') });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void s.find();
      }}
      style={css('display:contents;')}
    >
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{t('guest.findTitle')}</h2>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:5px;line-height:1.5;')}>{t('guest.findLede')}</div>
      </div>
      <div style={css('display:flex;flex-direction:column;gap:12px;')}>
        <div>
          <label htmlFor="manage-code" style={css(fieldLabel)}>{t('guest.code')}</label>
          <input
            id="manage-code"
            value={s.code}
            onChange={(e) => s.setField('code', e.target.value)}
            placeholder="MR-4829"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            style={css(inputStyle + MONO + 'font-weight:700;letter-spacing:.08em;text-transform:uppercase;')}
          />
        </div>
        <div>
          <label htmlFor="manage-mobile" style={css(fieldLabel)}>{t('guest.mobile')}</label>
          <input id="manage-mobile" type="tel" autoComplete="tel" value={s.findMobile} onChange={(e) => s.setField('findMobile', e.target.value)} placeholder={t('guest.findMobileHint')} style={css(inputStyle)} />
        </div>
      </div>
      {message !== null && (
        <Notice tone={locked ? 'warn' : 'danger'} icon={locked ? 'clock' : 'search-x'} alert>
          {message}
        </Notice>
      )}
      <button type="submit" className="pos-press" disabled={!can} style={css(primary(can))}>
        <Icon name="search" size={18} />
        {t(s.finding ? 'guest.finding' : 'guest.find')}
      </button>
      <div style={css('font-size:12.5px;color:var(--fg-muted);text-align:center;line-height:1.5;')}>{t('guest.findFoot')}</div>
    </form>
  );
}

function Booking() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const b = s.booking!;
  const phone = s.venue?.phone ?? null;
  const past = b.startsAt < Date.now();
  const cancelled = b.status === 'cancelled';
  const editable = b.status === 'confirmed' && !past;
  const late = editable && b.startsAt - Date.now() < (s.rules?.cancelHours ?? 2) * 3_600_000;
  const note = cancelled
    ? t('guest.noteCancelled')
    : b.status === 'seated'
      ? t('guest.noteSeated')
      : b.status === 'no_show'
        ? phone === null
          ? t('guest.noteNoShowNoPhone')
          : t('guest.noteNoShow', { phone: isolate(phone) })
        : past
          ? t('guest.notePast')
          : null;
  const st = STATUS[b.status];
  const party = t('guest.guests', undefined, b.partySize);
  const hours = s.rules?.cancelHours ?? 2;
  return (
    <>
      <div style={css('display:flex;align-items:center;gap:10px;')}>
        <span style={css('display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap;background:' + st.bg + ';color:' + st.fg + ';')}>{t(st.label)}</span>
        <span style={css('font-size:13px;font-weight:800;color:var(--fg-muted);' + MONO)}>{b.code}</span>
      </div>
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{when(b.startsAt)}</h2>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:5px;')}>
          {party} · {b.name}
        </div>
      </div>
      <Rows
        rows={[
          { l: t('guest.dateTime'), v: when(b.startsAt) },
          { l: t('guest.party'), v: party },
          { l: t('guest.name'), v: b.name },
          { l: t('guest.occasion'), v: b.occasion === null ? '—' : tOr('occasion.' + b.occasion, b.occasion) },
          { l: t('guest.requestsRow'), v: b.request ?? '—' },
        ]}
      />
      {note !== null && <Notice tone="plain" icon="info">{note}</Notice>}
      {s.manageError !== null && (
        <Notice tone={s.manageError.kind === 'too-late' ? 'warn' : 'danger'} icon="alert-triangle" alert>
          {manageErrorText(t, s.manageError, s.venue?.name || t('guest.theVenue'), phone, hours)}
        </Notice>
      )}
      {/* Change stays open inside the window, as the comp has it (§5.8.7); only Cancel is held back. */}
      {editable && (
        <button className="pos-press" onClick={s.startChange} style={css(primary(true))}>
          <Icon name="calendar-clock" size={18} />
          {t('guest.changeBooking')}
        </button>
      )}
      {editable && !late && (
        <button className="pos-press" onClick={() => s.setCancelOpen(true)} style={css('width:100%;height:58px;border-radius:15px;border:1.5px solid color-mix(in srgb, var(--danger) 45%, transparent);background:var(--surface);color:var(--danger);font-family:inherit;font-size:15.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;')}>
          <Icon name="x-circle" size={18} />
          {t('guest.cancelBooking')}
        </button>
      )}
      {late && (
        <Notice tone="warn" icon="phone">
          {phone === null ? t('guest.tooLateNoPhone', undefined, hours) : t('guest.tooLate', { phone: isolate(phone) }, hours)}
        </Notice>
      )}
      {cancelled && (
        <button className="pos-press" onClick={s.done} style={css(primary(true))}>
          <Icon name="plus" size={17} />
          {t('guest.bookAgain')}
        </button>
      )}
      <button className="pos-press" onClick={s.done} style={css(outline)}>
        {t('guest.done')}
      </button>
    </>
  );
}

function manageErrorText(t: ReturnType<typeof useT>, notice: GuestNotice, venue: string, phone: string | null, hours: number): string {
  switch (notice.kind) {
    case 'full':
      return t('guest.errFilled');
    case 'too-late':
      return phone === null ? t('guest.tooLateNoPhone', undefined, hours) : t('guest.tooLate', { phone: isolate(phone) }, hours);
    case 'network':
      return t('guest.errNetwork', { venue });
    default:
      return t('guest.errRefused');
  }
}

function When() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const b = s.booking!;
  const can = s.time !== '' && !s.saving;
  return (
    <>
      <div style={css('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--accent-soft);border:1px solid color-mix(in srgb, var(--accent) 22%, transparent);')}>
        <Icon name="calendar-clock" size={19} color="var(--accent)" />
        <span style={css('flex:1;min-width:0;font-size:13.5px;font-weight:800;color:var(--accent);line-height:1.4;')}>{t('guest.keepMsg', { code: b.code, when: when(b.startsAt) })}</span>
        <button className="pos-press" onClick={s.keep} style={css('height:36px;padding:0 13px;border-radius:11px;border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);background:var(--surface);color:var(--accent);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;flex-shrink:0;')}>
          {t('guest.keep')}
        </button>
      </div>
      <PartyGrid />
      <DayGrid />
      <SlotGrid />
      {s.manageError !== null && (
        <Notice tone="danger" icon="alert-triangle" alert>
          {manageErrorText(t, s.manageError, s.venue?.name || t('guest.theVenue'), s.venue?.phone ?? null, s.rules?.cancelHours ?? 2)}
        </Notice>
      )}
      <button className="pos-press" disabled={!can} onClick={() => void s.confirmChange()} style={css(primary(can))}>
        <Icon name="check" size={18} />
        {t(s.saving ? 'guest.saving' : 'guest.confirmChange')}
      </button>
    </>
  );
}

function Changed() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  const b = s.booking!;
  const party = t('guest.guests', undefined, b.partySize);
  return (
    <>
      <ResultHead tone="pos" icon="check" title={t('guest.changedTitle')} note={t('guest.changedNote', { when: when(b.startsAt) })}>
        <CodeBox code={b.code} />
      </ResultHead>
      <Rows
        rows={[
          { l: t('guest.newTime'), v: when(b.startsAt) },
          { l: t('guest.party'), v: party },
          { l: t('guest.name'), v: b.name },
        ]}
      />
      <button className="pos-press" onClick={s.keep} style={css(primary(true))}>
        <Icon name="calendar-check" size={18} />
        {t('guest.backToBooking')}
      </button>
      <button className="pos-press" onClick={s.done} style={css(outline)}>
        {t('guest.done')}
      </button>
    </>
  );
}

function Cancelled() {
  const t = useT();
  const s = useGuests();
  const b = s.booking!;
  return (
    <>
      <ResultHead tone="danger" icon="x" title={t('guest.cancelledTitle')} note={t('guest.cancelledNote')}>
        <CodeBox code={b.code} small />
      </ResultHead>
      <button className="pos-press" onClick={s.done} style={css(primary(true))}>
        <Icon name="plus" size={17} />
        {t('guest.bookAgain')}
      </button>
      <button className="pos-press" onClick={s.done} style={css(outline)}>
        {t('guest.done')}
      </button>
    </>
  );
}

/** "Cancel this booking?" (1116-1131): a bottom sheet over the booking. */
export function CancelSheet() {
  const t = useT();
  const s = useGuests();
  const when = useWhen();
  useEffect(() => {
    if (!s.cancelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.setCancelOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.cancelOpen, s]);
  const b = s.booking;
  if (!s.cancelOpen || b === null || s.view !== 'manage') return null;
  return (
    <div onClick={() => s.setCancelOpen(false)} style={css('position:absolute;inset:0;z-index:218;background:rgba(10,10,15,.55);display:flex;align-items:flex-end;justify-content:center;animation:pos-scrim .18s ease;')}>
      <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={(e) => e.stopPropagation()} style={css('width:100%;background:var(--surface);border-radius:26px 26px 0 0;padding:22px 24px 26px;box-shadow:0 -12px 40px rgba(10,10,20,.26);animation:pos-sheet .3s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;justify-content:center;margin-bottom:16px;')}>
          <div style={css('width:44px;height:5px;border-radius:3px;background:var(--border-strong);')} />
        </div>
        <div style={css('max-width:520px;margin:0 auto;')}>
          <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:12px;')}>
            <div style={css('width:46px;height:46px;border-radius:13px;background:var(--danger-soft);color:var(--danger);display:flex;align-items:center;justify-content:center;flex-shrink:0;')}>
              <Icon name="x-circle" size={23} />
            </div>
            <h2 id="cancel-title" style={css('margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('guest.cancelTitle')}</h2>
          </div>
          <p style={css('margin:0 0 18px;font-size:14.5px;color:var(--fg-muted);line-height:1.55;')}>
            {t('guest.cancelDesc', { code: b.code, when: when(b.startsAt), party: t('guest.guests', undefined, b.partySize) })}
          </p>
          <div style={css('display:flex;gap:10px;')}>
            <button className="pos-press" onClick={() => s.setCancelOpen(false)} autoFocus style={css('flex:1;height:58px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;')}>
              {t('guest.keepBooking')}
            </button>
            <button className="pos-press" disabled={s.saving} onClick={() => void s.confirmCancel()} style={css('flex:1;height:58px;border-radius:14px;border:none;background:var(--danger);color:var(--danger-fg);font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
              <Icon name="check" size={18} />
              {t(s.saving ? 'guest.saving' : 'guest.yesCancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
