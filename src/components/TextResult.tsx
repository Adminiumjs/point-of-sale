import { useT, type MessageKey } from '../i18n';
import type { TextOutcome } from '../state/texts';
import { Icon } from './Icon';
import { css } from './css';

const WORDS: Record<TextOutcome, { key: MessageKey; icon: string; tone: string }> = {
  sending: { key: 'texts.sending', icon: 'loader-circle', tone: 'var(--fg-muted)' },
  sent: { key: 'texts.sent', icon: 'message-square-text', tone: 'var(--pos)' },
  'no-number': { key: 'texts.noNumber', icon: 'phone-off', tone: 'var(--fg-muted)' },
  'not-agreed': { key: 'texts.notAgreed', icon: 'message-square-x', tone: 'var(--fg-muted)' },
  'opted-out': { key: 'texts.optedOut', icon: 'message-square-x', tone: 'var(--fg-muted)' },
  limit: { key: 'texts.limit', icon: 'gauge', tone: 'var(--warn)' },
  unknown: { key: 'texts.unknown', icon: 'circle-help', tone: 'var(--warn)' },
  'not-set-up': { key: 'texts.notSetUp', icon: 'message-square-x', tone: 'var(--fg-muted)' },
  'bad-number': { key: 'texts.badNumber', icon: 'phone-off', tone: 'var(--fg-muted)' },
  'no-country': { key: 'texts.noCountry', icon: 'phone-off', tone: 'var(--fg-muted)' },
  'not-sent': { key: 'texts.notSent', icon: 'message-square-x', tone: 'var(--fg-muted)' },
};

/**
 * What became of a text the till asked for, in one small line (plan 80). It
 * never stops anyone: no dialog, no toast for a refusal, just the honest
 * result where the button was pressed, announced politely.
 */
export function TextResult({ outcome }: { outcome: TextOutcome | undefined }) {
  const t = useT();
  return (
    <div role="status" aria-live="polite" style={css('min-height:0;')}>
      {outcome !== undefined && (
        <div data-text-outcome={outcome} style={css('display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:' + WORDS[outcome].tone + ';')}>
          <Icon name={WORDS[outcome].icon} size={14} className={outcome === 'sending' ? 'pos-spin' : undefined} />
          <span>{t(WORDS[outcome].key)}</span>
        </div>
      )}
    </div>
  );
}

/** The label a text button carries while one is going. */
export const sendingLabel: MessageKey = 'texts.sending';
