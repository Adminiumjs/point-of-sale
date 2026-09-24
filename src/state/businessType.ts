/**
 * The till's service mode on a real install, from the shop's own settings.
 *
 * The manifest declares a `business_type` setting (restaurant or retail), and
 * Adminium serves its value in the staff config beside the bundle. The store
 * starts in restaurant mode, so without this a shop that chose retail still
 * opened on tables and covers — retail was reachable only from the demo card.
 *
 * Anything other than a known mode (no setting, an older Adminium that serves
 * none, a value from a later version) is `null`, and the till keeps its
 * default: a wrong guess would be worse than the mode it has always opened in.
 */
import type { ServiceMode } from '../data/types';

const MODES: readonly ServiceMode[] = ['restaurant', 'retail'];

type Settings = Readonly<Record<string, unknown>> | null | undefined;

export function serviceModeOf(settings: Settings): ServiceMode | null {
  const value = settings?.['business_type'];
  return typeof value === 'string' && (MODES as readonly string[]).includes(value) ? (value as ServiceMode) : null;
}

/** Put the till in the shop's mode, before the first paint; a missing or unknown one changes nothing. */
export function openInBusinessType(settings: Settings, till: { setMode: (mode: ServiceMode) => void }): void {
  const mode = serviceModeOf(settings);
  if (mode !== null) till.setMode(mode);
}
