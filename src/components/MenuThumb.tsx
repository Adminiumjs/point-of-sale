import type { ReactNode } from 'react';
import type { MenuItem } from '../data/types';
import { catTint, hexToRgba } from '../state/calc';
import { css } from './css';

// Menu-item visual: a real product photo (object-fit: cover, lazy-loaded) laid
// over a subtle wash of the category tint. The tint shows through while the
// image loads and frames it with the same colour language as the old
// procedural placeholders. `overlay` stacks on top (Sold-out / mods badge).
export function MenuThumb({
  item,
  dark,
  radius,
  box,
  overlay,
}: {
  item: MenuItem;
  dark: boolean;
  /** Border radius for the thumb; pass '0' when a parent clips the corners. */
  radius: string;
  /** Extra layout css for the container (dimensions, flex-shrink, …). */
  box?: string;
  overlay?: ReactNode;
}) {
  const tint = catTint(item.cat);
  return (
    <div
      style={css(
        'position:relative;overflow:hidden;border-radius:' +
          radius +
          ';background:' +
          hexToRgba(tint, dark ? 0.24 : 0.12) +
          ';' +
          (box || ''),
      )}
    >
      <img
        src={item.image}
        alt={item.name}
        loading="lazy"
        style={css('width:100%;height:100%;object-fit:cover;display:block;')}
      />
      {overlay}
    </div>
  );
}
