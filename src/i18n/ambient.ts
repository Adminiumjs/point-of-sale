/**
 * A module-level mirror of whatever locale the provider is currently rendering.
 *
 * Three places need `t()` / `money()` and cannot call a hook to get them: the
 * zustand store (toast copy is produced inside actions), `state/calc.ts` (the
 * money, table and modifier labels) and anything else that runs before React
 * does. Rather than duplicate the runtime, `<App>` pushes the provider's own
 * `t` / `money` / `number` in here on every render — so these forward to
 * exactly the functions the tree is using, and there is still one lookup table
 * and one set of `Intl` rules in the app.
 *
 * Before the provider mounts — module initialisation, and unit tests, which
 * render no React at all — the fallbacks below serve the English bundle and
 * `en-US` formatting.
 */
import { DEFAULT_LOCALE, type LocaleTag } from './locales';
import { MESSAGES, type MessageKey } from './messages';
import type { TFunction } from './index';

type MoneyFn = (value: number, currency?: string) => string;
type NumberFn = (value: number, opts?: Intl.NumberFormatOptions) => string;

/**
 * English-only `t`. Deliberately simpler than the runtime's: no locale to
 * resolve and only English's two plural categories, because by the time a
 * second locale is selectable the provider has mounted and replaced this.
 */
const fallbackT: TFunction = (key, params, count) => {
  let raw = MESSAGES[DEFAULT_LOCALE][key] ?? key;
  if (count !== undefined && raw.includes('|')) {
    const variants = raw.split('|');
    raw = count === 1 ? variants[0] : variants[variants.length - 1];
  }
  const all = count === undefined ? params : { count, ...params };
  if (!all) return raw;
  return raw.replace(/\{(\w+)\}/g, (m: string, name: string) =>
    name in all ? String(all[name as keyof typeof all]) : m,
  );
};

/**
 * The TENANT's currency — the shop's, not the reader's and not a default.
 *
 * Every figure on the till used to be formatted as `"USD"`, which was true of
 * the demo café and of nothing else: a hosted till over a database configured
 * for EUR would have rung up euros and printed dollar signs. The connection
 * carries the currency (28-T34); it lands here once, at boot.
 *
 * Held at module scope for the same reason the locale is: `state/calc.ts` and
 * the store format money outside React, where no hook reaches a provider.
 * `USD` remains the value before anything sets one — the demo has no tenant.
 */
let activeCurrency = 'USD';

/** Set once at boot from the snapshot. Anything but a three-letter code is ignored. */
export function setTenantCurrency(code: string | null | undefined): void {
  if (typeof code === 'string' && /^[A-Z]{3}$/.test(code)) activeCurrency = code;
}

/** The tenant's ISO-4217 code, for formatters given no explicit one. */
export const tenantCurrency = (): string => activeCurrency;

/**
 * The zone the till's clock renders in, and who chose it.
 *
 * `null` before anything sets it: the demo has no tenant and keeps the reader's
 * clock. Only the hosted session transport ever reports an unconfirmed source.
 */
let activeZone: { zone: string; source: 'operator' | 'host' | 'fallback' | null } | null = null;

/** Set once at boot, from the snapshot (which carries the transport's claim). */
export function setTimezoneClaim(zone: string, source: 'operator' | 'host' | 'fallback' | null): void {
  activeZone = { zone, source };
}

/** The tenant's IANA zone, or undefined in a build that has no tenant. */
export const tenantZone = (): string | undefined => activeZone?.zone;

/**
 * What the top bar should say about the zone, or `null` to say nothing.
 *
 * Only the two UNCONFIRMED sources produce a notice. An `operator` zone is a
 * decision and needs no announcement, and a missing source is no claim.
 */
export function timezoneNotice(): { zone: string; source: 'host' | 'fallback' } | null {
  if (activeZone === null) return null;
  const { zone, source } = activeZone;
  return source === 'host' || source === 'fallback' ? { zone, source } : null;
}

const fallbackMoney: MoneyFn = (value, currency = activeCurrency) =>
  new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency }).format(value);

const fallbackNumber: NumberFn = (value, opts) =>
  new Intl.NumberFormat(DEFAULT_LOCALE, opts).format(value);

let activeLocale: LocaleTag = DEFAULT_LOCALE;
let activeT: TFunction = fallbackT;
let activeMoney: MoneyFn = fallbackMoney;
let activeNumber: NumberFn = fallbackNumber;

/** Called by `<App>` on every render — cheap, idempotent, and always current. */
export function setAmbient(
  locale: LocaleTag,
  t: TFunction,
  money: MoneyFn,
  number: NumberFn,
): void {
  activeLocale = locale;
  activeT = t;
  activeMoney = money;
  activeNumber = number;
}

export const locale = (): LocaleTag => activeLocale;

export const t: TFunction = (key, params, count) => activeT(key, params, count);

export const money: MoneyFn = (value, currency) => activeMoney(value, currency);

export const number: NumberFn = (value, opts) => activeNumber(value, opts);

/**
 * Lookup for keys assembled at runtime from data (`'category.' + slug`), where
 * the compiler cannot check the key. Returns `fallback` — the raw English from
 * the seed — when the bundle has nothing for it, so unknown catalogue data
 * still renders instead of leaking a dotted key onto the screen.
 */
export function tOr(key: string, fallback: string): string {
  const hit = activeT(key as MessageKey, undefined, undefined);
  return hit === key ? fallback : hit;
}
