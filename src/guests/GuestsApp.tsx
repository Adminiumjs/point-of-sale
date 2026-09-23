import { useEffect } from 'react';
import { useI18n, useT } from '../i18n';
import { setAmbient } from '../i18n/ambient';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { Book } from './Book';
import { CancelSheet, ManageBooking } from './ManageBooking';
import { GuestHeader } from './parts';
import { useGuests, type GuestView } from './store';

/**
 * The Guests pages: the header, the step pills, the page's column, the cancel
 * sheet and the toast. The customer surface mounts it through `GuestsApp`; the
 * demo's till renders it as two of its own screens (`book`, `manage`).
 */
export function GuestsScreen({ view }: { view?: GuestView }) {
  const t = useT();
  const s = useGuests();
  // The demo's till says which page it is showing; the customer surface's URL does it through the store.
  useEffect(() => {
    if (view !== undefined && useGuests.getState().view !== view) useGuests.setState({ view });
  }, [view]);
  const current = view ?? s.view;
  const book = current === 'book';
  const bookSteps = [t('guest.stepWhen'), t('guest.stepDetails'), t('guest.stepConfirmed')];
  const manageSteps = [t('guest.stepFind'), t('guest.stepBooking'), t('guest.stepDone')];
  const manageAt = s.booking === null || s.manageStep === 'find' ? 0 : s.manageStep === 'booking' || s.manageStep === 'when' ? 1 : 2;

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);position:relative;')}>
      <GuestHeader
        subtitle={t(book ? 'guest.bookTitle' : 'guest.manageTitle')}
        steps={book ? bookSteps : manageSteps}
        current={book ? (s.bookStep === 'when' ? 0 : s.bookStep === 'details' ? 1 : 2) : manageAt}
      />
      <main className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px 18px 30px;')}>
        <div className="guest-col">
          {s.loadFailed ? (
            <div role="alert" style={css('display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center;padding:30px 0;')}>
              <Icon name="cloud-off" size={34} color="var(--fg-muted)" />
              <div style={css('font-size:15px;font-weight:700;color:var(--fg-muted);')}>{t('guest.errNetwork', { venue: s.venue?.name || t('guest.theVenue') })}</div>
              <button className="pos-press" onClick={() => s.port !== null && void s.start(s.port)} style={css('height:48px;padding:0 20px;border-radius:13px;border:none;background:var(--accent);color:var(--accent-fg);font-size:15px;font-weight:800;cursor:pointer;')}>
                {t('guest.tryAgain')}
              </button>
            </div>
          ) : s.rules === null ? (
            <div role="status" style={css('padding:30px 0;text-align:center;font-size:14px;font-weight:600;color:var(--fg-muted);')}>{t('guest.loading')}</div>
          ) : book ? (
            <Book />
          ) : (
            <ManageBooking />
          )}
        </div>
      </main>
      <CancelSheet />
      {s.toast !== null && (
        <div role="status" style={css('position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:230;padding:12px 18px;border-radius:14px;background:var(--fg);color:var(--bg);font-size:14px;font-weight:700;box-shadow:var(--shadow-lg);max-width:calc(100% - 32px);')}>
          {s.toast}
        </div>
      )}
    </div>
  );
}

/**
 * The customer surface's root. It has no till around it, so it does the two
 * things the till's `App` does for itself: hands the live locale to the
 * modules outside React, and follows the reader's light or dark setting.
 */
export function GuestsApp() {
  const { locale, t, money, number } = useI18n();
  setAmbient(locale, t, money, number);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = media?.matches ? 'dark' : 'light';
    };
    apply();
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, []);
  return (
    <div className="pos-app">
      <div className="pos-terminal">
        <GuestsScreen />
      </div>
    </div>
  );
}
