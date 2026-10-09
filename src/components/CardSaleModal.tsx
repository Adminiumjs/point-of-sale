import { useState } from 'react';
import { isOffline, sellsNewCards, usePos, type TopUpCard } from '../state/store';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { WhyOff } from './Figures';
import { useDialog } from './useDialog';
import { css } from './css';

/** The amounts a card is most often sold or topped up for, in the venue's own money. */
const AMOUNTS = [10, 25, 50, 100] as const;
const MONO = "font-family:'JetBrains Mono',monospace;";

type Mode = 'sell' | 'topup';

/**
 * The gift card sheet (Offers & gift cards): sell a new card, or add money to
 * one the customer already holds.
 *
 * Either way it becomes a line on the ticket and Adminium puts the money on
 * the card when the ticket is paid — the sheet never adds a balance up.
 *
 * A NEW card is made by Offers when "Add card to ticket" is pressed. Making
 * one is a grant of its own (Offers' desk role's), so the session says who is
 * offered it; a plain cashier gets the top-up alone, and a line saying why.
 * A TOP-UP finds the card by its code, typed or scanned: Offers answers which
 * card it is and what it holds, and the typed code is kept nowhere.
 */
export function CardSaleModal() {
  const s = usePos();
  if (!s.cardSaleOpen) return null;
  return <CardSheet maySell={sellsNewCards(s)} off={isOffline(s)} onClose={() => s.setCardSale(false)} find={s.findCardToTopUp} sell={s.sellCard} topUp={s.topUpCard} />;
}

/** The sheet itself, given who is at the till and the three things it can ask for. */
export function CardSheet({
  maySell,
  off,
  onClose,
  find: findCard,
  sell,
  topUp,
}: {
  maySell: boolean;
  off: boolean;
  onClose: () => void;
  find: (code: string) => Promise<TopUpCard | { words: string }>;
  sell: (amount: number) => Promise<boolean>;
  topUp: (card: TopUpCard, amount: number) => boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(maySell ? 'sell' : 'topup');
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [card, setCard] = useState<TopUpCard | null>(null);
  const [words, setWords] = useState<string | null>(null);

  // Focus moves in and stays in; Escape closes it.
  const sheet = useDialog<HTMLDivElement>(onClose);

  const selling = mode === 'sell' && maySell;
  const ready = !busy && !off && amount !== null && (selling || card !== null);

  const find = () => {
    if (busy || code.trim() === '') return;
    setBusy(true);
    setWords(null);
    setCard(null);
    void findCard(code).then((answer) => {
      setBusy(false);
      // The code has done its work: it is not kept in the field either.
      setCode('');
      if ('words' in answer) setWords(answer.words);
      else setCard(answer);
    });
  };
  const add = () => {
    if (!ready || amount === null) return;
    if (selling) {
      setBusy(true);
      void sell(amount).finally(() => setBusy(false));
      return;
    }
    if (card !== null) topUp(card, amount);
  };
  const seg = (m: Mode, label: string) => {
    const on = mode === m;
    return (
      <button
        key={m}
        data-card-mode={m}
        role="radio"
        aria-checked={on}
        className="pos-press"
        onClick={() => {
          setMode(m);
          setWords(null);
        }}
        style={css('flex:1;height:44px;border-radius:11px;border:none;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:' + (on ? 'var(--surface)' : 'transparent') + ';color:' + (on ? 'var(--fg)' : 'var(--fg-muted)') + ';' + (on ? 'box-shadow:0 1px 3px rgba(10,10,20,.14);' : ''))}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <div onClick={onClose} style={css('position:absolute;inset:0;z-index:213;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="card-sheet-title" className="pos-scroll" style={css('position:absolute;inset-inline:0;bottom:0;z-index:214;background:var(--surface);border-radius:26px 26px 0 0;max-height:92%;overflow-y:auto;box-shadow:0 -12px 40px rgba(10,10,20,.24);animation:pos-sheet .3s cubic-bezier(.2,.8,.2,1);')}>
        <div style={css('max-width:560px;margin:0 auto;padding:10px 20px 22px;')}>
          <div aria-hidden="true" style={css('width:44px;height:5px;border-radius:3px;background:var(--border-strong);margin:0 auto 14px;')} />
          <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:16px;')}>
            <span style={css('width:46px;height:46px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);')}>
              <Icon name="gift" size={22} />
            </span>
            <div style={css('flex:1;min-width:0;')}>
              <div id="card-sheet-title" style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>
                {t('cards.title')}
              </div>
              <div style={css('font-size:13px;color:var(--fg-muted);margin-top:2px;')}>{t(selling ? 'cards.sellSub' : 'cards.topUpSub')}</div>
            </div>
            <button className="pos-press" onClick={onClose} aria-label={t('common.close')} style={css('width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
              <Icon name="x" size={19} />
            </button>
          </div>

          {maySell ? (
            <div role="radiogroup" aria-labelledby="card-sheet-title" style={css('display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--surface-3);margin-bottom:16px;')}>
              {seg('sell', t('cards.modeSell'))}
              {seg('topup', t('cards.modeTopUp'))}
            </div>
          ) : (
            // Not this person's to sell: said once, plainly, instead of a button that would be refused.
            <div data-sell-who="" role="note" style={css('display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:var(--surface-2);color:var(--fg-muted);font-size:13px;font-weight:600;margin-bottom:16px;')}>
              <Icon name="info" size={15} />
              {t('cards.sellWho')}
            </div>
          )}

          {!selling && (
            <div style={css('margin-bottom:16px;')}>
              {card === null ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    find();
                  }}
                  style={css('display:flex;gap:8px;')}
                >
                  <input
                    data-card-code=""
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t('cards.topUpCode')}
                    aria-label={t('cards.topUpCode')}
                    aria-describedby={words === null ? undefined : 'card-sheet-words'}
                    autoComplete="off"
                    disabled={off}
                    style={css('flex:1;min-width:0;height:52px;padding:0 14px;border-radius:13px;border:1.5px solid ' + (words === null ? 'var(--border-strong)' : 'var(--danger)') + ';background:var(--surface-2);color:var(--fg);font-size:15px;font-weight:600;outline:none;' + MONO)}
                  />
                  <button type="submit" className="pos-press" disabled={off || busy || code.trim() === ''} style={css('height:52px;padding:0 18px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:' + (off || code.trim() === '' ? 'var(--fg-subtle)' : 'var(--fg)') + ';font-family:inherit;font-size:14.5px;font-weight:800;cursor:' + (off ? 'not-allowed' : 'pointer') + ';')}>
                    {t(busy ? 'offers.checking' : 'cards.find')}
                  </button>
                </form>
              ) : (
                <div role="status" data-card-found={card.cardId} style={css('display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);')}>
                  <Icon name="check-circle-2" size={20} color="var(--pos)" />
                  <div style={css('flex:1;min-width:0;')}>
                    <div style={css('font-size:15px;font-weight:800;')}>{t('cards.kept', { last4: card.last4 })}</div>
                    {card.balance !== null && (
                      <div style={css('font-size:13px;color:var(--fg-muted);margin-top:2px;')}>
                        {t('cards.onCardNow', { amount: money(card.balance) })}
                      </div>
                    )}
                  </div>
                  <button className="pos-press" onClick={() => setCard(null)} aria-label={t('offers.removeLine', { name: t('cards.kept', { last4: card.last4 }) })} style={css('width:44px;height:44px;border-radius:12px;border:none;background:transparent;color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;')}>
                    <Icon name="x" size={17} />
                  </button>
                </div>
              )}
              {words !== null && (
                <div id="card-sheet-words" role="alert" style={css('font-size:13.5px;font-weight:700;color:var(--danger);margin-top:8px;')}>
                  {words}
                </div>
              )}
            </div>
          )}

          <div id="card-sheet-amount" style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-muted);margin-bottom:10px;')}>
            {t('cards.sellAmount')}
          </div>
          <div role="radiogroup" aria-labelledby="card-sheet-amount" style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;')}>
            {AMOUNTS.map((one) => {
              const on = amount === one;
              return (
                <button key={one} role="radio" data-card-amount={String(one)} aria-checked={on} className="pos-press" disabled={off} onClick={() => setAmount(one)} style={css('height:56px;border-radius:13px;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';color:' + (off ? 'var(--fg-subtle)' : on ? 'var(--accent)' : 'var(--fg)') + ';font-size:15.5px;font-weight:800;cursor:' + (off ? 'not-allowed' : 'pointer') + ';' + MONO)}>
                  {money(one)}
                </button>
              );
            })}
          </div>

          <div style={css('display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--fg-muted);margin-bottom:12px;')}>
            <Icon name="info" size={15} />
            {selling || amount === null ? t('cards.activeWhenPaid') : t('cards.loadWhenPaid', { amount: money(amount) })}
          </div>
          {/* A new card is printed by Offers on a ticket that lives ten minutes from the moment the card is made. */}
          {selling && (
            <div data-print-window="" style={css('font-size:12.5px;font-weight:600;color:var(--fg-muted);margin:-4px 0 12px;padding-inline-start:23px;')}>{t('cards.printWindow')}</div>
          )}
          <button data-card-add="" className="pos-press" disabled={!ready} onClick={add} style={css('width:100%;height:58px;border-radius:16px;border:none;font-family:inherit;font-size:16.5px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:12px;background:' + (ready ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (ready ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';cursor:' + (ready ? 'pointer' : 'not-allowed') + ';')}>
            <span>{t(selling ? 'cards.addCard' : 'cards.addTopUp')}</span>
            {amount !== null && <span style={css(MONO)}>{money(amount)}</span>}
          </button>
          {off && <WhyOff>{t('cards.sellOffline')}</WhyOff>}
        </div>
      </div>
    </>
  );
}
