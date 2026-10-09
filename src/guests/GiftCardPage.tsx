import { useEffect, useId, useRef, useState } from 'react';
import { formatTenantMoney } from '@adminiumjs/public-client';

import { useI18n, useT } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';
import { Notice, inputStyle, outline, primary } from './parts';
import { cardAsKept, type BalanceDoor, type CardAnswer } from './balance';
import { useGuests } from './store';

const MONO = "font-family:'JetBrains Mono',monospace;";
const fieldLabel = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:7px;';

export type Asked = CardAnswer | { kind: 'idle' } | { kind: 'busy' };

/**
 * One asking: what Adminium said of the typed code, and what is left in the
 * field afterwards — nothing, once there is an answer. The code is the card's
 * money: it has done its work, and is not left on the screen. Only when
 * nobody answered does it stay, to be sent again.
 */
export async function askCard(door: Pick<BalanceDoor, 'byCode'>, typed: string): Promise<{ answer: CardAnswer; code: string }> {
  // Twelve characters after the prefix, or it is no card: said without asking, and the guest puts it right.
  if (cardAsKept(typed) === null) return { answer: { kind: 'invalid' }, code: typed };
  const answer = await door.byCode(typed);
  return { answer, code: answer.kind === 'failed' ? typed : '' };
}

/**
 * A gift card's balance: one field for the code on the card, and what
 * Adminium says is on it — the balance and until when it can be used, nothing
 * else. Opened from the link in the card's email, it reads that card at once.
 *
 * The code is kept nowhere: it is sent in a header (never the address), put in
 * no storage, and gone from the field as soon as Adminium has answered.
 */
export function GiftCardPage() {
  const door = useGuests((s) => s.balance);
  const token = useGuests((s) => s.cardToken);
  const venue = useGuests((s) => s.venue);
  const [code, setCode] = useState('');
  const [asked, setAsked] = useState<Asked>({ kind: 'idle' });

  // The email's link: read once, through Offers' own key, and then forgotten.
  const opened = useRef(false);
  useEffect(() => {
    if (door === null || token === null || opened.current) return;
    opened.current = true;
    useGuests.setState({ cardToken: null });
    // A shop whose Offers has no link key has no link to open: the page asks for the code.
    if (door.byLink === null) return;
    setAsked({ kind: 'busy' });
    void door.byLink(token).then(setAsked);
  }, [door, token]);

  if (door === null) return null;
  return (
    <BalanceView
      asked={asked}
      code={code}
      currency={door.currency}
      venueName={venue?.name ?? null}
      onCode={(next) => {
        setCode(next);
        if (asked.kind !== 'idle' && asked.kind !== 'busy') setAsked({ kind: 'idle' });
      }}
      onAsk={() => {
        if (asked.kind === 'busy' || code.trim() === '') return;
        setAsked({ kind: 'busy' });
        void askCard(door, code).then((said) => {
          setCode(said.code);
          setAsked(said.answer);
        });
      }}
      onAnother={() => setAsked({ kind: 'idle' })}
    />
  );
}

/** The page, given what it holds: the field, or the card's balance. */
export function BalanceView({
  asked,
  code,
  currency,
  venueName,
  onCode,
  onAsk,
  onAnother,
}: {
  asked: Asked;
  code: string;
  currency: string | null;
  venueName: string | null;
  onCode: (code: string) => void;
  onAsk: () => void;
  onAnother: () => void;
}) {
  const t = useT();
  const { locale, date } = useI18n();
  const id = useId();

  if (asked.kind === 'card') {
    return (
      <>
        <div role="status" data-card-balance="" style={css('display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:26px 20px;border-radius:20px;background:var(--surface);border:1px solid var(--border);')}>
          <div aria-hidden="true" style={css('width:60px;height:60px;border-radius:18px;background:var(--pos-soft);color:var(--pos);display:flex;align-items:center;justify-content:center;margin-bottom:6px;')}>
            <Icon name="gift" size={30} />
          </div>
          <h2 style={css('margin:0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);')}>{t('guest.cardBalance')}</h2>
          <div dir="ltr" data-card-figure="" style={css('font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1.1;' + MONO)}>
            {formatTenantMoney(asked.balance, currency, locale)}
          </div>
          <div data-card-until="" style={css('font-size:14px;font-weight:600;color:var(--fg-muted);')}>
            {asked.expiresOn === null
              ? t('guest.cardNoExpiry')
              : t('guest.cardUseBy', { date: date(new Date(`${asked.expiresOn}T12:00:00Z`), { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) })}
          </div>
        </div>
        <button type="button" className="pos-press" onClick={onAnother} style={css(outline)}>
          {t('guest.cardAnother')}
        </button>
      </>
    );
  }

  const busy = asked.kind === 'busy';
  const minutes = asked.kind === 'wait' ? Math.max(1, Math.ceil((asked.seconds ?? 60) / 60)) : 0;
  const message =
    asked.kind === 'invalid'
      ? t('guest.cardInvalid')
      : asked.kind === 'wait'
        ? t('guest.errLockedNoPhone', undefined, minutes)
        : asked.kind === 'failed'
          ? t('guest.errNetwork', { venue: venueName || t('guest.theVenue') })
          : null;
  const can = !busy && code.trim() !== '';
  return (
    <form
      data-card-balance-form=""
      onSubmit={(e) => {
        e.preventDefault();
        onAsk();
      }}
      style={css('display:contents;')}
    >
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{t('guest.cardTitle')}</h2>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:5px;line-height:1.5;')}>{t('guest.cardLede')}</div>
      </div>
      <div>
        <label htmlFor={id} style={css(fieldLabel)}>
          {t('guest.cardLabel')}
        </label>
        <input
          id={id}
          dir="ltr"
          value={code}
          onChange={(e) => onCode(e.target.value)}
          placeholder="GC-0000-0000-0000"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
          aria-invalid={message !== null ? true : undefined}
          aria-describedby={message !== null ? `${id}-said` : undefined}
          style={css(inputStyle + 'letter-spacing:.04em;text-transform:uppercase;' + MONO)}
        />
      </div>
      {message !== null && (
        <div id={`${id}-said`} data-card-said={asked.kind}>
          <Notice tone={asked.kind === 'invalid' ? 'danger' : 'warn'} icon={asked.kind === 'wait' ? 'clock' : asked.kind === 'failed' ? 'cloud-off' : 'x-circle'} alert>
            {message}
          </Notice>
        </div>
      )}
      <button type="submit" className="pos-press" disabled={!can} aria-busy={busy || undefined} style={css(primary(can))}>
        <Icon name="search" size={18} />
        {t(busy ? 'guest.cardChecking' : 'guest.cardCheck')}
      </button>
    </form>
  );
}

/** The Guests side's page for an address it has nothing at. */
export function GuestNotFound({ onBook }: { onBook: () => void }) {
  const t = useT();
  return (
    <div data-guest-not-found="" style={css('display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:30px 0;')}>
      <div aria-hidden="true" style={css('width:64px;height:64px;border-radius:20px;background:var(--surface-2);border:1px solid var(--border);color:var(--fg-subtle);display:flex;align-items:center;justify-content:center;')}>
        <Icon name="search-x" size={30} />
      </div>
      <div>
        <h2 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;')}>{t('guest.notFoundTitle')}</h2>
        <div style={css('font-size:14px;color:var(--fg-muted);margin-top:6px;line-height:1.5;')}>{t('guest.notFoundBody')}</div>
      </div>
      <button type="button" className="pos-press" onClick={onBook} style={css(outline)}>
        <Icon name="calendar-plus" size={18} />
        {t('guest.bookTitle')}
      </button>
    </div>
  );
}
