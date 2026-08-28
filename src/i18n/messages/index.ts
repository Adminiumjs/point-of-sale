/**
 * The message registry — one bundle per supported locale.
 *
 * `en.ts` is the source of truth: `MessageKey` is derived from it, and the
 * seven translations are typed `Translated<typeof enUS>`, so a key can never
 * exist in one bundle and be missing from another without the build failing —
 * unless en.ts marked it `en("…")`, which defers it deliberately and visibly.
 * The runtime still falls back to English per-key (see ../index.tsx) as a
 * belt-and-braces guard for bundles loaded from outside TypeScript's view.
 */
import type { LocaleTag } from '../locales';

import { enUS } from './en';
import { de } from './de';
import { fr } from './fr';
import { cs } from './cs';
import { da } from './da';
import { zhCn } from './zh-cn';
import { zhTw } from './zh-tw';
import { ar } from './ar';

/** Every key the app can ask for. Typos in `t('…')` are compile errors. */
export type MessageKey = keyof typeof enUS;

export const MESSAGES: Record<LocaleTag, Record<string, string>> = {
  'en-US': enUS,
  'de-DE': de,
  'fr-FR': fr,
  'cs-CZ': cs,
  'da-DK': da,
  'zh-CN': zhCn,
  'zh-TW': zhTw,
  'ar-EG': ar,
};

export { enUS };
