/**
 * A barcode scanner, told apart from a person typing (wave 2, 55-T74; §9 O4).
 *
 * Most scanners are keyboards: they type the code, one character every few
 * milliseconds, and press Enter. A person types far slower. So a run of at
 * least MIN_LENGTH characters, each within MAX_GAP_MS of the one before, that
 * ends in Enter is a scan; anything slower is typing and is left alone.
 */
export const MAX_GAP_MS = 50;
export const MIN_LENGTH = 6;

export interface ScanDetector {
  /** Feed one key; returns the code when this key ended a scan. */
  key(key: string, at: number): string | null;
}

export function createScanDetector(opts: { maxGap?: number; minLength?: number } = {}): ScanDetector {
  const maxGap = opts.maxGap ?? MAX_GAP_MS;
  const minLength = opts.minLength ?? MIN_LENGTH;
  let buffer = '';
  let last = -Infinity;
  return {
    key(key, at) {
      const fast = at - last <= maxGap;
      last = at;
      if (key === 'Enter') {
        const code = fast ? buffer : '';
        buffer = '';
        return code.length >= minLength ? code : null;
      }
      // One printable character, or the run is broken.
      if (key.length !== 1) {
        buffer = '';
        return null;
      }
      buffer = fast ? buffer + key : key;
      return null;
    },
  };
}
