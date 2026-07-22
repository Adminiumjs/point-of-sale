import type { CSSProperties } from 'react';

// Converts a CSS declaration string ("padding:8px; border-radius:9px; …") into a
// React style object. Lets the port carry the comp's dynamic, state-driven
// inline styles almost verbatim (custom properties like --accent pass through).
export function css(input: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of input.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const rawProp = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!rawProp || !val) continue;
    const prop = rawProp.startsWith('--')
      ? rawProp
      : rawProp.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[prop] = val;
  }
  return out as unknown as CSSProperties;
}
