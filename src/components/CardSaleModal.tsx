import { useState } from 'react';
import { isOffline, usePos } from '../state/store';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { WhyOff } from './Figures';
import { css } from './css';

/** The amounts a new card is most often sold for, in the venue's own money. */
const AMOUNTS = [10, 25, 50, 100] as const;

/**
 * Sell a new gift card (Offers & gift cards). The card is made by Offers and
 * sold as a line on the ticket; Adminium puts the money on it when the ticket
 * is paid, and its whole code is shown once, on that receipt. Making a card is
 * the Offers desk role's: someone without it is told who can.
 */
export function CardSaleModal() {
  const s = usePos();
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!s.cardSaleOpen) return null;
  const off = isOffline(s);
  const close = () => s.setCardSale(false);
  return (
    <div onClick={close} style={css('position:absolute;inset:0;z-index:214;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:26px;animation:pos-scrim .18s ease;')}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('cards.sell')} style={css('width:100%;max-width:440px;background:var(--surface);border-radius:22px;padding:24px;box-shadow:0 24px 60px rgba(10,10,20,.32);animation:pos-pop .22s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{t('cards.sell')}</div>
          <button className="pos-press" onClick={close} aria-label={t('common.close')} style={css('margin-inline-start:auto;width:40px;height:40px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin-bottom:10px;')}>{t('cards.sellAmount')}</div>
        <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:10px;')}>
          {AMOUNTS.map((amount) => (
            <button
              key={amount}
              className="pos-press"
              disabled={busy || off}
              onClick={() => {
                setBusy(true);
                void s.sellCard(amount).finally(() => setBusy(false));
              }}
              style={css('height:60px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface);color:' + (off ? 'var(--fg-subtle)' : 'var(--fg)') + ";font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:800;cursor:" + (busy || off ? 'not-allowed' : 'pointer') + ';')}
            >
              {money(amount)}
            </button>
          ))}
        </div>
        {off && <WhyOff>{t('cards.sellOffline')}</WhyOff>}
      </div>
    </div>
  );
}
