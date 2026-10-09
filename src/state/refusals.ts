/**
 * A REFUSAL, IN PLAIN WORDS.
 *
 * Adminium refuses with a code and a reason (`ADJUST_REFUSED` · `over-ceiling`);
 * the person at the till reads a sentence. Each reason has its own, and a
 * reason this till does not know gets the plain "can't" of its kind — never
 * the code, and never a guess at why.
 */
import type { SinkError } from '../data/sink';
import { money, t } from '../i18n/ambient';

const has = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** Offers is attached and cannot answer: nothing that needs it is saved. */
export const unavailableWords = (): string => `${t('offers.unavailable')} ${t('offers.askOwner')}`;

/** A staff discount Offers would not give, or take off. */
export function discountRefusal(error: SinkError): string {
  if (error.kind === 'offline') return t('offers.discountOffline');
  switch (error.reason) {
    case 'over-ceiling':
      return has(error.details['max']) ? `${t('offers.overCeiling', { max: Number(error.details['max']) })} · ${t('offers.askManager')}` : `${t('offers.overCeilingPlain')} · ${t('offers.askManager')}`;
    case 'not-allowed':
      return t('offers.notAllowed');
    case 'add-on-unavailable':
      return unavailableWords();
    default:
      return t('toast.notSaved');
  }
}

/** A code or voucher Offers would not take. `needs-customer` is asked for on the ticket, with a button. */
export function codeRefusal(error: SinkError, code: string): string {
  if (error.kind === 'offline') return t('offers.applyOffline');
  switch (error.reason) {
    case 'unknown':
      return t('code.unknown', { code });
    case 'used-up':
      return t('code.usedUp', { code });
    case 'expired':
      return t('code.expired', { code });
    case 'inactive':
      return t('code.inactive', { code });
    case 'void':
      return t('code.void', { code });
    case 'not-yet':
      return t('code.notYet', { code });
    case 'over-limit':
      return t('code.overLimit', { code });
    case 'needs-minimum':
      return has(error.details['amount']) ? t('code.needsMinimum', { code, amount: money(Number(error.details['amount'])) }) : t('code.needsMinimumPlain', { code });
    case 'not-for-these-items':
      return t('code.notForItems', { code });
    case 'needs-customer':
      return t('code.needsCustomer', { code });
    case 'not-allowed':
      return t('offers.notAllowed');
    case 'add-on-unavailable':
      return unavailableWords();
    default:
      return t('code.refused', { code });
  }
}

/** A gift card that cannot pay. */
export function cardRefusal(error: SinkError): string {
  if (error.kind === 'offline') return t('cards.offline');
  switch (error.reason) {
    case 'not-valid':
      return t('cards.notValid');
    case 'inactive':
      return t('cards.inactive');
    case 'void':
      return t('cards.void');
    case 'expired':
      return t('cards.expired');
    case 'empty':
      return t('cards.empty');
    case 'card-pays-card':
      return t('cards.paysCard');
    case 'not-allowed':
      return t('cards.notAllowed');
    case 'add-on-unavailable':
      return unavailableWords();
    default:
      return t('cards.refused');
  }
}

/** A refund Adminium would not make: more than the payment took, most often. */
export function refundRefusal(error: SinkError): string {
  if (error.kind === 'offline') return t('refund.offline');
  if (error.reason === 'add-on-unavailable') return unavailableWords();
  const left = error.reason === 'refund-over' ? error.details['left'] : error.code === 'BALANCE_EXCEEDED' ? error.details['balance'] : undefined;
  if (has(left)) return t('refund.over', { amount: money(Number(left)) });
  if (error.reason === 'refund-over' || error.code === 'BALANCE_EXCEEDED') return t('refund.overPlain');
  return t('refund.refused');
}
