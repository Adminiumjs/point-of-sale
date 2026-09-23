/**
 * EVERY ICON THE TILL NAMES IS ONE IT CAN DRAW.
 *
 * `<Icon>` returns nothing for a name missing from its registry — no error, no
 * warning, just an empty button. Six of the new screens' icons were missing
 * that way (the till's menu button, the Reservations switcher) and only a
 * screenshot showed it. This reads every literal icon name in the source and
 * asks the registry for each.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { REGISTRY } from './Icon';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe('icons', () => {
  it('names only icons the registry has', () => {
    const missing = new Set<string>();
    const PATTERNS = [/<Icon\s+name="([a-z0-9-]+)"/g, /\b(?:icon|ic):\s*'([a-z0-9-]+)'/g];
    let seen = 0;
    const check = (name: string, file: string) => {
      seen += 1;
      if (REGISTRY[name] === undefined) missing.add(`${name} (${file.slice(SRC.length)})`);
    };
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of PATTERNS) for (const match of text.matchAll(pattern)) check(match[1]!, file);
      // `name={on ? 'log-out' : 'log-in'}`: the ternary's results, not what it compares.
      for (const expr of text.matchAll(/<Icon\s+name=\{([^}]*)\}/g)) {
        for (const match of expr[1]!.matchAll(/[?:]\s*'([a-z0-9-]+)'/g)) check(match[1]!, file);
      }
    }
    // A scan that found nothing would pass by silence.
    expect(seen).toBeGreaterThan(50);
    expect([...missing]).toEqual([]);
  });
});
