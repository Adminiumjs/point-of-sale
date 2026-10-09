import { useState } from 'react';
import { usePos } from '../state/store';
import type { CardPrint } from '../state/cardPrints';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

/**
 * New gift cards whose sale is paid and which have not been printed yet.
 *
 * A card's whole code is never on a screen of the till: Offers & gift cards
 * draws the card once, for the person who sold it, and the till opens that
 * page to print. The same row shows on the receipt screen and — after a
 * reload — on the register, so a card sold a moment ago can still be printed.
 */
export function CardPrints({ compact = false }: { compact?: boolean }) {
  const prints = usePos((s) => s.cardPrints);
  const ask = usePos((s) => s.cardPrintUrl);
  const held = usePos((s) => s.cardPrintHeld);
  const printed = usePos((s) => s.cardPrinted);
  const toast = usePos((s) => s.showToast);
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const ready = prints.filter((one) => one.paid);
  if (ready.length === 0) return null;

  const print = (card: CardPrint) => {
    if (busy !== null) return;
    /*
     * The page is opened first, inside the tap, and pointed at the card once
     * Adminium has said where it is: a browser lets a tap open a page, not an
     * answer that arrives later. Blocked, nothing is asked — the ticket that
     * prints the card is good for one use and is not spent on a page nobody sees.
     */
    // The address is already in hand (the page asked for it was closed too soon): it is opened inside this tap.
    const ready = held(card.cardId);
    const page = window.open(ready ?? '', '_blank');
    if (page === null) {
      toast(t('cards.printPopup'), 'error');
      return;
    }
    if (ready !== null) {
      printed(card.cardId);
      return;
    }
    setBusy(card.cardId);
    void ask(card.cardId)
      .then((url) => {
        if (url === null) {
          page.close();
          return;
        }
        // Closed before the answer came: the address is kept, and the next tap opens it.
        if (page.closed) {
          toast(t('cards.printAgain'), 'error');
          return;
        }
        page.location.replace(url);
        // Only now, with a page open on it, is the card's entry gone.
        printed(card.cardId);
      })
      .finally(() => setBusy(null));
  };

  return <CardPrintRows ready={ready} busy={busy !== null} onPrint={print} compact={compact} />;
}

/** The rows themselves: one per card that can be printed now. */
export function CardPrintRows({ ready, busy, onPrint, compact = false }: { ready: readonly CardPrint[]; busy: boolean; onPrint: (card: CardPrint) => void; compact?: boolean }) {
  const t = useT();
  if (ready.length === 0) return null;
  return (
    <div role="region" aria-label={t('cards.newCode')} className="no-print" style={css('display:flex;flex-direction:column;gap:8px;' + (compact ? 'flex-shrink:0;margin:12px 18px 0;' : ''))}>
      {ready.map((card) => (
        <div key={card.cardId} data-card-print={card.cardId} style={css('display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;background:var(--accent-soft);color:var(--accent);')}>
          <Icon name="gift" size={20} />
          <div style={css('flex:1;min-width:160px;')}>
            <div style={css('font-size:14.5px;font-weight:800;')}>{t('cards.printReady', { last4: card.last4, amount: money(card.amount) })}</div>
            <div style={css('font-size:12.5px;font-weight:600;margin-top:2px;')}>{t('cards.printOnce')}</div>
          </div>
          <button className="pos-press" disabled={busy} onClick={() => onPrint(card)} style={css('height:44px;padding:0 16px;border-radius:12px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:14px;font-weight:800;cursor:' + (busy ? 'wait' : 'pointer') + ';display:inline-flex;align-items:center;gap:8px;')}>
            <Icon name="printer" size={17} />
            {t('cards.print')}
          </button>
        </div>
      ))}
    </div>
  );
}
