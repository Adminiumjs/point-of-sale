import { useEffect } from 'react';
import { canManage, cardState, usePos } from '../state/store';
import { money } from '../state/calc';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { css } from './css';

/**
 * "Bring your gift cards into Offers" — shown to whoever runs the shop while
 * Offers & gift cards is connected and the till's own cards have not moved
 * yet. The figures are a count of the till's cards that hold money and what
 * they hold in all; Later puts it away for this session, Open goes to the
 * move.
 */
export function CardMoveBanner() {
  const s = usePos();
  const t = useT();
  const shown = cardState(s) === 2 && canManage(s) && s.connected && !s.cardMove.later && !s.cardMove.open;
  const load = s.loadCardMove;
  useEffect(() => {
    if (shown) void load();
  }, [shown, load]);
  if (!shown) return null;
  return <CardMoveStrip figures={s.cardMove.figures} onLater={s.laterCardMove} onOpen={() => s.openCardMove(true)} money={money} t={t} />;
}

/** The banner itself, given its figures. */
export function CardMoveStrip({
  figures,
  onLater,
  onOpen,
  money: fmt,
  t,
}: {
  figures: { count: number; cents: number } | null;
  onLater: () => void;
  onOpen: () => void;
  money: (n: number) => string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div role="region" aria-label={t('cards.bannerTitle')} style={css('flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 18px 0;padding:12px 14px;border-radius:14px;background:var(--accent-soft);color:var(--accent);')}>
      <Icon name="gift" size={20} />
      <div style={css('flex:1;min-width:180px;')}>
        <div style={css('font-size:14.5px;font-weight:800;')}>{t('cards.bannerTitle')}</div>
        {figures !== null && <div style={css('font-size:12.5px;font-weight:600;opacity:.9;margin-top:2px;')}>{t('cards.figures', { sum: fmt(figures.cents / 100) }, figures.count)}</div>}
      </div>
      <button className="pos-press" onClick={onLater} style={css('height:40px;padding:0 14px;border-radius:11px;border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);background:transparent;color:inherit;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;')}>
        {t('cards.later')}
      </button>
      <button className="pos-press" onClick={onOpen} style={css('height:40px;padding:0 16px;border-radius:11px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;')}>
        {t('cards.open')}
      </button>
    </div>
  );
}
