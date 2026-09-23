import { useState } from 'react';
import { usePos } from '../state/store';
import { money } from '../state/calc';
import { source } from '../data/source';
import { useI18n, useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader } from '../components/AuxHeader';
import { css } from '../components/css';
import type { GiftCardEntry } from '../data/types';

const MONO = "font-family:'JetBrains Mono',monospace;";

/** The comp's three reload amounts (COMP 2083), in the venue's own money. */
export const RELOADS = [10, 25, 50] as const;

const KIND: Record<GiftCardEntry['kind'], MessageKey> = {
  issue: 'gift.kind.issue',
  reload: 'gift.kind.reload',
  redeem: 'gift.kind.redeem',
  refund: 'gift.kind.refund',
  adjust: 'gift.kind.adjust',
};

/**
 * Gift cards (COMP 698-733, logic 2021-2023 / 2082-2085): look a card up,
 * see its balance and history, put money on it, pay the ticket from it, or
 * issue a new one.
 *
 * Beyond the comp (numbered in the plan's progress):
 *   W2-5 a code field finds the card (a scanner typing the code works too) —
 *        the comp shows one card and no way to reach another;
 *   W2-6 an amount is PUT ON THE TICKET, and the card is credited when the
 *        ticket is paid — money in before value out (the comp adds it at once);
 *        a new card waits, inactive, for the ticket that sells it;
 *   W2-7 "Apply to ticket" pays the ticket from the card as a payment of its
 *        own, and opens Payment for whatever is left;
 *   W2-8 empty states: no card chosen, a new card not yet paid for;
 *   W2-9 the card's gradient starts darker than the comp's (accent → 62%):
 *        white text on the dark theme's light accent was 2.4:1 at its top.
 */
export function GiftCards() {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  const [code, setCode] = useState('');
  const card = s.giftSel === null ? undefined : s.cards[s.giftSel];
  const onTicket = card === undefined ? undefined : s.ticket.items.find((x) => x.giftCard?.cardId === card.id)?.giftCard?.amount;
  const last = s.giftActivity[0];
  const when = (at: number) => (new Date(at).toDateString() === new Date().toDateString() ? t('loyalty.today') : date(new Date(at), { month: 'short', day: 'numeric' }));
  const signed = (amount: number) => (amount >= 0 ? '+' : '−') + money(Math.abs(amount));
  const busy = card === undefined || card.code === '';

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('gift.title')} sub={t('gift.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')} />
      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:24px;')}>
        <div style={css('display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;max-width:940px;margin:0 auto;')}>
          <div style={css('flex:1 1 320px;min-width:300px;display:flex;flex-direction:column;')}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void s.findGiftCard(code).then((ok) => ok && setCode(''));
              }}
              style={css('display:flex;gap:10px;margin-bottom:16px;')}
            >
              <div style={css('flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:52px;padding:0 15px;background:var(--surface);border:1px solid var(--border);border-radius:14px;')}>
                <Icon name="scan-line" size={18} color="var(--fg-subtle)" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('gift.codeHint')}
                  aria-label={t('gift.codeLabel')}
                  autoComplete="off"
                  style={css('flex:1;min-width:0;border:none;background:transparent;outline:none;font-size:15px;font-weight:600;color:var(--fg);letter-spacing:.04em;' + MONO)}
                />
              </div>
              <button type="submit" className="pos-press" disabled={s.giftBusy || code.trim() === ''} style={css('height:52px;padding:0 18px;border-radius:14px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;')}>
                {t('gift.find')}
              </button>
            </form>

            {card === undefined ? (
              <div style={css('border-radius:20px;padding:30px 26px;border:1.5px dashed var(--border-strong);background:var(--surface);text-align:center;color:var(--fg-muted);')}>
                <Icon name="gift" size={28} color="var(--fg-subtle)" />
                <div style={css('font-size:16px;font-weight:800;color:var(--fg);margin-top:10px;')}>{t('gift.noneTitle')}</div>
                <div style={css('font-size:13.5px;margin-top:6px;line-height:1.5;')}>{t('gift.noneBody')}</div>
              </div>
            ) : (
              <div style={css('border-radius:20px;padding:26px;background:linear-gradient(140deg, color-mix(in srgb, var(--accent) 62%, #000), color-mix(in srgb, var(--accent) 40%, #000));color:#fff;box-shadow:var(--shadow-lg);')}>
                <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                  <Icon name="gift" size={26} />
                  <span style={css('font-size:14px;font-weight:700;opacity:.9;')}>{source.brand()}</span>
                </div>
                <div style={css('font-size:13px;opacity:.85;margin-top:26px;')}>{t('gift.balance')}</div>
                <div style={css('font-size:46px;font-weight:800;letter-spacing:-.02em;line-height:1.05;' + MONO)}>{money(card.balance)}</div>
                <div style={css('font-size:14px;letter-spacing:.08em;margin-top:10px;opacity:.95;' + MONO)}>{card.code === '' ? t('gift.making') : card.code}</div>
                <div style={css('font-size:12px;opacity:.85;margin-top:6px;')}>
                  {card.status === 'inactive'
                    ? t('gift.notActive')
                    : card.status === 'void'
                      ? t('gift.void')
                      : last === undefined
                        ? t('gift.noActivity')
                        : t('gift.last', { what: t(KIND[last.kind]), amount: signed(last.amount), when: when(last.at) })}
                </div>
              </div>
            )}

            <div style={css('font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);margin:18px 0 10px;')}>{t('gift.reloadAmount')}</div>
            <div style={css('display:flex;gap:10px;')}>
              {RELOADS.map((v) => (
                <button
                  key={v}
                  className="pos-press"
                  disabled={busy || card?.status === 'void'}
                  onClick={() => s.loadGiftCard(v)}
                  aria-label={t('gift.loadName', { amount: money(v) })}
                  style={css('flex:1;height:56px;border-radius:14px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:16px;font-weight:800;cursor:' + (busy ? 'not-allowed' : 'pointer') + ';opacity:' + (busy ? '.55' : '1') + ';' + MONO)}
                >
                  +{money(v)}
                </button>
              ))}
            </div>
            {onTicket !== undefined && (
              <div role="status" style={css('display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:700;color:var(--pos);')}>
                <Icon name="check-circle-2" size={16} />
                {t('gift.onTicket', { amount: money(onTicket) })}
              </div>
            )}
            <div style={css('display:flex;gap:10px;margin-top:12px;')}>
              <button
                className="pos-press"
                disabled={card === undefined || card.status !== 'active'}
                onClick={s.payWithGiftCard}
                style={css('flex:1;height:58px;border-radius:15px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;opacity:' + (card === undefined || card.status !== 'active' ? '.55' : '1') + ';')}
              >
                <Icon name="ticket-check" size={18} />
                {t('gift.apply')}
              </button>
              <button className="pos-press" onClick={() => void s.issueGiftCard()} style={css('flex:1;height:58px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
                <Icon name="credit-card" size={18} />
                {t('gift.issue')}
              </button>
            </div>
          </div>

          <div style={css('flex:1 1 300px;min-width:280px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:20px 22px;')}>
            <div style={css('font-size:15px;font-weight:800;margin-bottom:14px;')}>{t('gift.activity')}</div>
            <div style={css('display:flex;flex-direction:column;gap:12px;')}>
              {s.giftActivity.length === 0 && <div style={css('font-size:13.5px;color:var(--fg-muted);')}>{t('gift.noActivityList')}</div>}
              {s.giftActivity.map((h) => {
                const pos = h.amount >= 0;
                return (
                  <div key={h.id} style={css('display:flex;align-items:center;gap:12px;')}>
                    <div aria-hidden="true" style={css('width:34px;height:34px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + (pos ? 'var(--pos-soft)' : 'var(--accent-soft)') + ';color:' + (pos ? 'var(--pos)' : 'var(--accent)') + ';')}>
                      <Icon name={pos ? 'arrow-down-left' : 'arrow-up-right'} size={16} />
                    </div>
                    <div style={css('flex:1;min-width:0;')}>
                      <div style={css('font-size:14.5px;font-weight:700;')}>{t(KIND[h.kind])}</div>
                      <div style={css('font-size:12px;color:var(--fg-muted);')}>{when(h.at)}</div>
                    </div>
                    <span style={css('font-size:15px;font-weight:800;' + MONO)}>{signed(h.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
